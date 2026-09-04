"use client";
import { Badge } from "@/components/ui";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import type { PlannerKind } from "@/lib/synforma/types";

/** Honest planner label: which reasoning engine composes assistance right now. */
export function PlannerBadge({ kind, status }: { kind: PlannerKind; status: PlannerStatus | null }) {
  if (kind === "gemini") {
    return (
      <Badge variant="outline" data-testid="planner-badge">
        Gemini planner{status?.model ? ` · ${status.model}` : ""}
      </Badge>
    );
  }
  const reason = !status ? "checking configuration" : status.configured ? "selected in settings" : "no API key configured";
  return (
    <Badge variant="muted" data-testid="planner-badge">
      Heuristic planner — {reason}
    </Badge>
  );
}
