"use client";
import "@xyflow/react/dist/style.css";
import "./process-map.css";
import * as React from "react";
import Link from "next/link";
import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { ArrowUpRight } from "lucide-react";
import type { GraphNode, NodeType } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { COLORS } from "../constants";
import { MapInteractionContext, type MapInteraction } from "./context";
import { edgeColor, edgeTypes, type MapFlowEdge } from "./edges";
import type { ProcessLayout } from "./layout";
import { LENSES, TRUST_TONE_LABEL, type Lens, type MapNode, type TrustTone } from "./model";
import { nodeTypes, type MapFlowNode } from "./nodes";

/**
 * ProcessMap — the 2D process map of the Work Graph (React Flow + the layered
 * layout in ./layout.ts). Fits the view on mount and whenever the lens or the
 * set of nodes changes; pans to a node on request; hover lights a node's
 * neighbourhood; click selects. Nodes are buttons, so the map is keyboard
 * reachable. The legend changes per lens.
 */

export interface FocusRequest {
  id: string;
  nonce: number;
}

export interface ProcessMapProps {
  layout: ProcessLayout;
  lens: Lens;
  selectedId: string | null;
  highlightIds: readonly string[];
  onSelectNode: (node: GraphNode | null) => void;
  /** Pan and zoom to this node whenever the nonce changes. */
  focus?: FocusRequest | null;
  /** Screen that contains a node the map does not draw (an action or a field): the map pans there instead. */
  containerOf?: ReadonlyMap<string, string>;
  sample?: boolean;
  /** Node count of the stored graph, for "N of M nodes on this lens". */
  totalNodes: number;
  className?: string;
}

const MINIMAP_COLOR: Partial<Record<NodeType, string>> = {
  objective: COLORS.ink,
  outcome: COLORS.ink,
  workflow: COLORS.graphite,
  step: COLORS.graphite,
  screen: COLORS.mist,
  application: COLORS.slate,
};

const TONES: readonly TrustTone[] = ["live", "approved", "observed", "inferred", "contested"];
const TONE_COLOR: Record<TrustTone, string> = {
  live: "var(--verdant)",
  approved: "var(--ink)",
  observed: "var(--graphite)",
  inferred: "var(--amber)",
  contested: "var(--signal)",
  unknown: "var(--mist)",
  illustrative: "var(--mist)",
};

function LegendItem({ children, testId, swatch }: { children: React.ReactNode; testId?: string; swatch: React.ReactNode }) {
  return (
    <span className="pm-legend-item" data-testid={testId}>
      {swatch}
      <span>{children}</span>
    </span>
  );
}

/** One line under the toolbar, never over the map: what the current lens draws. */
function Legend({ layout, lens, sample, totalNodes }: { layout: ProcessLayout; lens: Lens; sample: boolean; totalNodes: number }) {
  const { model } = layout;
  const shown = layout.nodes.length;
  const dialogs = layout.nodes.filter((n) => n.type === "screen" && n.dialog).length;
  const workflowFamily = lens !== "application";
  return (
    <div className="pm-legend" data-testid="graph-legend" data-lens={lens} role="note" aria-label="Legend">
      <span className="pm-legend-title eyebrow">{LENSES.find((l) => l.value === lens)?.label ?? lens}</span>
      <span className="pm-legend-item mono-data" data-testid="graph-legend-count">
        {shown} of {totalNodes} nodes
      </span>
      {workflowFamily ? (
        <>
          <LegendItem swatch={<span className={cn("pm-legend-line", lens === "runs" && "pm-legend-line--traffic")} aria-hidden="true" />}>
            {lens === "runs" ? "Intended path · count and width: runs that took it" : "Intended path: objective → steps → outcome"}
          </LegendItem>
          {lens === "runs" ? <LegendItem swatch={<span className="pm-legend-line pm-legend-line--observed" aria-hidden="true" />}>Observed detour (back or skip)</LegendItem> : null}
          <LegendItem swatch={<span className="pm-legend-line pm-legend-line--dashed" aria-hidden="true" />}>Attached: screen a step touches, requirement, policy</LegendItem>
          <LegendItem swatch={<span className="pm-legend-line pm-legend-line--thin" aria-hidden="true" />}>Navigation between screens</LegendItem>
          {lens === "runs" ? (
            <>
              <LegendItem swatch={<span className="pm-badge pm-badge--friction">3</span>}>Friction events: hesitation, validation error, backtrack, inferred states</LegendItem>
              <LegendItem swatch={<span className="pm-badge pm-badge--heal">2</span>}>Self-healed: actions re-grounded after the interface changed</LegendItem>
              <LegendItem swatch={<span className="pm-badge pm-badge--drop">−1</span>}>Runs that ended on the step</LegendItem>
              <span className="pm-legend-item pm-legend-note">Median: step entered → completed, all runs of this program</span>
            </>
          ) : null}
          {lens === "evidence"
            ? TONES.map((t) => (
                <LegendItem key={t} testId={`graph-legend-tone-${t}`} swatch={<span className="pm-legend-swatch" style={{ borderLeft: `4px solid ${TONE_COLOR[t]}` }} aria-hidden="true" />}>
                  {TRUST_TONE_LABEL[t]}
                </LegendItem>
              ))
            : null}
          {lens === "evidence" && sample ? <span className="pm-legend-item pm-legend-note">The sample carries no provenance: every node is illustrative</span> : null}
          {model.hiddenScreens ? (
            <span className="pm-legend-item pm-legend-note" data-testid="graph-hidden-screens" data-count={model.hiddenScreens}>
              {model.hiddenScreens} screen{model.hiddenScreens === 1 ? "" : "s"} not on the workflow hidden
            </span>
          ) : null}
        </>
      ) : (
        <>
          <LegendItem swatch={<span className="pm-legend-line pm-legend-line--thin" aria-hidden="true" />}>Navigation observed during discovery, labelled by the control that caused it</LegendItem>
          <LegendItem swatch={<span className="pm-legend-line" aria-hidden="true" />}>Navigation the intended workflow uses</LegendItem>
          <LegendItem swatch={<span className="pm-legend-line pm-legend-line--dashed" aria-hidden="true" />}>Entry from the application · object a screen shows</LegendItem>
          <span className="pm-legend-item pm-legend-note">
            Actions and fields are counted per screen; select a screen to list them
            {dialogs ? ` · ${dialogs} dialog${dialogs === 1 ? "" : "s"} shown as screens` : ""}
          </span>
        </>
      )}
    </div>
  );
}

function Canvas({ layout, lens, selectedId, highlightIds, onSelectNode, focus, containerOf, sample = false, totalNodes }: ProcessMapProps) {
  const rf = useReactFlow<MapFlowNode, MapFlowEdge>();
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const nodes = React.useMemo<MapFlowNode[]>(
    () =>
      layout.nodes.map((n) => ({
        id: n.id,
        type: "map",
        position: { x: n.x, y: n.y },
        width: n.width,
        height: n.height,
        data: { node: n },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      })),
    [layout],
  );
  const edges = React.useMemo<MapFlowEdge[]>(
    () =>
      layout.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `s-${e.sourceHandle}`,
        targetHandle: `t-${e.targetHandle}`,
        type: "map",
        data: { edge: e },
        markerEnd: e.kind === "structural" ? undefined : { type: MarkerType.ArrowClosed, color: edgeColor(e), width: 14, height: 14 },
        selectable: false,
        focusable: false,
        zIndex: e.happy ? 2 : e.kind === "traffic" ? 1 : 0,
      })),
    [layout],
  );

  const adjacency = React.useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of layout.edges) {
      (m.get(e.source) ?? m.set(e.source, new Set()).get(e.source)!).add(e.target);
      (m.get(e.target) ?? m.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    return m;
  }, [layout]);
  const highlight = React.useMemo(() => new Set(highlightIds), [highlightIds]);
  const dimFocus = React.useMemo(() => {
    if (hoveredId) return hoveredId;
    if (highlight.size || !selectedId || !adjacency.has(selectedId)) return null;
    return selectedId;
  }, [hoveredId, selectedId, highlight, adjacency]);
  const related = React.useMemo(() => {
    if (!dimFocus) return null;
    const set = new Set<string>([dimFocus]);
    for (const id of adjacency.get(dimFocus) ?? []) set.add(id);
    return set;
  }, [dimFocus, adjacency]);

  const select = React.useCallback((n: MapNode | null) => onSelectNode(n ? n.node : null), [onSelectNode]);
  const interaction = React.useMemo<MapInteraction>(
    () => ({ lens, selectedId, hoveredId, highlight, related, dimFocus, maxTraffic: layout.model.maxTraffic, sample, setHovered: setHoveredId, select }),
    [lens, selectedId, hoveredId, highlight, related, dimFocus, layout.model.maxTraffic, sample, select],
  );

  // Fit the view on mount, on lens change and when the set of nodes changes; the legend strip and the bottom
  // controls are kept clear of the map.
  const topRef = React.useRef<HTMLDivElement>(null);
  const fit = React.useCallback(
    (duration: number) => {
      const top = (topRef.current?.offsetHeight ?? 0) + 14;
      void rf.fitView({ padding: { top: `${top}px`, right: "14px", bottom: "44px", left: "14px" }, maxZoom: 1.1, duration });
    },
    [rf],
  );
  const nodeKey = React.useMemo(() => layout.nodes.map((n) => n.id).join("|"), [layout]);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => fit(280));
    return () => window.cancelAnimationFrame(id);
  }, [fit, lens, nodeKey]);

  // Refit when the canvas itself changes size (a rotated phone, the detail panel appearing), not on the first measure.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last: string | null = null;
    let timer = 0;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (last === null) {
        last = key;
        return;
      }
      if (key === last) return;
      last = key;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fit(200), 120);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [fit]);

  // Pan to a node on request (search result, intent-flow hop, detail-panel neighbour). A request for a node
  // the current lens does not draw waits for a layout that has it (or its containing screen).
  const handledFocus = React.useRef(0);
  React.useEffect(() => {
    if (!focus || handledFocus.current === focus.nonce) return;
    const container = containerOf?.get(focus.id);
    const n = layout.nodes.find((x) => x.id === focus.id) ?? (container ? layout.nodes.find((x) => x.id === container) : undefined);
    if (!n) return;
    handledFocus.current = focus.nonce;
    const zoom = Math.min(1.2, Math.max(rf.getZoom(), 0.85));
    void rf.setCenter(n.x + n.width / 2, n.y + n.height / 2, { zoom, duration: 360 });
  }, [rf, focus, layout, containerOf]);

  const onPaneClick = React.useCallback(() => onSelectNode(null), [onSelectNode]);
  // Selection goes through React Flow's node click (which also enables pointer events on the node wrappers);
  // the button inside each node makes Enter and Space reach it from the keyboard.
  const onNodeClick = React.useCallback((_e: React.MouseEvent, n: MapFlowNode) => select(n.data.node), [select]);
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onSelectNode(null);
    },
    [onSelectNode],
  );
  const minimapColor = React.useCallback((n: MapFlowNode) => MINIMAP_COLOR[n.data.node.type] ?? COLORS.lineStrong, []);

  return (
    <MapInteractionContext.Provider value={interaction}>
      <div ref={wrapperRef} className="process-map" data-testid="process-map" data-lens={lens} data-nodes={layout.nodes.length} onKeyDown={onKeyDown}>
        <ReactFlow<MapFlowNode, MapFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: { top: "52px", right: "14px", bottom: "44px", left: "14px" }, maxZoom: 1.1 }}
          minZoom={0.1}
          maxZoom={2.5}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          selectNodesOnDrag={false}
          zoomOnDoubleClick={false}
          panOnScroll={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={COLORS.lineStrong} />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap position="bottom-left" pannable zoomable nodeColor={minimapColor} nodeStrokeWidth={0} nodeBorderRadius={2} className="pm-minimap" />
          <Panel position="top-left" className="pm-top">
            <div ref={topRef}>
              <Legend layout={layout} lens={lens} sample={sample} totalNodes={totalNodes} />
              {lens === "runs" && layout.model.runCount === 0 ? (
                <div className="pm-note" data-testid="graph-runs-empty">
                  <span className="font-medium text-ink">No runs recorded for this workflow.</span>
                  <span className="text-slate"> Run the demo in Mission Control first; traffic, friction and self-healing then appear on the intended path.</span>
                  <Link href="/demo" className="ml-2 inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline">
                    Open Mission Control
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              ) : null}
            </div>
          </Panel>
        </ReactFlow>
        {layout.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6" data-testid="process-map-empty">
            <div className="pointer-events-auto max-w-sm rounded-lg border border-line bg-surface px-5 py-4 text-center">
              <p className="eyebrow">Nothing on this lens</p>
              <p className="mt-2 text-xs leading-relaxed text-slate">
                {lens === "application" ? "No screens have been discovered for this program." : "This graph has no workflow to lay out, or every layer is hidden."}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </MapInteractionContext.Provider>
  );
}

export function ProcessMap(props: ProcessMapProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
