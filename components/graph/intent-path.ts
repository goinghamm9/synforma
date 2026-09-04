import type { GraphNode, WorkGraph } from "@/lib/synforma/types";

/**
 * The intent flow: objective → workflow → steps → their target screens → outcome.
 * Computed from edges only (workflow contains step; step targets screen; step
 * requires requirement; workflow produces outcome; workflow fulfills objective).
 */

export type IntentHopKind = "objective" | "workflow" | "step" | "screen" | "outcome";

export interface IntentHop {
  nodeId: string;
  kind: IntentHopKind;
  caption: string;
  detail?: string;
  /** Nodes lit alongside this hop (requirements of a step). */
  sideIds: string[];
}

function stepOrder(n: GraphNode): number {
  const idx = n.data?.index;
  if (typeof idx === "number") return idx;
  const m = /^(\d+)[.)]/.exec(n.label);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export function computeIntentPath(graph: WorkGraph): IntentHop[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const outOf = new Map<string, { to: string; type: string }[]>();
  const inOf = new Map<string, { from: string; type: string }[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    (outOf.get(e.from) ?? outOf.set(e.from, []).get(e.from)!).push({ to: e.to, type: e.type });
    (inOf.get(e.to) ?? inOf.set(e.to, []).get(e.to)!).push({ from: e.from, type: e.type });
  }

  const stepsOf = (wf: GraphNode): GraphNode[] =>
    (outOf.get(wf.id) ?? [])
      .filter((x) => x.type === "contains")
      .map((x) => byId.get(x.to)!)
      .filter((n) => n.type === "step")
      .sort((a, b) => stepOrder(a) - stepOrder(b));

  const workflows = graph.nodes.filter((n) => n.type === "workflow");
  if (!workflows.length) return [];
  let workflow = workflows[0];
  let best = -1;
  for (const wf of workflows) {
    const count = stepsOf(wf).length;
    if (count > best) {
      best = count;
      workflow = wf;
    }
  }

  const adjacent = (id: string) => [
    ...(outOf.get(id) ?? []).map((x) => ({ id: x.to, type: x.type })),
    ...(inOf.get(id) ?? []).map((x) => ({ id: x.from, type: x.type })),
  ];

  const hops: IntentHop[] = [];
  const objective = adjacent(workflow.id).map((x) => byId.get(x.id)!).find((n) => n.type === "objective") ?? graph.nodes.find((n) => n.type === "objective");
  if (objective) hops.push({ nodeId: objective.id, kind: "objective", caption: objective.label, sideIds: [] });
  hops.push({ nodeId: workflow.id, kind: "workflow", caption: workflow.label, detail: workflow.description, sideIds: [] });

  let lastScreen: string | null = null;
  for (const step of stepsOf(workflow)) {
    const requirements = (outOf.get(step.id) ?? [])
      .filter((x) => x.type === "requires")
      .map((x) => byId.get(x.to)!)
      .filter((n) => n.type === "requirement");
    const mode = typeof step.data?.mode === "string" ? step.data.mode : null;
    const detailParts = [mode ? `mode: ${mode}` : null, requirements.length ? `requires ${requirements.length} requirement${requirements.length === 1 ? "" : "s"}` : null].filter(Boolean);
    hops.push({ nodeId: step.id, kind: "step", caption: step.label, detail: detailParts.join(" · ") || undefined, sideIds: requirements.map((r) => r.id) });
    const screen = (outOf.get(step.id) ?? [])
      .filter((x) => x.type === "targets")
      .map((x) => byId.get(x.to)!)
      .find((n) => n.type === "screen");
    if (screen && screen.id !== lastScreen) {
      const route = typeof screen.data?.route === "string" ? screen.data.route : undefined;
      hops.push({ nodeId: screen.id, kind: "screen", caption: screen.label, detail: route, sideIds: [] });
      lastScreen = screen.id;
    }
  }

  const outcomes = (outOf.get(workflow.id) ?? [])
    .filter((x) => x.type === "produces")
    .map((x) => byId.get(x.to)!)
    .filter((n) => n.type === "outcome")
    .slice(0, 3);
  for (const o of outcomes) hops.push({ nodeId: o.id, kind: "outcome", caption: o.label, detail: o.description, sideIds: [] });

  return hops;
}
