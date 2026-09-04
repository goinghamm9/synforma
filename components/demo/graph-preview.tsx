"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import { countByType } from "@/lib/synforma/graph/work-graph";
import type { NodeType, WorkGraph } from "@/lib/synforma/types";
import { ErrorBoundary } from "./error-boundary";

/**
 * Compact live Work Graph. The 3D component is loaded lazily on the client
 * and wrapped so that a rendering failure degrades to a counts panel instead
 * of breaking Mission Control.
 */
const WorkGraph3D = dynamic(() => import("@/components/graph/work-graph-3d").then((m) => m.WorkGraph3D), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

const ORDER: NodeType[] = ["application", "screen", "action", "field", "object", "requirement", "workflow", "step", "intervention"];

export function GraphCounts({ graph, note }: { graph: WorkGraph; note?: string }) {
  const counts = countByType(graph);
  const rows = ORDER.filter((t) => counts[t]);
  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap gap-1.5">
        {rows.length === 0 ? <span className="text-xs text-slate">No nodes yet.</span> : null}
        {rows.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-graphite">
            <span className="mono-data text-ink">{counts[t]}</span> {t}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-slate">
        {graph.nodes.length} nodes · {graph.edges.length} edges{note ? ` · ${note}` : ""}
      </div>
    </div>
  );
}

export function GraphPreview({ graph, height = 240, highlightNodeIds }: { graph: WorkGraph; height?: number; highlightNodeIds?: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface" style={{ height }}>
      <ErrorBoundary resetKey={graph.id} fallback={<GraphCounts graph={graph} note="3D view unavailable" />}>
        <WorkGraph3D graph={graph} height="100%" compact highlightNodeIds={highlightNodeIds} />
      </ErrorBoundary>
    </div>
  );
}
