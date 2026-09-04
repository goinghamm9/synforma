"use client";
/**
 * Scene internals for WorkGraph3D. Everything here lives inside the R3F Canvas.
 *
 * Rendering budget (300 nodes / 400 edges at 60fps):
 *   - node bodies: one InstancedMesh (+ one BackSide InstancedMesh for hypothesis rims)
 *   - edges: one LineSegments with vertex colours (gently curved, 6 segments per edge)
 *   - flow particles: one InstancedMesh, at most 48 instances
 *   - labels: drei <Html>, capped, only for focus nodes and a configurable set of types
 * Instance matrices are only rewritten while something is animating.
 */
import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Html } from "@react-three/drei/web/Html";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { GraphEdge, GraphNode, NodeType } from "@/lib/synforma/types";
import { COLORS, LAYER_COUNT, LAYER_NAMES, LAYER_OF, NODE_RADIUS, TYPE_LABEL } from "./constants";
import { hashString, layerY, type Bounds, type PositionMap } from "./layout";

export interface GraphSceneProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  nodeById: ReadonlyMap<string, GraphNode>;
  positions: PositionMap;
  bounds: Bounds | null;
  visibleTypes: ReadonlySet<NodeType>;
  selectedId: string | null;
  hoveredId: string | null;
  /** Highlighted node ids in path order. */
  highlightOrder: readonly string[];
  labelTypes: ReadonlySet<NodeType>;
  compact: boolean;
  reducedMotion: boolean;
  fitTick: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const SEG = 6;
const MAX_PARTICLES = 48;
const MAX_ACTIVE_EDGES = 32;
const MAX_TYPE_LABELS = 44;

const C = {
  ink: new THREE.Color(COLORS.ink),
  graphite: new THREE.Color(COLORS.graphite),
  signal: new THREE.Color(COLORS.signal),
  hypothesisFill: new THREE.Color(COLORS.hypothesisFill),
  hypothesisRim: new THREE.Color(COLORS.hypothesisRim),
  edge: new THREE.Color(COLORS.edge),
  edgeDim: new THREE.Color(COLORS.edgeDim),
  edgeHalf: new THREE.Color(COLORS.edgeHalf),
};

const HIDDEN = new THREE.Matrix4().compose(new THREE.Vector3(0, -1000, 0), new THREE.Quaternion(), new THREE.Vector3(0.0001, 0.0001, 0.0001));
const noRaycast = () => null;

interface EdgeCurve {
  edge: GraphEdge;
  /** (SEG + 1) sampled points, xyz interleaved. */
  points: Float32Array;
}

interface ActiveEdge {
  points: Float32Array;
  reversed: boolean;
  id: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function buildCurves(
  edges: readonly GraphEdge[],
  positions: PositionMap,
  nodeById: ReadonlyMap<string, GraphNode>,
  visibleTypes: ReadonlySet<NodeType>,
): EdgeCurve[] {
  const out: EdgeCurve[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const ctrl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  for (const edge of edges) {
    const na = nodeById.get(edge.from);
    const nb = nodeById.get(edge.to);
    if (!na || !nb || !visibleTypes.has(na.type) || !visibleTypes.has(nb.type)) continue;
    const pa = positions.get(edge.from);
    const pb = positions.get(edge.to);
    if (!pa || !pb) continue;
    a.set(pa.x, pa.y, pa.z);
    b.set(pb.x, pb.y, pb.z);
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) continue;
    dir.divideScalar(len);
    perp.crossVectors(dir, up);
    if (perp.lengthSq() < 1e-4) perp.crossVectors(dir, right);
    perp.normalize();
    const sign = hashString(edge.id) & 1 ? 1 : -1;
    const offset = Math.min(0.35, len * 0.12) * sign;
    ctrl.addVectors(a, b).multiplyScalar(0.5).addScaledVector(perp, offset);
    const points = new Float32Array((SEG + 1) * 3);
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const mt = 1 - t;
      const w0 = mt * mt;
      const w1 = 2 * mt * t;
      const w2 = t * t;
      points[s * 3] = w0 * a.x + w1 * ctrl.x + w2 * b.x;
      points[s * 3 + 1] = w0 * a.y + w1 * ctrl.y + w2 * b.y;
      points[s * 3 + 2] = w0 * a.z + w1 * ctrl.z + w2 * b.z;
    }
    out.push({ edge, points });
  }
  return out;
}

function activeEdgesFor(curves: readonly EdgeCurve[], highlightOrder: readonly string[], selectedId: string | null): ActiveEdge[] {
  if (highlightOrder.length >= 2) {
    const order = new Map(highlightOrder.map((id, i) => [id, i] as const));
    const out: ActiveEdge[] = [];
    for (const c of curves) {
      const ia = order.get(c.edge.from);
      const ib = order.get(c.edge.to);
      if (ia === undefined || ib === undefined) continue;
      out.push({ points: c.points, reversed: ia > ib, id: c.edge.id });
      if (out.length >= MAX_ACTIVE_EDGES) break;
    }
    if (out.length) return out;
  }
  if (!selectedId) return [];
  const out: ActiveEdge[] = [];
  const seen = new Set<string>();
  const frontier: string[] = [];
  for (const c of curves) {
    if (c.edge.from === selectedId) {
      out.push({ points: c.points, reversed: false, id: c.edge.id });
      seen.add(c.edge.id);
      frontier.push(c.edge.to);
    } else if (c.edge.to === selectedId) {
      out.push({ points: c.points, reversed: true, id: c.edge.id });
      seen.add(c.edge.id);
      frontier.push(c.edge.from);
    }
    if (out.length >= MAX_ACTIVE_EDGES) return out;
  }
  const hop = new Set(frontier);
  for (const c of curves) {
    if (out.length >= MAX_ACTIVE_EDGES) break;
    if (seen.has(c.edge.id)) continue;
    if (hop.has(c.edge.from) && c.edge.to !== selectedId) {
      out.push({ points: c.points, reversed: false, id: c.edge.id });
      seen.add(c.edge.id);
    }
  }
  return out;
}

// ───────────────────────────── Scene ─────────────────────────────

export function GraphScene(props: GraphSceneProps) {
  const { nodes, edges, nodeById, positions, bounds, visibleTypes, selectedId, hoveredId, highlightOrder, labelTypes, compact, reducedMotion, fitTick, onHover, onSelect } = props;
  const controlsRef = React.useRef<OrbitControlsImpl>(null);
  const interactedRef = React.useRef(false);
  const birthRef = React.useRef<Map<string, number>>(new Map());

  const highlightSet = React.useMemo(() => new Set(highlightOrder), [highlightOrder]);
  const curves = React.useMemo(() => buildCurves(edges, positions, nodeById, visibleTypes), [edges, positions, nodeById, visibleTypes]);
  const active = React.useMemo(() => activeEdgesFor(curves, highlightOrder, selectedId), [curves, highlightOrder, selectedId]);
  const capacity = Math.max(64, Math.ceil(nodes.length / 64) * 64);

  const onStart = React.useCallback(() => {
    interactedRef.current = true;
  }, []);

  return (
    <>
      <color attach="background" args={[COLORS.paper]} />
      <hemisphereLight args={["#ffffff", "#d8d5ce", 1.15]} />
      <directionalLight position={[6, 14, 9]} intensity={1.5} />
      <directionalLight position={[-9, 5, -7]} intensity={0.45} />

      {!compact && bounds ? <BaseGrid bounds={bounds} /> : null}
      <NodeBodies
        key={capacity}
        capacity={capacity}
        nodes={nodes}
        positions={positions}
        visibleTypes={visibleTypes}
        selectedId={selectedId}
        hoveredId={hoveredId}
        highlightSet={highlightSet}
        reducedMotion={reducedMotion}
        birthRef={birthRef}
        onHover={onHover}
        onSelect={onSelect}
      />
      <Edges curves={curves} selectedId={selectedId} hoveredId={hoveredId} highlightSet={highlightSet} />
      <FlowParticles active={active} enabled={!reducedMotion} />
      <SelectionRing node={selectedId ? nodeById.get(selectedId) ?? null : null} positions={positions} />
      <Labels
        nodes={nodes}
        nodeById={nodeById}
        positions={positions}
        visibleTypes={visibleTypes}
        labelTypes={labelTypes}
        selectedId={selectedId}
        hoveredId={hoveredId}
        compact={compact}
      />
      {!compact && bounds ? <LayerGuides nodes={nodes} visibleTypes={visibleTypes} bounds={bounds} /> : null}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        panSpeed={0.6}
        minDistance={1.5}
        maxDistance={400}
        maxPolarAngle={Math.PI * 0.88}
        onStart={onStart}
      />
      <CameraRig bounds={bounds} fitTick={fitTick} controlsRef={controlsRef} interactedRef={interactedRef} reducedMotion={reducedMotion} />
    </>
  );
}

// ───────────────────────────── Node bodies ─────────────────────────────

interface NodeBodiesProps {
  capacity: number;
  nodes: readonly GraphNode[];
  positions: PositionMap;
  visibleTypes: ReadonlySet<NodeType>;
  selectedId: string | null;
  hoveredId: string | null;
  highlightSet: ReadonlySet<string>;
  reducedMotion: boolean;
  birthRef: React.RefObject<Map<string, number>>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function NodeBodies({ capacity, nodes, positions, visibleTypes, selectedId, hoveredId, highlightSet, reducedMotion, birthRef, onHover, onSelect }: NodeBodiesProps) {
  const meshRef = React.useRef<THREE.InstancedMesh>(null);
  const rimRef = React.useRef<THREE.InstancedMesh>(null);
  const hoverScale = React.useRef<Float32Array>(new Float32Array(capacity));
  const dirty = React.useRef(true);
  const clock = useThree((s) => s.clock);

  // Hide every instance until the frame loop places the live ones.
  React.useEffect(() => {
    const mesh = meshRef.current;
    const rim = rimRef.current;
    if (!mesh || !rim) return;
    for (let i = 0; i < capacity; i++) {
      mesh.setMatrixAt(i, HIDDEN);
      rim.setMatrixAt(i, HIDDEN);
    }
    mesh.instanceMatrix.needsUpdate = true;
    rim.instanceMatrix.needsUpdate = true;
    dirty.current = true;
  }, [capacity]);

  // Register birth times for scale-in.
  React.useEffect(() => {
    const t = clock.elapsedTime;
    const map = birthRef.current;
    for (const n of nodes) if (!map.has(n.id)) map.set(n.id, t);
    dirty.current = true;
  }, [nodes, clock, birthRef]);

  React.useEffect(() => {
    dirty.current = true;
  }, [positions, visibleTypes, hoveredId, selectedId, highlightSet, reducedMotion]);

  // Colours by status / focus.
  React.useEffect(() => {
    const mesh = meshRef.current;
    const rim = rimRef.current;
    if (!mesh || !rim) return;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const focus = n.id === selectedId || n.id === hoveredId;
      const fill = highlightSet.has(n.id) ? C.signal : focus || n.status === "confirmed" ? C.ink : n.status === "hypothesis" ? C.hypothesisFill : C.graphite;
      mesh.setColorAt(i, fill);
      rim.setColorAt(i, highlightSet.has(n.id) ? C.signal : focus ? C.ink : C.hypothesisRim);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (rim.instanceColor) rim.instanceColor.needsUpdate = true;
  }, [nodes, selectedId, hoveredId, highlightSet]);

  const matrix = React.useMemo(() => new THREE.Matrix4(), []);
  const pos = React.useMemo(() => new THREE.Vector3(), []);
  const quat = React.useMemo(() => new THREE.Quaternion(), []);
  const scl = React.useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock: c }) => {
    if (!dirty.current) return;
    const mesh = meshRef.current;
    const rim = rimRef.current;
    if (!mesh || !rim) return;
    const t = c.elapsedTime;
    const births = birthRef.current;
    const hs = hoverScale.current;
    let animating = false;
    const count = Math.min(nodes.length, capacity);
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const p = positions.get(n.id);
      if (!p || !visibleTypes.has(n.type)) {
        mesh.setMatrixAt(i, HIDDEN);
        rim.setMatrixAt(i, HIDDEN);
        continue;
      }
      let grow = 1;
      if (!reducedMotion) {
        const b = births.get(n.id) ?? t;
        const u = Math.min(1, (t - b) / 0.45);
        if (u < 1) animating = true;
        grow = easeOutCubic(u);
      }
      const target = n.id === hoveredId ? 1.18 : 1;
      const cur = hs[i] || 1;
      let next = reducedMotion ? target : cur + (target - cur) * 0.25;
      if (Math.abs(next - target) > 0.002) animating = true;
      else next = target;
      hs[i] = next;
      const r = NODE_RADIUS[n.type] * grow * next;
      pos.set(p.x, p.y, p.z);
      scl.set(r, r, r);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
      const rimOn = n.status === "hypothesis" || highlightSet.has(n.id);
      if (rimOn) {
        const rr = r * (n.status === "hypothesis" ? 1.18 : 1.12);
        scl.set(rr, rr, rr);
        matrix.compose(pos, quat, scl);
        rim.setMatrixAt(i, matrix);
      } else {
        rim.setMatrixAt(i, HIDDEN);
      }
    }
    mesh.count = count;
    rim.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    rim.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (!animating) dirty.current = false;
  });

  const handleMove = React.useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const i = e.instanceId;
      if (i !== undefined && i < nodes.length) onHover(nodes[i].id);
    },
    [nodes, onHover],
  );
  const handleOut = React.useCallback(() => onHover(null), [onHover]);
  const handleClick = React.useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const i = e.instanceId;
      if (i !== undefined && i < nodes.length) onSelect(nodes[i].id);
    },
    [nodes, onSelect],
  );

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        onPointerOver={handleMove}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial roughness={0.9} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={rimRef} args={[undefined, undefined, capacity]} frustumCulled={false} raycast={noRaycast}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial side={THREE.BackSide} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ───────────────────────────── Edges ─────────────────────────────

interface EdgesProps {
  curves: readonly EdgeCurve[];
  selectedId: string | null;
  hoveredId: string | null;
  highlightSet: ReadonlySet<string>;
}

function Edges({ curves, selectedId, hoveredId, highlightSet }: EdgesProps) {
  const geomRef = React.useRef<THREE.BufferGeometry>(null);

  React.useEffect(() => {
    const geom = geomRef.current;
    if (!geom) return;
    const arr = new Float32Array(curves.length * SEG * 2 * 3);
    let o = 0;
    for (const c of curves) {
      for (let s = 0; s < SEG; s++) {
        const i0 = s * 3;
        const i1 = (s + 1) * 3;
        arr[o++] = c.points[i0];
        arr[o++] = c.points[i0 + 1];
        arr[o++] = c.points[i0 + 2];
        arr[o++] = c.points[i1];
        arr[o++] = c.points[i1 + 1];
        arr[o++] = c.points[i1 + 2];
      }
    }
    geom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    geom.setDrawRange(0, curves.length * SEG * 2);
    geom.computeBoundingSphere();
  }, [curves]);

  React.useEffect(() => {
    const geom = geomRef.current;
    if (!geom) return;
    const hasFocus = Boolean(selectedId) || highlightSet.size > 0;
    const arr = new Float32Array(curves.length * SEG * 2 * 3);
    let o = 0;
    for (const c of curves) {
      const { from, to } = c.edge;
      const touchesFocus = from === selectedId || to === selectedId || from === hoveredId || to === hoveredId;
      const hf = highlightSet.has(from);
      const ht = highlightSet.has(to);
      const col = touchesFocus || (hf && ht) ? C.ink : hf || ht ? C.edgeHalf : hasFocus ? C.edgeDim : C.edge;
      for (let v = 0; v < SEG * 2; v++) {
        arr[o++] = col.r;
        arr[o++] = col.g;
        arr[o++] = col.b;
      }
    }
    geom.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  }, [curves, selectedId, hoveredId, highlightSet]);

  return (
    <lineSegments frustumCulled={false} raycast={noRaycast}>
      <bufferGeometry ref={geomRef} />
      <lineBasicMaterial vertexColors toneMapped={false} />
    </lineSegments>
  );
}

// ───────────────────────────── Flow particles ─────────────────────────────

function FlowParticles({ active, enabled }: { active: readonly ActiveEdge[]; enabled: boolean }) {
  const ref = React.useRef<THREE.InstancedMesh>(null);
  const count = enabled && active.length ? Math.min(MAX_PARTICLES, active.length * 2) : 0;
  const matrix = React.useMemo(() => new THREE.Matrix4(), []);
  const pos = React.useMemo(() => new THREE.Vector3(), []);
  const quat = React.useMemo(() => new THREE.Quaternion(), []);
  const scl = React.useMemo(() => new THREE.Vector3(), []);

  React.useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_PARTICLES; i++) mesh.setMatrixAt(i, HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (count === 0) {
      if (mesh.count !== 0) mesh.count = 0;
      return;
    }
    const t = clock.elapsedTime * 0.2;
    for (let i = 0; i < count; i++) {
      const edge = active[i % active.length];
      const phase = ((i * 0.618034) % 1) + Math.floor(i / active.length) * 0.5;
      let u = (t + phase) % 1;
      if (edge.reversed) u = 1 - u;
      const f = u * SEG;
      const s = Math.min(SEG - 1, Math.floor(f));
      const k = f - s;
      const i0 = s * 3;
      const i1 = (s + 1) * 3;
      pos.set(
        edge.points[i0] + (edge.points[i1] - edge.points[i0]) * k,
        edge.points[i0 + 1] + (edge.points[i1 + 1] - edge.points[i0 + 1]) * k,
        edge.points[i0 + 2] + (edge.points[i1 + 2] - edge.points[i0 + 2]) * k,
      );
      const travel = edge.reversed ? 1 - u : u;
      const size = 0.085 * (0.55 + 0.45 * Math.sin(travel * Math.PI));
      scl.set(size, size, size);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false} raycast={noRaycast}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial color={COLORS.ink} toneMapped={false} />
    </instancedMesh>
  );
}

// ───────────────────────────── Selection ring ─────────────────────────────

function SelectionRing({ node, positions }: { node: GraphNode | null; positions: PositionMap }) {
  const ref = React.useRef<THREE.Mesh>(null);
  const p = node ? positions.get(node.id) : undefined;
  const r = node ? NODE_RADIUS[node.type] : 0;
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  if (!node || !p) return null;
  return (
    <mesh ref={ref} position={[p.x, p.y, p.z]} scale={r} raycast={noRaycast}>
      <ringGeometry args={[1.7, 1.82, 56]} />
      <meshBasicMaterial color={COLORS.ink} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

// ───────────────────────────── Labels ─────────────────────────────

interface LabelsProps {
  nodes: readonly GraphNode[];
  nodeById: ReadonlyMap<string, GraphNode>;
  positions: PositionMap;
  visibleTypes: ReadonlySet<NodeType>;
  labelTypes: ReadonlySet<NodeType>;
  selectedId: string | null;
  hoveredId: string | null;
  compact: boolean;
}

const labelShadow = { textShadow: `0 0 3px ${COLORS.paper}, 0 0 6px ${COLORS.paper}, 0 1px 0 ${COLORS.paper}` };

/** Label priority when labels compete for screen space. */
const LABEL_PRIORITY: readonly NodeType[] = ["workflow", "objective", "outcome", "requirement", "policy", "step", "intervention", "screen", "application", "role", "person", "capability", "object", "action", "field"];

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function Labels({ nodes, nodeById, positions, visibleTypes, labelTypes, selectedId, hoveredId, compact }: LabelsProps) {
  const typeLabels = React.useMemo(() => {
    if (compact) return [] as GraphNode[];
    const out: GraphNode[] = [];
    for (const n of nodes) {
      if (!labelTypes.has(n.type) || !visibleTypes.has(n.type) || !positions.has(n.id)) continue;
      out.push(n);
    }
    out.sort((a, b) => LABEL_PRIORITY.indexOf(a.type) - LABEL_PRIORITY.indexOf(b.type));
    return out.slice(0, MAX_TYPE_LABELS);
  }, [nodes, labelTypes, visibleTypes, positions, compact]);

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const hovered = hoveredId && hoveredId !== selectedId ? nodeById.get(hoveredId) ?? null : null;
  const selectedPos = selected ? positions.get(selected.id) : undefined;
  const hoveredPos = hovered ? positions.get(hovered.id) : undefined;

  // Screen-space de-confliction: greedy by priority, every 4th frame, DOM writes only on change.
  const elements = React.useRef<Map<string, HTMLElement>>(new Map());
  const shown = React.useRef<Map<string, boolean>>(new Map());
  const frame = React.useRef(0);
  const v = React.useMemo(() => new THREE.Vector3(), []);
  const setRef = React.useCallback((id: string) => (el: HTMLDivElement | null) => {
    const map = elements.current;
    if (el) map.set(id, el);
    else map.delete(id);
  }, []);

  useFrame(({ camera, size }) => {
    if (typeLabels.length === 0) return;
    if ((frame.current++ & 3) !== 0) return;
    const placed: Rect[] = [];
    const reserve = (node: GraphNode, p: { x: number; y: number; z: number }, lift: number, w: number, h: number) => {
      v.set(p.x, p.y + lift, p.z).project(camera);
      if (v.z > 1) return;
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      placed.push({ x0: sx - w / 2, y0: sy - h, x1: sx + w / 2, y1: sy });
    };
    if (selected && selectedPos) reserve(selected, selectedPos, NODE_RADIUS[selected.type] * 1.9 + 0.06, Math.min(236, selected.label.length * 6.6 + 18), 36);
    if (hovered && hoveredPos) reserve(hovered, hoveredPos, NODE_RADIUS[hovered.type] * 1.4 + 0.06, Math.min(236, hovered.label.length * 6.6 + 18), 36);
    for (const n of typeLabels) {
      if (n.id === selectedId || n.id === hoveredId) continue;
      const p = positions.get(n.id);
      if (!p) continue;
      v.set(p.x, p.y + NODE_RADIUS[n.type] + 0.12, p.z).project(camera);
      let visible = v.z <= 1;
      if (visible) {
        const sx = ((v.x + 1) / 2) * size.width;
        const sy = ((1 - v.y) / 2) * size.height;
        const w = Math.min(160, n.label.length * 6.2 + 6);
        const rect: Rect = { x0: sx - w / 2, y0: sy - 13, x1: sx + w / 2, y1: sy + 1 };
        visible = !placed.some((r) => intersects(r, rect));
        if (visible) placed.push(rect);
      }
      if (shown.current.get(n.id) !== visible) {
        shown.current.set(n.id, visible);
        const el = elements.current.get(n.id);
        if (el) el.style.visibility = visible ? "visible" : "hidden";
      }
    }
  });

  return (
    <>
      {typeLabels.map((n) => {
        if (n.id === selectedId || n.id === hoveredId) return null;
        const p = positions.get(n.id)!;
        return (
          <Html key={n.id} ref={setRef(n.id)} position={[p.x, p.y + NODE_RADIUS[n.type] + 0.12, p.z]} center zIndexRange={[3, 0]} style={{ pointerEvents: "none" }}>
            <span className="block max-w-[160px] -translate-y-1/2 truncate whitespace-nowrap text-[11px] leading-none text-graphite" style={labelShadow}>
              {n.label}
            </span>
          </Html>
        );
      })}
      {selected && selectedPos ? (
        <Html key="selected" position={[selectedPos.x, selectedPos.y + NODE_RADIUS[selected.type] * 1.9 + 0.06, selectedPos.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <FocusLabel node={selected} tone="selected" />
        </Html>
      ) : null}
      {hovered && hoveredPos ? (
        <Html key="hover" position={[hoveredPos.x, hoveredPos.y + NODE_RADIUS[hovered.type] * 1.4 + 0.06, hoveredPos.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <FocusLabel node={hovered} tone="hover" />
        </Html>
      ) : null}
    </>
  );
}

function FocusLabel({ node, tone }: { node: GraphNode; tone: "selected" | "hover" }) {
  return (
    <div
      className={
        tone === "selected"
          ? "-translate-y-full rounded-md border border-ink bg-surface px-2 py-1 shadow-sm"
          : "-translate-y-full rounded-md border border-line-strong bg-surface px-2 py-1 shadow-sm"
      }
      data-testid={tone === "selected" ? "work-graph-selected-label" : "work-graph-hover-label"}
    >
      <p className="eyebrow whitespace-nowrap text-[9px]">{TYPE_LABEL[node.type].one}</p>
      <p className="max-w-[220px] truncate whitespace-nowrap text-xs text-ink">{node.label}</p>
    </div>
  );
}

// ───────────────────────────── Layer guides & grid ─────────────────────────────

function LayerGuides({ nodes, visibleTypes, bounds }: { nodes: readonly GraphNode[]; visibleTypes: ReadonlySet<NodeType>; bounds: Bounds }) {
  const present = React.useMemo(() => {
    const layers = new Set<number>();
    for (const n of nodes) if (visibleTypes.has(n.type)) layers.add(LAYER_OF[n.type]);
    return [...layers].sort((a, b) => a - b);
  }, [nodes, visibleTypes]);
  const x = bounds.min.x - 0.6;
  return (
    <>
      {present.map((l) => (
        <Html key={l} position={[x, layerY(l), bounds.center.z]} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <span className="eyebrow block -translate-x-full -translate-y-1/2 whitespace-nowrap pr-2 text-[9.5px] text-mist" style={labelShadow}>
            {LAYER_NAMES[l]}
          </span>
        </Html>
      ))}
    </>
  );
}

function BaseGrid({ bounds }: { bounds: Bounds }) {
  const size = Math.max(8, Math.ceil(bounds.radius * 2.2));
  const divisions = Math.max(4, Math.round(size / 1.15));
  const y = layerY(LAYER_COUNT - 1) - 0.9;
  return <gridHelper args={[size, divisions, COLORS.line, COLORS.line]} position={[bounds.center.x, y, bounds.center.z]} raycast={noRaycast} />;
}

// ───────────────────────────── Camera ─────────────────────────────

interface CameraRigProps {
  bounds: Bounds | null;
  fitTick: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  interactedRef: React.RefObject<boolean>;
  reducedMotion: boolean;
}

const VIEW_DIR = new THREE.Vector3(0.62, 0.4, 1).normalize();

function CameraRig({ bounds, fitTick, controlsRef, interactedRef, reducedMotion }: CameraRigProps) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const tween = React.useRef<{ from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; start: number; dur: number } | null>(null);
  const fitted = React.useRef(false);
  const lastTick = React.useRef(fitTick);
  const lastRadius = React.useRef(0);
  const clock = useThree((s) => s.clock);

  React.useEffect(() => {
    if (!bounds) return;
    const explicit = fitTick !== lastTick.current;
    lastTick.current = fitTick;
    const grew = !fitted.current || bounds.radius > lastRadius.current * 1.3;
    if (!explicit && (interactedRef.current || !grew)) return;
    if (explicit) interactedRef.current = false;

    const { camera, scene } = get();
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = (cam.fov * Math.PI) / 180;
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // Box-aware fit: wide flat graphs should fill the width, tall ones the height.
    const extentX = bounds.max.x - bounds.min.x;
    const extentY = bounds.max.y - bounds.min.y;
    const extentZ = bounds.max.z - bounds.min.z;
    const footprint = Math.max(extentX, extentZ) / 2;
    const margin = 0.6;
    const distV = (extentY / 2 + margin + footprint * VIEW_DIR.y * 0.45) / Math.tan(vfov / 2);
    const distH = (footprint * 0.9 + margin) / Math.tan(hfov / 2);
    const dist = Math.max(distV, distH, 3) + footprint * 0.3;
    const center = new THREE.Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
    const to = center.clone().addScaledVector(VIEW_DIR, dist);
    cam.near = Math.max(0.05, dist * 0.01);
    cam.far = Math.max(600, dist * 10);
    cam.updateProjectionMatrix();
    scene.fog = new THREE.Fog(COLORS.paper, dist * 0.9, dist * 2.7);

    const controls = controlsRef.current;
    if (!fitted.current || reducedMotion || !controls) {
      cam.position.copy(to);
      if (controls) {
        controls.target.copy(center);
        controls.update();
      } else {
        cam.lookAt(center);
      }
      tween.current = null;
    } else {
      tween.current = { from: cam.position.clone(), to, fromT: controls.target.clone(), toT: center, start: clock.elapsedTime, dur: 0.65 };
    }
    fitted.current = true;
    lastRadius.current = bounds.radius;
  }, [bounds, fitTick, get, size.width, size.height, controlsRef, interactedRef, reducedMotion, clock]);

  useFrame(({ clock: c, camera }) => {
    const tw = tween.current;
    if (!tw) return;
    const controls = controlsRef.current;
    const u = Math.min(1, (c.elapsedTime - tw.start) / tw.dur);
    const e = easeOutCubic(u);
    camera.position.lerpVectors(tw.from, tw.to, e);
    if (controls) {
      controls.target.lerpVectors(tw.fromT, tw.toT, e);
      controls.update();
    }
    if (u >= 1) tween.current = null;
  });

  return null;
}
