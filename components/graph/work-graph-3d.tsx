"use client";
/**
 * WorkGraph3D — the interactive 3D Work Graph.
 *
 * Contract (imported by other product surfaces):
 *   <WorkGraph3D graph height highlightNodeIds selectedNodeId onSelectNode compact layers />
 *
 * - Renders inside any container (default height 480px; "100%" when the parent has a height).
 * - Safe to import through next/dynamic({ ssr: false }); nothing touches window during render.
 * - Never crashes on an empty graph: an empty state is drawn inside the canvas area.
 * - Updates incrementally when the graph prop changes: existing nodes keep their positions,
 *   new nodes are relaxed into place and scale in. The scene is never rebuilt per frame.
 */
import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { RotateCcw } from "lucide-react";
import type { GraphNode, NodeType, WorkGraph } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { COLORS, DEFAULT_LABEL_TYPES, NODE_RADIUS, TYPE_LABEL, TYPE_ORDER } from "./constants";
import { computeBounds, relaxLayout, type PositionMap } from "./layout";
import { GraphScene } from "./graph-scene";

export interface WorkGraph3DProps {
  graph: WorkGraph;
  height?: number | string;
  /** Nodes drawn in the signal colour. When they form a path, flow particles travel along it in order. */
  highlightNodeIds?: string[];
  /** Controlled selection. Omit to let the component manage selection internally. */
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode | null) => void;
  /** Embedded mode: no legend, labels only for hovered/selected nodes, smaller controls. */
  compact?: boolean;
  /** Visible node types. Omit to show every type. */
  layers?: NodeType[];
  /** Extras beyond the shared contract. */
  onLayersChange?: (layers: NodeType[]) => void;
  showLegend?: boolean;
  labelTypes?: NodeType[];
  className?: string;
}

interface LayoutState {
  nodes: WorkGraph["nodes"] | null;
  edges: WorkGraph["edges"] | null;
  positions: PositionMap;
}

const EMPTY_NODES: GraphNode[] = [];
const EMPTY_EDGES: WorkGraph["edges"] = [];

function parseTypes(key: string): NodeType[] {
  return key.split(",").filter((t): t is NodeType => t.length > 0 && (TYPE_ORDER as readonly string[]).includes(t));
}

function useReducedMotion(): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return React.useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false),
    () => false,
  );
}

export function WorkGraph3D(props: WorkGraph3DProps): React.JSX.Element {
  const {
    graph,
    height = 480,
    highlightNodeIds,
    selectedNodeId,
    onSelectNode,
    compact = false,
    layers,
    onLayersChange,
    showLegend,
    labelTypes,
    className,
  } = props;

  const nodes = graph?.nodes ?? EMPTY_NODES;
  const edges = graph?.edges ?? EMPTY_EDGES;
  const reducedMotion = useReducedMotion();

  // ── Layout: incremental, deterministic. Existing nodes keep their positions. ──
  const [layout, setLayout] = React.useState<LayoutState>(() => ({ nodes: null, edges: null, positions: new Map() }));
  const layoutStale = layout.nodes !== nodes || layout.edges !== edges;
  const positions = layoutStale ? relaxLayout(nodes, edges, layout.positions) : layout.positions;
  if (layoutStale) setLayout({ nodes, edges, positions });

  // ── Visible layers (semi-controlled). State is a primitive key so derivations stay pure. ──
  const layersKey = layers ? layers.join(",") : null;
  const [layerState, setLayerState] = React.useState<{ propKey: string | null; visibleKey: string }>(() => ({
    propKey: layersKey,
    visibleKey: layersKey ?? TYPE_ORDER.join(","),
  }));
  const needsLayerSync = layersKey !== null && layerState.propKey !== layersKey;
  if (needsLayerSync) setLayerState({ propKey: layersKey, visibleKey: layersKey });
  const visibleKey = needsLayerSync && layersKey !== null ? layersKey : layerState.visibleKey;
  const visibleTypes = React.useMemo(() => new Set<NodeType>(parseTypes(visibleKey)), [visibleKey]);
  const toggleLayer = React.useCallback(
    (type: NodeType) => {
      const current = new Set<NodeType>(parseTypes(visibleKey));
      if (current.has(type)) current.delete(type);
      else current.add(type);
      const next = TYPE_ORDER.filter((t) => current.has(t));
      setLayerState((prev) => ({ propKey: prev.propKey, visibleKey: next.join(",") }));
      onLayersChange?.(next);
    },
    [visibleKey, onLayersChange],
  );
  const showAllLayers = React.useCallback(() => {
    setLayerState((prev) => ({ propKey: prev.propKey, visibleKey: TYPE_ORDER.join(",") }));
    onLayersChange?.([...TYPE_ORDER]);
  }, [onLayersChange]);

  // ── Selection (semi-controlled) & hover ──
  const nodeById = React.useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);
  const [internalSelected, setInternalSelected] = React.useState<string | null>(null);
  const controlled = selectedNodeId !== undefined;
  const rawSelected = controlled ? selectedNodeId : internalSelected;
  const selectedNode = rawSelected ? nodeById.get(rawSelected) ?? null : null;
  const selectedId = selectedNode && visibleTypes.has(selectedNode.type) ? selectedNode.id : null;

  const [rawHovered, setRawHovered] = React.useState<string | null>(null);
  const hoveredNode = rawHovered ? nodeById.get(rawHovered) ?? null : null;
  const hoveredId = hoveredNode && visibleTypes.has(hoveredNode.type) ? hoveredNode.id : null;

  const select = React.useCallback(
    (id: string | null) => {
      if (!controlled) setInternalSelected(id);
      onSelectNode?.(id ? nodeById.get(id) ?? null : null);
    },
    [controlled, nodeById, onSelectNode],
  );
  const handleHover = React.useCallback((id: string | null) => {
    setRawHovered((prev) => (prev === id ? prev : id));
  }, []);

  // Escape deselects.
  React.useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

  // Click on empty space deselects — only when the pointer did not drag (orbit).
  const pointerDown = React.useRef<{ x: number; y: number } | null>(null);
  const onPointerDownCapture = React.useCallback((e: React.PointerEvent) => {
    pointerDown.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerMissed = React.useCallback(
    (e: MouseEvent) => {
      const down = pointerDown.current;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      if (selectedId) select(null);
    },
    [selectedId, select],
  );

  // ── Derived: highlight, bounds, counts ──
  const highlightKey = highlightNodeIds && highlightNodeIds.length ? highlightNodeIds.join("\n") : "";
  const highlightOrder = React.useMemo(
    () => (highlightKey ? highlightKey.split("\n").filter((id) => nodeById.has(id)) : []),
    [highlightKey, nodeById],
  );
  const bounds = React.useMemo(() => computeBounds(nodes, positions, visibleTypes, NODE_RADIUS), [nodes, positions, visibleTypes]);
  const counts = React.useMemo(() => {
    const c: Partial<Record<NodeType, number>> = {};
    for (const n of nodes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [nodes]);
  const labelTypeSet = React.useMemo(() => new Set(labelTypes ?? DEFAULT_LABEL_TYPES), [labelTypes]);

  const [fitTick, setFitTick] = React.useState(0);
  const isEmpty = nodes.length === 0;
  const legendVisible = (showLegend ?? !compact) && !isEmpty;
  const hiddenCount = TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0 && !visibleTypes.has(t)).length;

  return (
    <div
      className={cn("relative isolate w-full overflow-hidden bg-paper text-ink", hoveredId && "cursor-pointer", className)}
      style={{ height }}
      onPointerDownCapture={onPointerDownCapture}
      role="application"
      aria-label="Interactive 3D work graph"
      data-testid="work-graph-3d"
      data-node-count={nodes.length}
    >
      <GraphErrorBoundary fallback={<GraphFallback counts={counts} />}>
        <Canvas
          flat
          dpr={[1, 1.75]}
          camera={{ fov: 38, near: 0.1, far: 600, position: [0, 8, 32] }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => gl.setClearColor(COLORS.paper, 1)}
          onPointerMissed={onPointerMissed}
          style={{ position: "absolute", inset: 0 }}
        >
          <GraphScene
            nodes={nodes}
            edges={edges}
            nodeById={nodeById}
            positions={positions}
            bounds={bounds}
            visibleTypes={visibleTypes}
            selectedId={selectedId}
            hoveredId={hoveredId}
            highlightOrder={highlightOrder}
            labelTypes={labelTypeSet}
            compact={compact}
            reducedMotion={reducedMotion}
            fitTick={fitTick}
            onHover={handleHover}
            onSelect={select}
          />
        </Canvas>
      </GraphErrorBoundary>

      {isEmpty ? (
        <div className="dot-paper pointer-events-none absolute inset-0 flex items-center justify-center p-6" data-testid="work-graph-empty">
          <div className="max-w-xs rounded-lg border border-line bg-surface/90 px-5 py-4 text-center backdrop-blur-sm">
            <p className="eyebrow">Work Graph</p>
            <p className="mt-2 text-sm font-medium text-ink">No nodes yet</p>
            <p className="mt-1 text-xs leading-relaxed text-slate">
              The graph fills in as discovery observes the application: screens, actions, fields and objects first, then the
              workflow and its requirements.
            </p>
          </div>
        </div>
      ) : null}

      {legendVisible ? (
        <div
          className="absolute bottom-3 left-3 z-[6] max-h-[calc(100%-1.5rem)] w-44 overflow-y-auto rounded-md border border-line bg-surface/92 p-2 backdrop-blur-sm scrollbar-thin"
          data-testid="work-graph-legend"
        >
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="eyebrow">Layers</p>
            {hiddenCount > 0 ? (
              <button type="button" onClick={showAllLayers} className="text-[11px] text-slate underline-offset-2 hover:text-ink hover:underline cursor-pointer">
                Show all
              </button>
            ) : null}
          </div>
          <ul className="space-y-px">
            {TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => {
              const on = visibleTypes.has(t);
              return (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLayer(t)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-1 py-[3px] text-left text-[11px] transition-colors hover:bg-surface-2 cursor-pointer",
                      on ? "text-ink" : "text-mist",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("inline-block shrink-0 rounded-full border", on ? "border-ink bg-ink" : "border-line-strong bg-transparent")}
                      style={{ width: 6 + NODE_RADIUS[t] * 12, height: 6 + NODE_RADIUS[t] * 12 }}
                    />
                    <span className="flex-1 truncate">{TYPE_LABEL[t].many}</span>
                    <span className="mono-data text-[10px] text-slate">{counts[t]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 space-y-1 border-t border-line pt-2 text-[10px] text-slate">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ink" />
              Confirmed
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-graphite" />
              Observed
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border border-amber/70" style={{ background: COLORS.hypothesisFill }} />
              Hypothesis
            </div>
          </div>
        </div>
      ) : null}

      {!isEmpty ? (
        <div className="absolute right-3 top-3 z-[6]">
          {compact ? (
            <Button variant="outline" size="icon-sm" aria-label="Reset view" title="Reset view" onClick={() => setFitTick((t) => t + 1)} className="bg-surface/92 backdrop-blur-sm">
              <RotateCcw aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setFitTick((t) => t + 1)} className="bg-surface/92 backdrop-blur-sm">
              <RotateCcw aria-hidden="true" />
              Reset view
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────── Error boundary ─────────────────────────────

interface BoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

class GraphErrorBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") console.warn("WorkGraph3D could not start", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function GraphFallback({ counts }: { counts: Partial<Record<NodeType, number>> }) {
  const present = TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0);
  return (
    <div className="grid-paper absolute inset-0 flex items-center justify-center p-6" data-testid="work-graph-fallback">
      <div className="max-w-sm rounded-lg border border-line bg-surface px-5 py-4">
        <p className="eyebrow">Work Graph</p>
        <p className="mt-2 text-sm font-medium">The 3D view could not start</p>
        <p className="mt-1 text-xs leading-relaxed text-slate">
          This browser did not provide a WebGL context. The graph is intact; its composition is listed below.
        </p>
        {present.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {present.map((t) => (
              <li key={t} className="flex justify-between">
                <span className="text-graphite">{TYPE_LABEL[t].many}</span>
                <span className="mono-data text-slate">{counts[t]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
