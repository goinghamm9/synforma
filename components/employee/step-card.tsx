"use client";
import { Check, Circle, Loader2, Lock, Wand2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader } from "@/components/ui";
import type { ChecklistItem } from "@/lib/synforma/engine/observer";
import type { Requirement, WorkflowStep } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { ModeBadge } from "./step-list";

/** A judgment field Synforma skipped during Get It Done. */
export interface LeftForYou {
  requirementId: string | null;
  fieldName: string;
}

interface StepCardProps {
  step: WorkflowStep;
  /** True when the observer has located the person on this step; false when it is merely the next one. */
  located: boolean;
  requirements: Requirement[];
  checklist: ChecklistItem[];
  offerAssist: boolean;
  assisting: boolean;
  /** Judgment fields Synforma left to the person (Get It Done). */
  leftForYou?: LeftForYou[];
  onAssist: () => void;
}

function isLeft(left: LeftForYou[], requirementId: string, fieldName: string | undefined): boolean {
  return left.some((l) => l.requirementId === requirementId || (Boolean(fieldName) && l.fieldName === fieldName));
}

export function RequirementChecklist({
  requirements,
  checklist,
  stepRequirementIds,
  leftForYou = [],
}: {
  requirements: Requirement[];
  checklist: ChecklistItem[];
  stepRequirementIds: string[];
  leftForYou?: LeftForYou[];
}) {
  const items = requirements.filter((r) => stepRequirementIds.includes(r.id));
  if (!items.length) return null;
  return (
    <ul className="mt-3 divide-y divide-line rounded-md border border-line" aria-label="Requirements on this step" data-testid="requirement-checklist">
      {items.map((r) => {
        const live = checklist.find((c) => c.requirementId === r.id);
        const met = Boolean(live?.met);
        const left = !met && isLeft(leftForYou, r.id, live?.fieldName);
        return (
          <li key={r.id} className="flex items-start gap-2 px-2.5 py-2 text-[12px]" data-testid={`req-${r.id}`} data-met={met} data-left={left || undefined}>
            {met ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verdant" aria-hidden="true" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className={cn("block", met ? "text-graphite" : "text-ink")}>
                <span className="mono-data mr-1 text-slate">{r.id.replace(/^r/, "")}.</span>
                {r.text}
              </span>
              {live?.fieldName ? (
                <span className="mono-data mt-0.5 block truncate text-[11px] text-slate">
                  {live.fieldName}: {live.value?.trim() ? live.value : "—"}
                </span>
              ) : null}
            </span>
            {left ? (
              <Badge variant="amber" className="shrink-0" data-testid="left-for-you">
                <Lock className="h-3 w-3" aria-hidden="true" /> Left for you
              </Badge>
            ) : null}
            <span className="sr-only">{met ? "met" : "not met"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The step the person is on (or up next), with a live checklist computed from the interface. */
export function StepCard({ step, located, requirements, checklist, offerAssist, assisting, leftForYou = [], onAssist }: StepCardProps) {
  const leftHere = leftForYou.filter((l) => (l.requirementId ? step.requirementIds.includes(l.requirementId) : true));
  return (
    <Card data-testid="current-step-card">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">{located ? `Current step · ${step.index + 1}` : `Up next · step ${step.index + 1}`}</p>
          <ModeBadge mode={step.mode} />
        </div>
        <h2 className="text-[15px] font-medium leading-snug text-ink">{step.title}</h2>
        {step.description ? <p className="text-[12px] leading-relaxed text-graphite">{step.description}</p> : null}
        {step.expected ? (
          <p className="text-[12px] text-slate">
            <span className="text-graphite">Done when:</span> {step.expected}
          </p>
        ) : null}
        {!located ? <p className="text-[12px] text-slate">Synforma has not seen this screen yet. Open it in the application, or let Synforma take you there.</p> : null}
      </CardHeader>
      <CardContent className="p-4">
        <RequirementChecklist requirements={requirements} checklist={checklist} stepRequirementIds={step.requirementIds} leftForYou={leftForYou} />
        {leftHere.length && step.requirementIds.length ? (
          <p className="mt-2 text-[12px] text-slate" data-testid="left-for-you-note">
            Left for you: {leftHere.map((l) => l.fieldName).join(", ")}. Synforma filled the routine fields and did not guess these.
          </p>
        ) : null}
        {step.judgment ? (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-[12px] text-graphite" data-testid="judgment-note">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" aria-hidden="true" />
            This needs your judgment — Synforma will not guess. {step.modeRationale}
          </p>
        ) : null}
        {offerAssist ? (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onAssist} disabled={assisting} data-testid="assist-step">
              {assisting ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {assisting ? "Synforma is doing this…" : "Do this step for me"}
            </Button>
            {step.commit ? <span className="text-[11px] text-slate">You will be asked to approve the commit.</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
