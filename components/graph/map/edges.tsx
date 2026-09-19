"use client";
import * as React from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, Position, type Edge, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { COLORS } from "../constants";
import { useMapInteraction } from "./context";
import type { LaidOutEdge } from "./layout";

/**
 * The process-map edge. Happy-path edges are thick ink with an arrow;
 * navigation edges thin; structural attachments hairline and dashed; traffic
 * edges scale their width with the run count and carry it as a label. An
 * edge dims when it does not touch the hovered (else selected) node.
 */

export type MapFlowEdge = Edge<{ edge: LaidOutEdge }, "map">;

const LABEL_MAX = 26;

export function edgeColor(e: LaidOutEdge): string {
  if (e.kind === "traffic") return COLORS.signal;
  if (e.happy) return COLORS.ink;
  if (e.kind === "navigation") return COLORS.edgeHalf;
  return COLORS.lineStrong;
}

function strokeWidth(e: LaidOutEdge, maxTraffic: number): number {
  if (e.traffic !== undefined && maxTraffic > 0) {
    if (e.traffic === 0) return 1.25;
    return 1.75 + 3.25 * Math.min(1, e.traffic / maxTraffic);
  }
  if (e.happy) return 2.25;
  if (e.kind === "navigation") return 1.25;
  return 1;
}

function MapEdgeViewInner({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<MapFlowEdge>) {
  const { dimFocus, maxTraffic, lens } = useMapInteraction();
  const e = data?.edge;
  const touches = e ? e.source === dimFocus || e.target === dimFocus : false;
  const dimmed = dimFocus !== null && !touches;
  const lit = dimFocus !== null && touches;

  const [path, labelX, labelY] = React.useMemo(() => {
    if (e?.back) {
      return getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition: Position.Top, targetPosition: Position.Top, curvature: 0.9 });
    }
    return getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, offset: 18 });
  }, [e?.back, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  if (!e) return null;
  const color = edgeColor(e);
  const width = strokeWidth(e, maxTraffic);
  const dashed = e.kind === "structural" || (e.traffic === 0 && e.kind === "path");
  const showTraffic = lens === "runs" && e.traffic !== undefined && (e.kind === "path" || e.kind === "traffic");
  const text = showTraffic ? String(e.traffic) : e.kind === "navigation" && e.label ? e.label : e.kind === "traffic" && e.label ? e.label : null;
  const label = text && text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={14}
        className={cn("pm-edge", `pm-edge--${e.kind}`, e.happy && "is-happy", dimmed && "is-dimmed", lit && "is-lit")}
        style={{ stroke: color, strokeWidth: width, strokeDasharray: dashed ? "4 4" : undefined, opacity: e.traffic === 0 ? 0.55 : undefined }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <span
            className={cn("pm-edge-label mono-data", showTraffic && "pm-edge-label--traffic", e.kind === "traffic" && "pm-edge-label--observed", e.happy && "is-happy", dimmed && "is-dimmed")}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            data-testid={showTraffic ? "map-edge-traffic" : "map-edge-label"}
            data-count={showTraffic ? e.traffic : undefined}
            data-happy={e.happy ? "true" : "false"}
            data-edge-id={e.id}
            title={showTraffic ? `${e.traffic} run${e.traffic === 1 ? "" : "s"}${e.label ? ` · ${e.label}` : ""}` : text ?? undefined}
          >
            {label}
            {showTraffic && e.kind === "traffic" && e.label ? <span className="pm-edge-label-note"> {e.label}</span> : null}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const MapEdgeView = React.memo(MapEdgeViewInner);

export const edgeTypes = { map: MapEdgeView };
