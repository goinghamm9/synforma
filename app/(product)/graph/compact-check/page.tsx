"use client";
/* Scratch route for verification only. Deleted after the Playwright run. */
import dynamic from "next/dynamic";
import { SAMPLE_GRAPH } from "@/components/graph/sample-graph";
import type { WorkGraph } from "@/lib/synforma/types";

const WorkGraph3D = dynamic(() => import("@/components/graph/work-graph-3d").then((m) => m.WorkGraph3D), { ssr: false });
const EMPTY: WorkGraph = { id: "empty", nodes: [], edges: [], version: 0, updatedAt: 0 };

export default function CompactCheck() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <div data-testid="compact-a" className="rounded-lg border border-line">
        <WorkGraph3D graph={SAMPLE_GRAPH} compact height={320} highlightNodeIds={["objective:update-crm", "workflow:opportunity-management", "step:3-qualify-the-opportunity"]} />
      </div>
      <div data-testid="compact-b" className="h-[320px] rounded-lg border border-line">
        <WorkGraph3D graph={EMPTY} compact height="100%" />
      </div>
      <div data-testid="full-c" className="rounded-lg border border-line md:col-span-2">
        <WorkGraph3D graph={SAMPLE_GRAPH} layers={["workflow", "step", "screen", "objective", "outcome"]} />
      </div>
    </div>
  );
}
