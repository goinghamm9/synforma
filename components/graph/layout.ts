import type { GraphEdge, GraphNode, NodeType } from "@/lib/synforma/types";
import { LAYER_COUNT, LAYER_OF, NODE_RADIUS } from "./constants";

/**
 * Layered, deterministic layout for the Work Graph.
 *
 * The vertical axis is semantic (node type → layer). Within a layer, x/z come from
 * a force-directed relaxation seeded by a hash of the node id, so the same graph
 * always produces the same picture. The relaxation is incremental: nodes that
 * already have a position are pinned, only new nodes move, so a growing graph
 * feels stable while discovery runs.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PositionMap = ReadonlyMap<string, Vec3>;

export interface Bounds {
  center: Vec3;
  radius: number;
  min: Vec3;
  max: Vec3;
}

export const LAYER_GAP = 2.6;

export function layerY(layer: number): number {
  return ((LAYER_COUNT - 1) / 2 - layer) * LAYER_GAP;
}

/** FNV-1a, 32-bit. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LayoutOptions {
  iterations?: number;
}

export function relaxLayout(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  previous: PositionMap,
  options: LayoutOptions = {},
): PositionMap {
  const n = nodes.length;
  const result = new Map<string, Vec3>();
  if (n === 0) return result;

  const index = new Map<string, number>();
  nodes.forEach((node, i) => index.set(node.id, i));

  const layer = new Int32Array(n);
  const radius = new Float32Array(n);
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  const movable: boolean[] = new Array<boolean>(n).fill(false);
  const layerCount = new Array<number>(LAYER_COUNT).fill(0);

  for (let i = 0; i < n; i++) {
    layer[i] = LAYER_OF[nodes[i].type] ?? 3;
    radius[i] = NODE_RADIUS[nodes[i].type] ?? 0.2;
    layerCount[layer[i]]++;
  }

  const adjacency: number[][] = Array.from({ length: n }, () => []);
  const pairs: [number, number][] = [];
  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    adjacency[a].push(b);
    adjacency[b].push(a);
    pairs.push([a, b]);
  }

  // Existing nodes keep their position (unless their layer changed).
  let movableCount = 0;
  for (let i = 0; i < n; i++) {
    const prev = previous.get(nodes[i].id);
    if (prev && Math.abs(prev.y - layerY(layer[i])) < 1e-6) {
      xs[i] = prev.x;
      zs[i] = prev.z;
    } else {
      movable[i] = true;
      movableCount++;
    }
  }
  if (movableCount === 0) {
    for (let i = 0; i < n; i++) result.set(nodes[i].id, { x: xs[i], y: layerY(layer[i]), z: zs[i] });
    return result;
  }

  // Seed new nodes near already-placed neighbours, else on a hash-seeded disc.
  const seeded: boolean[] = movable.map((m) => !m);
  for (let i = 0; i < n; i++) {
    if (!movable[i]) continue;
    const rng = mulberry32(hashString(nodes[i].id));
    let sx = 0;
    let sz = 0;
    let c = 0;
    for (const j of adjacency[i]) {
      if (seeded[j]) {
        sx += xs[j];
        sz += zs[j];
        c++;
      }
    }
    if (c > 0) {
      xs[i] = sx / c + (rng() - 0.5) * 2.4;
      zs[i] = sz / c + (rng() - 0.5) * 2.4;
    } else {
      const spread = Math.max(1.5, 1.05 * Math.sqrt(layerCount[layer[i]]));
      const angle = rng() * Math.PI * 2;
      const r = spread * Math.sqrt(rng());
      xs[i] = Math.cos(angle) * r;
      zs[i] = Math.sin(angle) * r;
    }
    seeded[i] = true;
  }

  const byLayer: number[][] = Array.from({ length: LAYER_COUNT }, () => []);
  for (let i = 0; i < n; i++) byLayer[layer[i]].push(i);

  const iterations = options.iterations ?? (movableCount === n ? 300 : 160);
  const fx = new Float64Array(n);
  const fz = new Float64Array(n);
  const CUTOFF2 = 4.5 * 4.5;

  for (let it = 0; it < iterations; it++) {
    const alpha = 1 - it / iterations;
    const step = 0.06 + 0.55 * alpha * alpha;
    fx.fill(0);
    fz.fill(0);

    // Repulsion within a layer (only pairs involving a movable node matter).
    for (let l = 0; l < LAYER_COUNT; l++) {
      const list = byLayer[l];
      for (let ia = 0; ia < list.length; ia++) {
        const a = list[ia];
        for (let ib = ia + 1; ib < list.length; ib++) {
          const b = list[ib];
          if (!movable[a] && !movable[b]) continue;
          let dx = xs[a] - xs[b];
          let dz = zs[a] - zs[b];
          let d2 = dx * dx + dz * dz;
          if (d2 > CUTOFF2) continue;
          if (d2 < 1e-8) {
            // Coincident: deterministic nudge.
            dx = (((a * 7919) % 13) - 6) / 100 || 0.01;
            dz = (((b * 104729) % 11) - 5) / 100 || -0.01;
            d2 = dx * dx + dz * dz;
          }
          const d = Math.sqrt(d2);
          const sep = (radius[a] + radius[b]) * 3 + 0.4;
          const mag = (0.38 * (radius[a] + radius[b])) / (d2 + 0.1) + (d < sep ? (sep - d) * 0.9 : 0);
          const ux = dx / d;
          const uz = dz / d;
          if (movable[a]) {
            fx[a] += ux * mag;
            fz[a] += uz * mag;
          }
          if (movable[b]) {
            fx[b] -= ux * mag;
            fz[b] -= uz * mag;
          }
        }
      }
    }

    // Attraction along edges: children gather under their parents.
    for (const [a, b] of pairs) {
      if (!movable[a] && !movable[b]) continue;
      const dx = xs[b] - xs[a];
      const dz = zs[b] - zs[a];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-4) continue;
      const sameLayer = layer[a] === layer[b];
      const rest = sameLayer ? 2.2 : 0.5;
      const k = sameLayer ? 0.015 : 0.06;
      const mag = k * (d - rest);
      const ux = dx / d;
      const uz = dz / d;
      if (movable[a]) {
        fx[a] += ux * mag;
        fz[a] += uz * mag;
      }
      if (movable[b]) {
        fx[b] -= ux * mag;
        fz[b] -= uz * mag;
      }
    }

    // Weak centring, then apply with a displacement cap.
    for (let i = 0; i < n; i++) {
      if (!movable[i]) continue;
      fx[i] -= xs[i] * 0.004;
      fz[i] -= zs[i] * 0.004;
      let mx = fx[i] * step;
      let mz = fz[i] * step;
      const m = Math.sqrt(mx * mx + mz * mz);
      if (m > 0.35) {
        mx *= 0.35 / m;
        mz *= 0.35 / m;
      }
      xs[i] += mx;
      zs[i] += mz;
    }
  }

  for (let i = 0; i < n; i++) result.set(nodes[i].id, { x: xs[i], y: layerY(layer[i]), z: zs[i] });
  return result;
}

/** Bounding box / sphere of the visible, positioned nodes. Null when nothing is visible. */
export function computeBounds(
  nodes: readonly GraphNode[],
  positions: PositionMap,
  visibleTypes: ReadonlySet<NodeType>,
  radii: Record<NodeType, number>,
): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let any = false;
  for (const node of nodes) {
    if (!visibleTypes.has(node.type)) continue;
    const p = positions.get(node.id);
    if (!p) continue;
    const r = radii[node.type] ?? 0.2;
    any = true;
    minX = Math.min(minX, p.x - r);
    minY = Math.min(minY, p.y - r);
    minZ = Math.min(minZ, p.z - r);
    maxX = Math.max(maxX, p.x + r);
    maxY = Math.max(maxY, p.y + r);
    maxZ = Math.max(maxZ, p.z + r);
  }
  if (!any) return null;
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  let radius = 0;
  for (const node of nodes) {
    if (!visibleTypes.has(node.type)) continue;
    const p = positions.get(node.id);
    if (!p) continue;
    const d = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z) + (radii[node.type] ?? 0.2);
    if (d > radius) radius = d;
  }
  return { center, radius: Math.max(radius, 1), min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}
