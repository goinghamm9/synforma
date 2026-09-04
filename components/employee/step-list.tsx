"use client";
import { Check, Lock, Minus } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ExecutionMode, WorkflowStep } from "@/lib/synforma/types";

const MODE_LABEL: Record<ExecutionMode, string> = { guide: "Guide", assist: "Assist", act: "Act" };
const MODE_VARIANT: Record<ExecutionMode, "muted" | "outline" | "default"> = { guide: "muted", assist: "outline", act: "default" };

export function ModeBadge({ mode, className }: { mode: ExecutionMode; className?: string }) {
  return (
    <Badge variant={MODE_VARIANT[mode]} className={className} title={`${MODE_LABEL[mode]} mode`}>
      {MODE_LABEL[mode]}
    </Badge>
  );
}

interface StepListProps {
  steps: WorkflowStep[];
  currentIndex: number;
  completedStepIds: string[];
  running: boolean;
}

/** Workflow steps with live status. Steps passed without an observed completion are shown as passed, not done. */
export function StepList({ steps, currentIndex, completedStepIds, running }: StepListProps) {
  return (
    <ol className="divide-y divide-line rounded-lg border border-line bg-surface" aria-label="Workflow steps" data-testid="step-list">
      {steps.map((step, i) => {
        const done = completedStepIds.includes(step.id);
        const current = running && i === currentIndex;
        const passed = running && !done && currentIndex > i;
        return (
          <li
            key={step.id}
            className={cn("flex items-start gap-3 px-3 py-2.5 text-[13px]", current && "bg-surface-2")}
            aria-current={current ? "step" : undefined}
            data-testid={`step-${step.id}`}
            data-state={done ? "done" : current ? "current" : passed ? "passed" : "upcoming"}
          >
            <span
              className={cn(
                "mono-data mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                done ? "border-verdant bg-verdant text-paper" : current ? "border-ink bg-ink text-paper" : passed ? "border-line-strong text-mist" : "border-line-strong text-slate",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-3 w-3" /> : passed ? <Minus className="h-3 w-3" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate font-medium", done || passed ? "text-slate" : "text-ink")}>{step.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate">
                <ModeBadge mode={step.mode} />
                {step.judgment ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" aria-hidden="true" /> judgment
                  </span>
                ) : null}
                {step.commit ? <span>commits · approval-gated</span> : null}
                {step.requirementIds.length ? <span>req. {step.requirementIds.map((r) => r.replace(/^r/, "")).join(", ")}</span> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
