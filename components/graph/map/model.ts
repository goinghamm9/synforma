import type { Claim, EdgeType, ExecutionMode, GraphEdge, GraphNode, NodeType, Program, Run, RunEvent, TrustState, WorkGraph } from "@/lib/synforma/types";
import { nodeId } from "@/lib/synforma/graph/work-graph";
import { TRUST_LABEL } from "@/lib/synforma/engine/evidence";
import { computeIntentPath } from "../intent-path";

/**
 * The process map model: a 2D, layered reading of the Work Graph.
 *
 * Pure functions only. `augmentGraph` adds the objective and the outcome a
 * discovered graph lacks (both stated by the organization in the program);
 * `buildProcessMap` derives the nodes and edges one lens shows, with the
 * intended path marked as the happy path and, for the Runs lens, the traffic,
 * friction and self-healing observed in stored events.
 */

export type Lens = "workflow" | "application" | "runs" | "evidence";

export const LENSES: readonly { value: Lens; label: string; hint: string }[] = [
  { value: "workflow", label: "Workflow", hint: "Objective, numbered steps, the screens they touch, the outcome" },
  { value: "application", label: "Application", hint: "Every discovered screen, laid out by navigation" },
  { value: "runs", label: "Runs", hint: "The workflow with observed traffic, friction and self-healing" },
  { value: "evidence", label: "Evidence", hint: "The workflow coloured by how Synforma knows each node" },
];

export type MapEdgeKind = "path" | "navigation" | "structural" | "traffic";

/** Tone per trust state, plus "contested" for a requirement nothing fulfils and "illustrative" for the sample. */
export type TrustTone = "live" | "approved" | "observed" | "inferred" | "contested" | "unknown" | "illustrative";

/** Legend wording per tone, taken from the engine's own trust labels (lib/synforma/engine/evidence.ts). */
export const TRUST_TONE_LABEL: Record<TrustTone, string> = {
  live: TRUST_LABEL.AUTHORITATIVE_LIVE,
  approved: TRUST_LABEL.ORGANIZATION_APPROVED,
  observed: TRUST_LABEL.OBSERVED_HIGH_CONFIDENCE,
  inferred: TRUST_LABEL.MODEL_INFERRED,
  contested: "Contested",
  unknown: TRUST_LABEL.UNKNOWN,
  illustrative: "Illustrative",
};

/** What a node prints on the Evidence lens: its exact trust state, with "Contested" in front when a claim about it is contested. */
export function nodeTrustText(n: Pick<MapNode, "trust" | "trustState">): string {
  const state = n.trustState ? TRUST_LABEL[n.trustState] : null;
  if (n.trust === "contested") return state ? `Contested · ${state}` : "Contested";
  if (n.trust === "illustrative") return TRUST_TONE_LABEL.illustrative;
  return state ?? TRUST_TONE_LABEL[n.trust];
}

export type FrictionKind =
  | "hesitation"
  | "validation_error"
  | "backtrack"
  | "wrong_screen"
  | "visual_search"
  | "decision_uncertainty"
  | "knowledge_gap"
  | "policy_uncertainty"
  | "error_recovery"
  | "workflow_friction"
  | "time_pressure";

export const FRICTION_KIND_LABEL: Record<FrictionKind, string> = {
  hesitation: "Hesitation",
  validation_error: "Validation error",
  backtrack: "Backtrack",
  wrong_screen: "Wrong screen",
  visual_search: "Visual search",
  decision_uncertainty: "Decision uncertainty",
  knowledge_gap: "Knowledge gap",
  policy_uncertainty: "Policy uncertainty",
  error_recovery: "Error recovery",
  workflow_friction: "Workflow friction",
  time_pressure: "Time pressure",
};

/** Inferred friction states that count as friction (FLUENT and UNKNOWN do not). */
const FRICTION_STATE_KIND: Record<string, FrictionKind> = {
  VISUAL_SEARCH: "visual_search",
  DECISION_UNCERTAINTY: "decision_uncertainty",
  WORKFLOW_KNOWLEDGE_GAP: "knowledge_gap",
  POLICY_UNCERTAINTY: "policy_uncertainty",
  ERROR_RECOVERY: "error_recovery",
  WORKFLOW_FRICTION: "workflow_friction",
  TIME_PRESSURE: "time_pressure",
};

export interface RunStats {
  /** Runs that entered this step or screen. */
  visits: number;
  /** Runs that completed this step (or, for the outcome, the workflow). */
  completed: number;
  /** Runs whose last entered step was this one and that did not complete. */
  dropOffs: number;
  friction: Partial<Record<FrictionKind, number>>;
  frictionTotal: number;
  /** Actions re-grounded on this step: the self-healing count. */
  regroundings: number;
  /** Median step_entered → step_completed across runs, or null. */
  medianMs: number | null;
}

export type MapLane = "main" | "above" | "below" | "extra";

export interface MapNode {
  id: string;
  node: GraphNode;
  type: NodeType;
  label: string;
  sublabel?: string;
  /** 0-based, for steps. */
  stepIndex?: number;
  mode?: ExecutionMode;
  commit?: boolean;
  judgment?: boolean;
  route?: string;
  dialog?: string;
  counts?: { actions: number; fields: number };
  trust: TrustTone;
  trustState?: TrustState;
  onPath: boolean;
  lane: MapLane;
  /** Main-lane nodes a satellite attaches to. */
  anchorIds: string[];
  runs?: RunStats;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  kind: MapEdgeKind;
  edgeType?: EdgeType;
  label?: string;
  happy: boolean;
  traffic?: number;
}

export interface ProcessMapModel {
  lens: Lens;
  nodes: MapNode[];
  edges: MapEdge[];
  /** Node ids along the intended path, in order. */
  happyPath: string[];
  /** Screens the workflow lens leaves out (shown by "Show all screens"). */
  hiddenScreens: number;
  /** Runs of the program that the Runs lens read. */
  runCount: number;
  maxTraffic: number;
}

export interface ProcessMapInput {
  graph: WorkGraph;
  program: Program | null;
  runs: Run[];
  events: RunEvent[];
  claims?: Claim[];
  lens: Lens;
  showAllScreens?: boolean;
  /** The graph is the hand-written sample: every node is illustrative. */
  sample?: boolean;
}

// ───────────────────────────── augmentation ─────────────────────────────

const DERIVED = "program";

/**
 * A discovered graph holds the workflow, its steps, screens, actions, fields,
 * objects and requirements, but not the objective nor the outcome: both are
 * stated by the organization in the program. Add them so the map can read
 * objective → steps → outcome. Returns the same reference when nothing is added.
 */
export function augmentGraph(graph: WorkGraph, program: Program | null): WorkGraph {
  const wf = program?.workflow;
  if (!program || !wf) return graph;
  const wfNodeId = nodeId("workflow", wf.id);
  if (!graph.nodes.some((n) => n.id === wfNodeId)) return graph;
  const hasObjective = graph.nodes.some((n) => n.type === "objective");
  const hasOutcome = graph.nodes.some((n) => n.type === "outcome");
  if (hasObjective && hasOutcome) return graph;

  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const observedAt = program.createdAt;
  if (!hasObjective) {
    const id = nodeId("objective", program.id);
    const parsed = program.parsed;
    nodes.push({
      id,
      type: "objective",
      label: parsed?.title ?? program.title,
      description: program.objectiveText,
      confidence: parsed?.confidence ?? 1,
      status: "confirmed",
      discoveredAt: observedAt,
      provenance: { source: "objective", trust: "ORGANIZATION_APPROVED", observedAt },
      data: { derived: DERIVED, population: parsed?.population, targetBehavior: parsed?.targetBehavior, requirements: parsed?.requirements.length ?? 0 },
    });
    edges.push({ id: `fulfills:${wfNodeId}->${id}`, from: wfNodeId, to: id, type: "fulfills" });
  }
  if (!hasOutcome) {
    const id = nodeId("outcome", program.id);
    const success = program.parsed?.successDefinition?.trim();
    nodes.push({
      id,
      type: "outcome",
      label: success || "Workflow outcome",
      description: wf.outcomeRoutePattern ? `Verified on ${wf.outcomeRoutePattern}: the requirements are checked on the outcome screen.` : "Verified on the outcome screen.",
      confidence: 1,
      status: "confirmed",
      discoveredAt: observedAt,
      provenance: { source: "objective", trust: "ORGANIZATION_APPROVED", observedAt },
      data: { derived: DERIVED, successCriteria: wf.successCriteria, outcomeRoute: wf.outcomeRoutePattern ?? null },
    });
    edges.push({ id: `produces:${wfNodeId}->${id}`, from: wfNodeId, to: id, type: "produces" });
  }
  return { ...graph, nodes, edges };
}

// ───────────────────────────── helpers ─────────────────────────────

interface Index {
  byId: Map<string, GraphNode>;
  out: Map<string, GraphEdge[]>;
  inc: Map<string, GraphEdge[]>;
}

function indexGraph(graph: WorkGraph): Index {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, GraphEdge[]>();
  const inc = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);
    (inc.get(e.to) ?? inc.set(e.to, []).get(e.to)!).push(e);
  }
  return { byId, out, inc };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function stepIndexOf(n: GraphNode): number | undefined {
  const idx = n.data?.index;
  if (typeof idx === "number") return idx;
  const m = /^(\d+)[.)]/.exec(n.label);
  return m ? Number(m[1]) - 1 : undefined;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function trustToneOf(node: GraphNode, opts: { sample?: boolean; contested?: boolean }): TrustTone {
  if (opts.contested) return "contested";
  if (opts.sample) return "illustrative";
  const t = node.provenance?.trust;
  switch (t) {
    case "AUTHORITATIVE_LIVE":
    case "AUTHORITATIVE_METADATA":
      return "live";
    case "ORGANIZATION_APPROVED":
      return "approved";
    case "VENDOR_DOCUMENTED":
    case "OBSERVED_HIGH_CONFIDENCE":
    case "OBSERVED_LOW_CONFIDENCE":
      return "observed";
    case "MODEL_INFERRED":
      return "inferred";
    default:
      return "unknown";
  }
}

function toMapNode(n: GraphNode, lane: MapLane, opts: { sample?: boolean; contested?: boolean; onPath?: boolean; anchorIds?: string[] }): MapNode {
  const d = n.data ?? {};
  const mode = str(d.mode);
  const m: MapNode = {
    id: n.id,
    node: n,
    type: n.type,
    label: n.label,
    trust: trustToneOf(n, opts),
    trustState: n.provenance?.trust,
    onPath: Boolean(opts.onPath),
    lane,
    anchorIds: opts.anchorIds ?? [],
  };
  if (n.type === "step") {
    m.stepIndex = stepIndexOf(n);
    if (mode === "guide" || mode === "assist" || mode === "act") m.mode = mode;
    m.commit = d.commit === true;
    m.judgment = d.judgment === true;
    m.label = n.label.replace(/^\d+[.)]\s*/, "");
  } else if (n.type === "screen") {
    m.route = str(d.route) ?? str(d.pattern);
    m.dialog = str(d.dialog);
    m.counts = { actions: num(d.actions), fields: num(d.fields) };
    m.sublabel = m.route;
  } else if (n.type === "application") {
    m.sublabel = str(d.baseUrl);
  } else if (n.type === "object") {
    const attrs = Array.isArray(d.attributes) ? d.attributes.length : 0;
    m.sublabel = attrs ? `${attrs} attribute${attrs === 1 ? "" : "s"}` : undefined;
  } else if (n.type === "workflow") {
    const steps = num(d.steps);
    m.sublabel = steps ? `${steps} step${steps === 1 ? "" : "s"}` : undefined;
  } else if (n.type === "requirement") {
    m.judgment = d.judgment === true;
    m.sublabel = str(d.kind);
  } else if (n.type === "intervention") {
    m.sublabel = [str(d.technique), str(d.status)].filter(Boolean).join(" · ") || undefined;
  }
  return m;
}

/** Ids of requirement nodes nothing fulfils, plus nodes with a contested claim. */
function contestedIds(graph: WorkGraph, idx: Index, claims: Claim[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const n of graph.nodes) {
    if (n.type !== "requirement") continue;
    const fulfilled = (idx.inc.get(n.id) ?? []).some((e) => e.type === "fulfills");
    if (!fulfilled) out.add(n.id);
  }
  for (const c of claims ?? []) if (c.status === "contested" && idx.byId.has(c.subject)) out.add(c.subject);
  return out;
}

// ───────────────────────────── the happy path ─────────────────────────────

interface Spine {
  objectiveId: string | null;
  workflowId: string | null;
  stepIds: string[];
  outcomeIds: string[];
  /** Screen per step (targets edge), in step order; null when a step has no screen. */
  screenOfStep: (string | null)[];
  pathScreenIds: string[];
}

function spineOf(graph: WorkGraph, idx: Index): Spine {
  const hops = computeIntentPath(graph);
  const stepIds = hops.filter((h) => h.kind === "step").map((h) => h.nodeId);
  const screenOfStep = stepIds.map((sid) => (idx.out.get(sid) ?? []).find((e) => e.type === "targets" && idx.byId.get(e.to)?.type === "screen")?.to ?? null);
  const pathScreenIds: string[] = [];
  for (const s of screenOfStep) if (s && !pathScreenIds.includes(s)) pathScreenIds.push(s);
  return {
    objectiveId: hops.find((h) => h.kind === "objective")?.nodeId ?? null,
    workflowId: hops.find((h) => h.kind === "workflow")?.nodeId ?? null,
    stepIds,
    outcomeIds: hops.filter((h) => h.kind === "outcome").map((h) => h.nodeId),
    screenOfStep,
    pathScreenIds,
  };
}

// ───────────────────────────── runs ─────────────────────────────

interface RunReading {
  byStepNode: Map<string, RunStats>;
  /** Observed transitions between step nodes: "a->b" → run count. */
  transitions: Map<string, number>;
  runCount: number;
  completedRuns: number;
  enteredFirst: number;
}

function emptyStats(): RunStats {
  return { visits: 0, completed: 0, dropOffs: 0, friction: {}, frictionTotal: 0, regroundings: 0, medianMs: null };
}

/** Map every workflow step id to its graph node: nodeId(step, wf, step) first, "N. title" as fallback. */
function stepNodeMap(program: Program, idx: Index): Map<string, string> {
  const map = new Map<string, string>();
  const wf = program.workflow;
  if (!wf) return map;
  for (const st of wf.steps) {
    const direct = nodeId("step", wf.id, st.id);
    if (idx.byId.has(direct)) {
      map.set(st.id, direct);
      continue;
    }
    const label = `${st.index + 1}. ${st.title}`;
    const byLabel = [...idx.byId.values()].find((n) => n.type === "step" && n.label === label);
    if (byLabel) map.set(st.id, byLabel.id);
  }
  return map;
}

function readRuns(program: Program, runs: Run[], events: RunEvent[], idx: Index): RunReading {
  const mine = runs.filter((r) => r.programId === program.id);
  const runIds = new Set(mine.map((r) => r.id));
  const stepNode = stepNodeMap(program, idx);
  const byStepNode = new Map<string, RunStats>();
  const statsFor = (stepId: string | undefined): RunStats | null => {
    if (!stepId) return null;
    const nid = stepNode.get(stepId);
    if (!nid) return null;
    let s = byStepNode.get(nid);
    if (!s) {
      s = emptyStats();
      byStepNode.set(nid, s);
    }
    return s;
  };
  const entered = new Map<string, Map<string, number>>(); // run → stepNode → first entered t
  const completedAt = new Map<string, Map<string, number>>(); // run → stepNode → last completed t
  const sequence = new Map<string, string[]>(); // run → ordered step nodes entered
  const sorted = events.filter((e) => runIds.has(e.runId)).sort((a, b) => a.t - b.t);
  for (const e of sorted) {
    const s = statsFor(e.stepId);
    const nid = e.stepId ? stepNode.get(e.stepId) : undefined;
    switch (e.type) {
      case "step_entered": {
        if (!nid) break;
        const seq = sequence.get(e.runId) ?? sequence.set(e.runId, []).get(e.runId)!;
        if (seq[seq.length - 1] !== nid) seq.push(nid);
        const ent = entered.get(e.runId) ?? entered.set(e.runId, new Map()).get(e.runId)!;
        if (!ent.has(nid)) ent.set(nid, e.t);
        break;
      }
      case "step_completed": {
        if (!nid) break;
        const done = completedAt.get(e.runId) ?? completedAt.set(e.runId, new Map()).get(e.runId)!;
        done.set(nid, e.t);
        break;
      }
      case "hesitation":
      case "validation_error":
      case "backtrack":
      case "wrong_screen": {
        if (!s) break;
        s.friction[e.type] = (s.friction[e.type] ?? 0) + 1;
        s.frictionTotal += 1;
        break;
      }
      case "friction_inferred": {
        if (!s) break;
        const kind = FRICTION_STATE_KIND[String(e.data?.state ?? "")];
        if (!kind) break;
        s.friction[kind] = (s.friction[kind] ?? 0) + 1;
        s.frictionTotal += 1;
        break;
      }
      case "action_regrounded": {
        if (!s) break;
        s.regroundings += 1;
        break;
      }
      default:
        break;
    }
  }

  const durations = new Map<string, number[]>();
  const transitions = new Map<string, number>();
  let enteredFirst = 0;
  const firstStep = program.workflow?.steps[0] ? stepNode.get(program.workflow.steps[0].id) : undefined;
  for (const run of mine) {
    const ent = entered.get(run.id) ?? new Map<string, number>();
    const done = completedAt.get(run.id) ?? new Map<string, number>();
    for (const [nid, t0] of ent) {
      const s = byStepNode.get(nid) ?? emptyStats();
      byStepNode.set(nid, s);
      s.visits += 1;
      const t1 = done.get(nid);
      if (t1 !== undefined) {
        s.completed += 1;
        if (t1 >= t0) (durations.get(nid) ?? durations.set(nid, []).get(nid)!).push(t1 - t0);
      }
    }
    if (firstStep && ent.has(firstStep)) enteredFirst += 1;
    const seq = sequence.get(run.id) ?? [];
    for (let i = 1; i < seq.length; i += 1) {
      const key = `${seq[i - 1]}->${seq[i]}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
    }
    const finished = run.outcome === "abandoned" || run.outcome === "failed";
    if (finished && seq.length) {
      const last = byStepNode.get(seq[seq.length - 1]);
      if (last) last.dropOffs += 1;
    }
  }
  for (const [nid, xs] of durations) {
    const s = byStepNode.get(nid);
    if (s) s.medianMs = median(xs);
  }
  return { byStepNode, transitions, runCount: mine.length, completedRuns: mine.filter((r) => r.outcome === "completed").length, enteredFirst };
}

// ───────────────────────────── lenses ─────────────────────────────

function edgeId(kind: MapEdgeKind, from: string, to: string, edgeType?: string): string {
  return `${kind}:${edgeType ?? "x"}:${from}->${to}`;
}

/** The workflow lens; the Runs and Evidence lenses layer onto it. */
function buildWorkflowLens(input: ProcessMapInput, idx: Index, spine: Spine, contested: Set<string>): ProcessMapModel {
  const { graph, sample, showAllScreens } = input;
  const nodes = new Map<string, MapNode>();
  const edges: MapEdge[] = [];
  const add = (n: GraphNode, lane: MapLane, opts: { onPath?: boolean; anchorIds?: string[] } = {}) => {
    const existing = nodes.get(n.id);
    if (existing) {
      if (opts.anchorIds) for (const a of opts.anchorIds) if (!existing.anchorIds.includes(a)) existing.anchorIds.push(a);
      if (opts.onPath) existing.onPath = true;
      return existing;
    }
    const m = toMapNode(n, lane, { sample, contested: contested.has(n.id), ...opts });
    nodes.set(n.id, m);
    return m;
  };
  const link = (kind: MapEdgeKind, from: string, to: string, e?: GraphEdge, happy = false, label?: string) => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    const id = edgeId(kind, from, to, e?.type);
    if (edges.some((x) => x.id === id)) return;
    edges.push({ id, source: from, target: to, kind, edgeType: e?.type, label: label ?? e?.label, happy });
  };

  const onPath = new Set<string>([spine.objectiveId, spine.workflowId, ...spine.stepIds, ...spine.outcomeIds].filter((x): x is string => Boolean(x)));

  // Main lane: people → roles → objectives → (workflows without steps) → steps → outcomes. The main
  // workflow, whose steps form the chain, sits above its first step as the chain's header.
  const headerWorkflow = spine.workflowId && spine.stepIds.length ? spine.workflowId : null;
  for (const n of graph.nodes) {
    if (n.id === headerWorkflow) continue;
    if (n.type === "person" || n.type === "role" || n.type === "objective" || n.type === "workflow" || n.type === "outcome") add(n, "main", { onPath: onPath.has(n.id) });
  }
  for (const sid of spine.stepIds) {
    const n = idx.byId.get(sid);
    if (n) add(n, "main", { onPath: true });
  }
  if (headerWorkflow) {
    const n = idx.byId.get(headerWorkflow);
    if (n) add(n, "above", { onPath: true, anchorIds: [spine.stepIds[0]] });
  }
  // Steps of other workflows (rare) stay attached to their workflow.
  for (const n of graph.nodes) {
    if (n.type !== "step" || nodes.has(n.id)) continue;
    add(n, "main");
  }

  // Path edges along the main lane.
  for (const e of graph.edges) {
    const a = idx.byId.get(e.from);
    const b = idx.byId.get(e.to);
    if (!a || !b) continue;
    if (e.type === "assigned_to" && a.type === "person" && b.type === "role") link("path", a.id, b.id, e);
    else if (e.type === "targets" && a.type === "role" && b.type === "objective") link("path", a.id, b.id, e);
    else if (e.type === "fulfills" && a.type === "workflow" && b.type === "objective") {
      if (a.id === headerWorkflow) link("structural", b.id, a.id, e, false, "fulfilled by");
      else link("path", b.id, a.id, e, false, "fulfilled by");
    }
    // outcome → objective ("fulfils") would close a loop over the whole map; the detail panel lists it instead.
    else if (e.type === "produces" && a.type === "workflow" && b.type === "outcome") {
      // The main workflow reaches its outcome through its last step; other workflows link directly.
      if (a.id === spine.workflowId && spine.stepIds.length) continue;
      link("path", a.id, b.id, e, false, "produces");
    }
  }
  if (headerWorkflow) {
    if (spine.objectiveId) link("path", spine.objectiveId, spine.stepIds[0], undefined, true);
    link("structural", headerWorkflow, spine.stepIds[0], undefined, false, "contains");
    for (let i = 1; i < spine.stepIds.length; i += 1) link("path", spine.stepIds[i - 1], spine.stepIds[i], undefined, true);
    const last = spine.stepIds[spine.stepIds.length - 1];
    for (const o of spine.outcomeIds) link("path", last, o, undefined, true);
  }
  for (const n of graph.nodes) {
    if (n.type !== "step" || spine.stepIds.includes(n.id)) continue;
    const wf = (idx.inc.get(n.id) ?? []).find((e) => e.type === "contains" && idx.byId.get(e.from)?.type === "workflow");
    if (wf) link("path", wf.from, n.id, wf);
  }

  // Above: requirements of steps, policies of workflows, interventions addressing steps.
  for (const e of graph.edges) {
    const a = idx.byId.get(e.from);
    const b = idx.byId.get(e.to);
    if (!a || !b) continue;
    if (e.type === "requires" && a.type === "step" && b.type === "requirement" && nodes.has(a.id)) {
      add(b, "above", { anchorIds: [a.id] });
      link("structural", a.id, b.id, e, false, "requires");
    } else if (e.type === "constrained_by" && b.type === "policy" && nodes.has(a.id)) {
      add(b, "above", { anchorIds: [a.id] });
      link("structural", a.id, b.id, e, false, "constrained by");
    } else if (e.type === "addresses" && a.type === "intervention" && nodes.has(b.id)) {
      add(a, "above", { anchorIds: [b.id] });
      link("structural", a.id, b.id, e, false, "addresses");
    }
  }
  // Requirements no step requires (the objective states them) attach to the objective.
  for (const n of graph.nodes) {
    if (n.type !== "requirement" || nodes.has(n.id)) continue;
    const anchor = spine.objectiveId ?? spine.workflowId;
    if (!anchor) continue;
    add(n, "above", { anchorIds: [anchor] });
    link("structural", anchor, n.id, undefined, false, "states");
  }

  // Below: the screens each step touches.
  for (const sid of spine.stepIds) {
    for (const e of idx.out.get(sid) ?? []) {
      const b = idx.byId.get(e.to);
      if (e.type === "targets" && b?.type === "screen") {
        add(b, "below", { anchorIds: [sid], onPath: true });
        link("structural", sid, b.id, e, false, "on");
      }
    }
  }
  for (const n of graph.nodes) {
    if (n.type !== "step" || spine.stepIds.includes(n.id) || !nodes.has(n.id)) continue;
    for (const e of idx.out.get(n.id) ?? []) {
      const b = idx.byId.get(e.to);
      if (e.type === "targets" && b?.type === "screen") {
        add(b, "below", { anchorIds: [n.id] });
        link("structural", n.id, b.id, e, false, "on");
      }
    }
  }

  // Every other screen: hidden unless asked for.
  const otherScreens = graph.nodes.filter((n) => n.type === "screen" && !nodes.has(n.id));
  if (showAllScreens) {
    for (const n of otherScreens) add(n, "extra");
  }
  // Navigation among the screens that are on the map.
  for (const e of graph.edges) {
    if (e.type !== "navigates_to") continue;
    const a = idx.byId.get(e.from);
    const b = idx.byId.get(e.to);
    if (!a || !b || b.type !== "screen" || !nodes.has(b.id)) continue;
    const from = a.type === "screen" ? a.id : a.type === "action" ? screenOfAction(a, idx) : null;
    if (!from || from === b.id || !nodes.has(from)) continue;
    link("navigation", from, b.id, e, false, e.label ?? (a.type === "action" ? a.label : undefined));
  }

  const happyPath = [spine.objectiveId, spine.workflowId, ...spine.stepIds, ...spine.outcomeIds].filter((x): x is string => Boolean(x));
  return { lens: "workflow", nodes: [...nodes.values()], edges, happyPath, hiddenScreens: showAllScreens ? 0 : otherScreens.length, runCount: 0, maxTraffic: 0 };
}

function screenOfAction(a: GraphNode, idx: Index): string | null {
  const s = str(a.data?.screen);
  if (s && idx.byId.get(s)?.type === "screen") return s;
  const parent = (idx.inc.get(a.id) ?? []).find((e) => e.type === "contains" && idx.byId.get(e.from)?.type === "screen");
  if (parent) return parent.from;
  // Actions revealed by a menu button live on the button's screen.
  const via = (idx.inc.get(a.id) ?? []).find((e) => e.type === "reveals");
  if (via) {
    const owner = idx.byId.get(via.from);
    if (owner?.type === "action") return screenOfAction(owner, idx);
    if (owner?.type === "screen") return owner.id;
  }
  return null;
}

/** The discovered structure: application → screens by navigation, objects beside the screens that use them. */
function buildApplicationLens(input: ProcessMapInput, idx: Index, spine: Spine, contested: Set<string>): ProcessMapModel {
  const { graph, sample } = input;
  const nodes = new Map<string, MapNode>();
  const edges: MapEdge[] = [];
  const pathScreens = new Set(spine.pathScreenIds);
  for (const n of graph.nodes) {
    if (n.type === "application") nodes.set(n.id, toMapNode(n, "main", { sample, contested: contested.has(n.id) }));
    else if (n.type === "screen") nodes.set(n.id, toMapNode(n, "main", { sample, contested: contested.has(n.id), onPath: pathScreens.has(n.id) }));
  }
  for (const n of graph.nodes) {
    if (n.type !== "object") continue;
    const users = (idx.inc.get(n.id) ?? []).filter((e) => e.type === "uses" && nodes.has(e.from));
    if (users.length) nodes.set(n.id, toMapNode(n, "main", { sample, contested: contested.has(n.id) }));
  }
  const link = (kind: MapEdgeKind, from: string, to: string, e?: GraphEdge, happy = false, label?: string) => {
    if (!nodes.has(from) || !nodes.has(to) || from === to) return;
    const id = edgeId(kind, from, to, e?.type);
    const existing = edges.find((x) => x.id === id);
    if (existing) {
      if (happy) existing.happy = true;
      if (!existing.label && label) existing.label = label;
      return;
    }
    edges.push({ id, source: from, target: to, kind, edgeType: e?.type, label: label ?? e?.label, happy });
  };
  const consecutive = new Set<string>();
  for (let i = 1; i < spine.pathScreenIds.length; i += 1) consecutive.add(`${spine.pathScreenIds[i - 1]}->${spine.pathScreenIds[i]}`);
  for (const e of graph.edges) {
    const a = idx.byId.get(e.from);
    const b = idx.byId.get(e.to);
    if (!a || !b) continue;
    if (e.type === "navigates_to" && b.type === "screen") {
      const from = a.type === "screen" ? a.id : a.type === "action" ? screenOfAction(a, idx) : null;
      if (!from) continue;
      link("navigation", from, b.id, e, consecutive.has(`${from}->${b.id}`), e.label ?? (a.type === "action" ? a.label : undefined));
    } else if (e.type === "uses" && a.type === "screen" && b.type === "object") {
      link("structural", a.id, b.id, e, false, e.label ?? "uses");
    }
  }
  // The application enters at screens nothing navigates to (or its base route).
  const incomingNav = new Set(edges.filter((e) => e.kind === "navigation").map((e) => e.target));
  for (const app of graph.nodes.filter((n) => n.type === "application")) {
    const contained = (idx.out.get(app.id) ?? []).filter((e) => e.type === "contains" && idx.byId.get(e.to)?.type === "screen").map((e) => e.to);
    let roots = contained.filter((id) => !incomingNav.has(id));
    if (!roots.length) {
      const base = str(app.data?.baseUrl);
      roots = contained.filter((id) => {
        const r = str(idx.byId.get(id)?.data?.route);
        return Boolean(base && r && (base === r || base.endsWith(r)));
      });
    }
    if (!roots.length && contained.length) roots = [contained[0]];
    for (const r of roots) link("structural", app.id, r, undefined, false, "entry");
  }
  return { lens: "application", nodes: [...nodes.values()], edges, happyPath: spine.pathScreenIds, hiddenScreens: 0, runCount: 0, maxTraffic: 0 };
}

function overlayRuns(model: ProcessMapModel, input: ProcessMapInput, idx: Index, spine: Spine): ProcessMapModel {
  const { program, runs, events } = input;
  if (!program) return { ...model, lens: "runs", runCount: 0 };
  const reading = readRuns(program, runs, events, idx);
  const nodes = model.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  for (const n of nodes) {
    if (n.type === "step") n.runs = reading.byStepNode.get(n.id) ?? emptyStats();
    else if (n.type === "objective" || n.type === "workflow") n.runs = { ...emptyStats(), visits: reading.runCount, completed: reading.completedRuns };
    else if (n.type === "outcome" && n.onPath) n.runs = { ...emptyStats(), visits: reading.completedRuns, completed: reading.completedRuns };
  }
  // Screens aggregate the steps that touch them (distinct runs, summed friction).
  for (const n of nodes) {
    if (n.type !== "screen") continue;
    const stepsHere = n.anchorIds.map((id) => byId.get(id)).filter((s): s is MapNode => Boolean(s && s.type === "step"));
    if (!stepsHere.length) continue;
    const agg = emptyStats();
    for (const s of stepsHere) {
      const r = s.runs;
      if (!r) continue;
      agg.visits = Math.max(agg.visits, r.visits);
      agg.completed = Math.max(agg.completed, r.completed);
      agg.dropOffs += r.dropOffs;
      agg.regroundings += r.regroundings;
      agg.frictionTotal += r.frictionTotal;
      for (const [k, v] of Object.entries(r.friction) as [FrictionKind, number][]) agg.friction[k] = (agg.friction[k] ?? 0) + v;
    }
    n.runs = agg;
  }

  const edges = model.edges.map((e) => ({ ...e }));
  const stepSet = new Set(spine.stepIds);
  let maxTraffic = 0;
  for (const e of edges) {
    if (e.kind !== "path") continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    let t: number | undefined;
    if (a.type === "step" && b.type === "step") t = reading.transitions.get(`${a.id}->${b.id}`) ?? 0;
    else if ((a.type === "objective" || a.type === "workflow") && b.type === "step") t = reading.enteredFirst;
    else if (a.type === "step" && b.type === "outcome") t = reading.completedRuns;
    if (t !== undefined) {
      e.traffic = t;
      maxTraffic = Math.max(maxTraffic, t);
    }
  }
  // Observed transitions the intended sequence does not contain (backtracks, skips).
  for (const [key, count] of reading.transitions) {
    const [from, to] = key.split("->");
    if (!stepSet.has(from) || !stepSet.has(to) || !byId.has(from) || !byId.has(to)) continue;
    const i = spine.stepIds.indexOf(from);
    const j = spine.stepIds.indexOf(to);
    if (j === i + 1) continue;
    const id = edgeId("traffic", from, to);
    if (edges.some((e) => e.id === id)) continue;
    edges.push({ id, source: from, target: to, kind: "traffic", happy: false, traffic: count, label: j < i ? "back" : "skip" });
    maxTraffic = Math.max(maxTraffic, count);
  }
  return { ...model, lens: "runs", nodes, edges, runCount: reading.runCount, maxTraffic };
}

export function buildProcessMap(input: ProcessMapInput): ProcessMapModel {
  const idx = indexGraph(input.graph);
  const spine = spineOf(input.graph, idx);
  const contested = contestedIds(input.graph, idx, input.claims);
  switch (input.lens) {
    case "application":
      return buildApplicationLens(input, idx, spine, contested);
    case "runs":
      return overlayRuns(buildWorkflowLens(input, idx, spine, contested), input, idx, spine);
    case "evidence":
      return { ...buildWorkflowLens(input, idx, spine, contested), lens: "evidence" };
    default:
      return buildWorkflowLens(input, idx, spine, contested);
  }
}

/** Remove hidden node types (the layer toggles) and the edges that touch them. */
export function applyLayers(model: ProcessMapModel, hidden: ReadonlySet<NodeType>): ProcessMapModel {
  if (!hidden.size) return model;
  const nodes = model.nodes.filter((n) => !hidden.has(n.type));
  const keep = new Set(nodes.map((n) => n.id));
  return { ...model, nodes, edges: model.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

/** Node types a model shows, with counts, in Work Graph display order. */
export function typeCounts(model: ProcessMapModel): Partial<Record<NodeType, number>> {
  const c: Partial<Record<NodeType, number>> = {};
  for (const n of model.nodes) c[n.type] = (c[n.type] ?? 0) + 1;
  return c;
}
