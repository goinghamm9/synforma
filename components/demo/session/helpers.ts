import { useSynforma } from "@/lib/synforma/store";
import { bumpVersion } from "@/lib/synforma/engine/demonstration";
import { plannerLabel } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import type { PageModel, PlannerKind, Program, WorkGraph, Workflow } from "@/lib/synforma/types";
import type { ConnectionInfo, LogLevel, LogLine, PhaseId } from "../types";
import type { DiscoveryState } from "../phases/discover-panel";
import type { ActState } from "../phases/act-panel";
import type { SynthState } from "../phases/guide-panel";

/** Pure helpers and initial states shared by the Mission Control session hooks. */

export const EMPTY_COUNTERS = { screens: 0, actions: 0, fields: 0, objects: 0, states: 0 };

export const INITIAL_DISCOVERY: DiscoveryState = { status: "idle", log: [], counters: EMPTY_COUNTERS, stats: null, error: null, startedAt: null, planned: null };
export const INITIAL_ACT: ActState = { status: "idle", runId: null, log: [], result: null, currentStepId: null, stepStatus: {}, startedAt: null, endedAt: null, error: null, regroundings: 0, uiVariant: null, changes: [], trustStop: null };
export const INITIAL_SYNTH: SynthState = { status: "idle", currentPersonaId: null, completed: 0, error: null };

export const MAX_LOG = 400;

let logSeq = 0;

/** A log line with a session-unique id (discovery and act logs share one sequence). */
export function mkLine(level: LogLevel, message: string): LogLine {
  return { id: ++logSeq, t: Date.now(), level, message };
}

/** Append a line, keeping the log bounded to MAX_LOG entries. */
export function appendLog(log: LogLine[], line: LogLine): LogLine[] {
  return log.length >= MAX_LOG ? [...log.slice(log.length - MAX_LOG + 1), line] : [...log, line];
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function summarizePage(page: PageModel): ConnectionInfo {
  return {
    url: page.url,
    title: page.title,
    heading: page.heading,
    headings: page.headings,
    landmarks: page.landmarks,
    actions: page.actions.length,
    fields: page.fields.length,
    elements: page.elements.length,
    tables: page.tables.length,
    sampleActions: Array.from(new Set(page.actions.map((a) => a.name))).slice(0, 10),
  };
}

export function plannerLabelFor(kind: PlannerKind | null, status: PlannerStatus | null): string {
  if (!kind) return "Resolving planner…";
  if (kind !== "heuristic") return plannerLabel(kind, status);
  return status?.configured ? "Heuristic planner — by preference" : "Heuristic planner — no API key configured";
}

export function maxPhaseIndex(program: Program | null, connected: boolean): number {
  if (!program) return connected ? 1 : 0;
  if (program.status === "discovering" || program.status === "draft" || program.status === "paused") return 2;
  if (program.status === "understood") return 3;
  return 7;
}

export function defaultPhaseFor(program: Program): PhaseId {
  if (program.status === "active") return "act";
  if (program.status === "understood") return "understand";
  if (program.status === "discovering") return "discover";
  return "objective";
}

export function patchProgram(id: string, patch: Partial<Program>) {
  const s = useSynforma.getState();
  const current = s.programs[id];
  if (!current) return;
  s.upsertProgram({ ...current, ...patch });
}

/**
 * Workflow versioning: "1.0" with a changelog entry at first planning; bumped on every re-plan
 * (the previous changelog is carried over). Machine-discovered process knowledge starts as "discovered".
 */
export function versionWorkflow(workflow: Workflow, previous: Workflow | undefined, planner: PlannerKind, replanned: boolean): Workflow {
  const version = previous?.version ? bumpVersion(previous.version) : "1.0";
  const reason = previous ? (replanned ? `Re-planned from the existing discovery by the ${planner} planner` : `Re-discovered and re-planned by the ${planner} planner`) : `Inferred from discovery by the ${planner} planner`;
  return {
    ...workflow,
    version,
    origin: "discovery",
    changelog: [...(previous?.changelog ?? []), { version, at: Date.now(), reason, source: previous ? "re-plan" : "discovery" }],
    governance: { status: "discovered" },
  };
}

/** Remove planner-produced nodes so a re-plan starts from the discovered structure only. */
export function stripPlan(graph: WorkGraph): WorkGraph {
  const drop = new Set(graph.nodes.filter((n) => n.type === "workflow" || n.type === "step" || n.type === "requirement").map((n) => n.id));
  return { ...graph, nodes: graph.nodes.filter((n) => !drop.has(n.id)), edges: graph.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)) };
}
