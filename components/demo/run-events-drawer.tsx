"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui";
import { cn, formatDuration } from "@/lib/utils";
import type { Run, RunEvent, Workflow } from "@/lib/synforma/types";
import { ActorBadge, OutcomeBadge } from "./bits";

const TONE: Partial<Record<RunEvent["type"], string>> = {
  action_regrounded: "bg-verdant-soft text-verdant",
  action_failed: "text-signal",
  run_failed: "text-signal",
  validation_error: "text-amber",
  hesitation: "text-amber",
  backtrack: "text-amber",
  wrong_screen: "text-amber",
  run_abandoned: "text-amber",
  approval_requested: "text-amber",
  approval_granted: "text-verdant",
  approval_denied: "text-signal",
  run_completed: "text-verdant",
  outcome_verified: "text-verdant",
};

export function RunEventsDrawer({ run, events, workflow, open, onOpenChange }: { run: Run | null; events: RunEvent[]; workflow?: Workflow; open: boolean; onOpenChange: (open: boolean) => void }) {
  const stepTitle = (id?: string) => (id ? workflow?.steps.find((s) => s.id === id)?.title ?? id : "");
  const sorted = React.useMemo(() => [...events].sort((a, b) => a.t - b.t), [events]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" className="max-w-lg">
        {run ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Run timeline</DialogTitle>
              <DialogDescription>
                <span className="mono-data">{run.id}</span> · started {new Date(run.startedAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <ActorBadge actor={run.actor} persona={run.persona} />
              <OutcomeBadge outcome={run.outcome} />
              {run.uiVariant ? <span className="rounded-full border border-line px-2 py-0.5 text-graphite">UI {run.uiVariant}</span> : null}
              {run.cohort ? <span className="rounded-full border border-line px-2 py-0.5 text-graphite">{run.cohort}</span> : null}
              <span className="text-slate">{run.endedAt ? formatDuration(run.endedAt - run.startedAt) : "in progress"}</span>
              <span className="text-slate">{run.regroundings} re-grounding{run.regroundings === 1 ? "" : "s"}</span>
            </div>
            {run.actor === "synthetic" ? <p className="mt-2 text-xs text-amber">Synthetic run — a labeled simulation, never mixed into human timing.</p> : null}
            <ol className="mt-4 space-y-1.5 border-l border-line pl-3">
              {sorted.length === 0 ? <li className="text-sm text-slate">No events recorded for this run.</li> : null}
              {sorted.map((e) => (
                <li key={e.id} className="relative text-xs">
                  <span className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-line-strong" aria-hidden="true" />
                  <div className="flex items-baseline gap-2">
                    <span className="mono-data shrink-0 text-mist">{formatDuration(e.t - run.startedAt)}</span>
                    <span className={cn("rounded px-1 font-medium", TONE[e.type] ?? "text-graphite")}>{e.type.replace(/_/g, " ")}</span>
                    {e.stepId ? <span className="truncate text-slate">{stepTitle(e.stepId)}</span> : null}
                  </div>
                  {e.message ? <div className="mt-0.5 break-words pl-1 text-graphite">{e.message}</div> : null}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="text-base">Run timeline</DialogTitle>
            <DialogDescription>Select a run to see its events.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
