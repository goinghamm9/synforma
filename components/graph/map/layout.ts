import dagre from "@dagrejs/dagre";
import type { NodeType } from "@/lib/synforma/types";
import type { Lens, MapEdge, MapNode, ProcessMapModel } from "./model";

/**
 * Layered left-to-right layout for the process map. Deterministic: the same
 * model always yields the same positions.
 *
 * The main lane (people, roles, objectives, workflows, steps, outcomes; every
 * node of the Application lens) is ranked by dagre. Satellites hang off their
 * anchors in lanes above (requirements, policies, interventions) and below
 * (the screens a step touches), packed into rows so nothing overlaps. Extra
 * screens ("Show all screens") fill a grid under the lowest lane.
 */

export type HandleSide = "l" | "r" | "t" | "b";

export interface LaidOutNode extends MapNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge extends MapEdge {
  sourceHandle: HandleSide;
  targetHandle: HandleSide;
  /** Points against the flow (a backtrack): drawn as an arc over the top. */
  back: boolean;
}

export interface ProcessLayout {
  lens: Lens;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
  model: ProcessMapModel;
}

export const NODE_SIZE: Record<NodeType, { width: number; height: number }> = {
  objective: { width: 196, height: 66 },
  workflow: { width: 204, height: 56 },
  step: { width: 204, height: 72 },
  screen: { width: 196, height: 76 },
  requirement: { width: 188, height: 46 },
  outcome: { width: 196, height: 66 },
  application: { width: 188, height: 56 },
  object: { width: 160, height: 46 },
  role: { width: 160, height: 46 },
  person: { width: 160, height: 46 },
  policy: { width: 188, height: 46 },
  intervention: { width: 188, height: 46 },
  capability: { width: 160, height: 46 },
  action: { width: 160, height: 40 },
  field: { width: 160, height: 40 },
};

const NODESEP = 28;
const RANKSEP = 48;
const LANE_GAP = 56;
const ROW_GAP = 12;
const COL_GAP = 16;
const EXTRA_GAP = 64;
const MARGIN = 24;

export function nodeSize(n: MapNode, lens: Lens): { width: number; height: number } {
  const base = NODE_SIZE[n.type];
  if (lens === "runs" && n.runs) {
    if (n.type === "step") return { width: base.width, height: base.height + 22 };
    if (n.type === "screen" || n.type === "outcome" || n.type === "objective") return { width: base.width, height: base.height + 14 };
  }
  if (lens === "evidence") return { width: base.width, height: base.height + 14 };
  return base;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function layoutMain(nodes: MapNode[], edges: MapEdge[], sizes: Map<string, Box>): void {
  if (!nodes.length) return;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: NODESEP, ranksep: RANKSEP, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of [...nodes].sort(byId)) {
    const s = sizes.get(n.id)!;
    g.setNode(n.id, { width: s.width, height: s.height });
  }
  // The intended path defines the ranks; observed back edges do not.
  for (const e of [...edges].sort(byId)) {
    if (e.kind === "traffic" || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  for (const n of nodes) {
    const p = g.node(n.id);
    const s = sizes.get(n.id)!;
    s.x = p.x - s.width / 2;
    s.y = p.y - s.height / 2;
  }
}

interface Row {
  y: number;
  items: { x1: number; x2: number }[];
}

/**
 * Pack satellites into rows near their anchors: the first row is closest to the main lane; a satellite
 * sits centred on its anchor, else one slot to the left or right of it, else it drops to the next row.
 */
function layoutSatellites(sats: MapNode[], sizes: Map<string, Box>, mainBoxes: Box[], dir: -1 | 1, startY: number): number {
  if (!sats.length) return startY;
  const fallbackX = mainBoxes.length ? Math.max(...mainBoxes.map((b) => b.x + b.width)) + RANKSEP : 0;
  const anchored = sats.map((n) => {
    const anchors = n.anchorIds.map((id) => sizes.get(id)).filter((b): b is Box => Boolean(b));
    const cx = anchors.length ? anchors.reduce((a, b) => a + b.x + b.width / 2, 0) / anchors.length : fallbackX;
    return { n, cx };
  });
  anchored.sort((a, b) => a.cx - b.cx || (a.n.label < b.n.label ? -1 : a.n.label > b.n.label ? 1 : 0) || byId(a.n, b.n));
  const rowH = Math.max(...sats.map((n) => sizes.get(n.id)!.height));
  const rows: Row[] = [];
  const rowY = (k: number) => (dir === -1 ? startY - rowH - k * (rowH + ROW_GAP) : startY + k * (rowH + ROW_GAP));
  for (const { n, cx } of anchored) {
    const s = sizes.get(n.id)!;
    const desired = cx - s.width / 2;
    let placed = false;
    const slot = s.width + COL_GAP;
    const candidates = [desired, desired - slot, desired + slot, desired - 2 * slot, desired + 2 * slot];
    for (let k = 0; k < rows.length + 1 && !placed; k += 1) {
      if (k === rows.length) rows.push({ y: rowY(k), items: [] });
      const row = rows[k];
      const free = (x: number) => !row.items.some((it) => x < it.x2 + COL_GAP && x + s.width + COL_GAP > it.x1);
      const x = candidates.find(free);
      if (x !== undefined) {
        row.items.push({ x1: x, x2: x + s.width });
        s.x = x;
        s.y = row.y + (dir === -1 ? rowH - s.height : 0);
        placed = true;
      }
    }
  }
  const last = rows[rows.length - 1];
  return dir === -1 ? last.y : last.y + rowH;
}

function layoutExtra(extra: MapNode[], sizes: Map<string, Box>, startY: number, maxWidth: number): void {
  if (!extra.length) return;
  const sorted = [...extra].sort((a, b) => (a.route ?? a.label).localeCompare(b.route ?? b.label) || byId(a, b));
  let x = 0;
  let y = startY;
  let rowH = 0;
  for (const n of sorted) {
    const s = sizes.get(n.id)!;
    if (x > 0 && x + s.width > maxWidth) {
      x = 0;
      y += rowH + ROW_GAP;
      rowH = 0;
    }
    s.x = x;
    s.y = y;
    x += s.width + COL_GAP;
    rowH = Math.max(rowH, s.height);
  }
}

function handlesFor(s: Box, t: Box): { sourceHandle: HandleSide; targetHandle: HandleSide; back: boolean } {
  if (t.y >= s.y + s.height - 1) return { sourceHandle: "b", targetHandle: "t", back: false };
  if (t.y + t.height <= s.y + 1) return { sourceHandle: "t", targetHandle: "b", back: false };
  if (t.x >= s.x + s.width - 1) return { sourceHandle: "r", targetHandle: "l", back: false };
  if (t.x + t.width <= s.x + 1) return { sourceHandle: "t", targetHandle: "t", back: true };
  return { sourceHandle: "b", targetHandle: "t", back: false };
}

export function layoutProcessMap(model: ProcessMapModel): ProcessLayout {
  const sizes = new Map<string, Box>();
  for (const n of model.nodes) sizes.set(n.id, { x: 0, y: 0, ...nodeSize(n, model.lens) });

  const main = model.nodes.filter((n) => n.lane === "main");
  const above = model.nodes.filter((n) => n.lane === "above");
  const below = model.nodes.filter((n) => n.lane === "below");
  const extra = model.nodes.filter((n) => n.lane === "extra");
  const mainIds = new Set(main.map((n) => n.id));

  layoutMain(main, model.edges.filter((e) => mainIds.has(e.source) && mainIds.has(e.target)), sizes);
  const mainBoxes = main.map((n) => sizes.get(n.id)!);
  const mainTop = mainBoxes.length ? Math.min(...mainBoxes.map((b) => b.y)) : 0;
  const mainBottom = mainBoxes.length ? Math.max(...mainBoxes.map((b) => b.y + b.height)) : 0;
  const mainRight = mainBoxes.length ? Math.max(...mainBoxes.map((b) => b.x + b.width)) : 0;

  layoutSatellites(above, sizes, mainBoxes, -1, mainTop - LANE_GAP);
  const belowEnd = layoutSatellites(below, sizes, mainBoxes, 1, mainBottom + LANE_GAP);
  layoutExtra(extra, sizes, (below.length ? belowEnd : mainBottom) + EXTRA_GAP, Math.max(mainRight, 1100));

  // Normalise to a margin so the top-left node sits at (MARGIN, MARGIN).
  const boxes = [...sizes.values()];
  const minX = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
  const minY = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  for (const b of boxes) {
    b.x = Math.round(b.x - minX + MARGIN);
    b.y = Math.round(b.y - minY + MARGIN);
  }
  const width = boxes.length ? Math.max(...boxes.map((b) => b.x + b.width)) + MARGIN : 0;
  const height = boxes.length ? Math.max(...boxes.map((b) => b.y + b.height)) + MARGIN : 0;

  const nodes: LaidOutNode[] = model.nodes.map((n) => ({ ...n, ...sizes.get(n.id)! }));
  const edges: LaidOutEdge[] = model.edges
    .filter((e) => sizes.has(e.source) && sizes.has(e.target))
    .map((e) => ({ ...e, ...handlesFor(sizes.get(e.source)!, sizes.get(e.target)!) }));
  return { lens: model.lens, nodes, edges, width, height, model };
}
