"use client";
import Link from "next/link";
import { Check, Circle, Loader2, RotateCcw, TrendingDown } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader } from "@/components/ui";
import { LEVEL_LABEL } from "@/lib/synforma/engine/proficiency";
import type { Requirement, Run, RunEvent } from "@/lib/synforma/types";
import { formatDuration } from "@/lib/utils";
import type { FadedStep } from "./use-guide-run";

/** Steps whose assistance level faded at the end of this run. */
export function FadedSteps({ steps }: { steps: FadedStep[] }) {
  if (!steps.length) return null;
  return (
    <ul className="mt-3 space-y-1" aria-label="Less help next time" data-testid="faded-steps">
      {steps.map((f) => (
        <li key={f.stepId} className="flex items-start gap-2 rounded-md bg-verdant-soft/60 px-2.5 py-2 text-[12px] text-graphite" data-testid="faded-step" data-step-id={f.stepId}>
          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verdant" aria-hidden="true" />
          <span>
            Less help next time on <span className="font-medium text-ink">{f.title}</span> <span className="mono-data text-slate">· now {LEVEL_LABEL[f.level]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface CompletionCardProps {
  run: Run;
  requirements: Requirement[];
  events: RunEvent[];
  outcomeUrl: string | null;
  starting: boolean;
  fadedSteps: FadedStep[];
  onStartAnother: () => void;
}

/** The run ended on the outcome screen: what was verified there, and what it took. */
export function CompletionCard({ run, requirements, events, outcomeUrl, starting, fadedSteps, onStartAnother }: CompletionCardProps) {
  const fields = requirements.filter((r) => r.kind === "field");
  const met = new Set(run.requirementsMet);
  const allMet = fields.length > 0 && fields.every((r) => met.has(r.id));
  const assistanceShown = events.filter((e) => e.type === "assistance_shown").length;
  const assists = events.filter((e) => e.type === "assist_completed" && e.data?.outcome === "completed").length;
  const duration = run.endedAt ? run.endedAt - run.startedAt : null;
  return (
    <Card className={allMet ? "border-verdant/40" : "border-amber/40"} data-testid="completion-card">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Run completed · observed</p>
          <Badge variant={allMet ? "verdant" : "amber"}>{allMet ? "Intent-to-Outcome: success" : "Completed, requirements missing"}</Badge>
        </div>
        <h2 className="text-[15px] font-medium leading-snug text-ink" data-testid="completion-summary">
          {met.size} of {fields.length} requirements verified on the outcome screen
        </h2>
        <p className="text-[12px] text-slate">Verified by reading the saved record{outcomeUrl ? <span className="mono-data"> · {outcomeUrl}</span> : null}. Nothing was assumed from the form.</p>
      </CardHeader>
      <CardContent className="p-4">
        <ul className="divide-y divide-line rounded-md border border-line" aria-label="Requirements verified">
          {fields.map((r) => {
            const ok = met.has(r.id);
            return (
              <li key={r.id} className="flex items-start gap-2 px-2.5 py-2 text-[12px]" data-testid={`verified-${r.id}`} data-met={ok}>
                {ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verdant" aria-hidden="true" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist" aria-hidden="true" />}
                <span className={ok ? "text-graphite" : "text-ink"}>
                  <span className="mono-data mr-1 text-slate">{r.id.replace(/^r/, "")}.</span>
                  {r.text}
                </span>
                <span className="sr-only">{ok ? "verified" : "not verified"}</span>
              </li>
            );
          })}
        </ul>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-md bg-surface-2 px-2.5 py-2">
            <dt className="text-slate">Time</dt>
            <dd className="mono-data text-ink">{duration !== null ? formatDuration(duration) : "—"}</dd>
          </div>
          <div className="rounded-md bg-surface-2 px-2.5 py-2">
            <dt className="text-slate">Assistance shown</dt>
            <dd className="mono-data text-ink">{assistanceShown}</dd>
          </div>
          <div className="rounded-md bg-surface-2 px-2.5 py-2">
            <dt className="text-slate">Steps done for you</dt>
            <dd className="mono-data text-ink">{assists}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-slate">
          {run.cohort === "control" ? "Control cohort: assistance was withheld for measurement." : "Treatment cohort."} UI {run.uiVariant ?? "v1"}
          {run.regroundings ? ` · ${run.regroundings} semantic re-grounding${run.regroundings === 1 ? "" : "s"}` : ""}
          {run.getItDone ? " · Get It Done was used" : ""}
          {run.withheld ? ` · stayed quiet ${run.withheld}×` : ""}.
        </p>
        <FadedSteps steps={fadedSteps} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={onStartAnother} disabled={starting} data-testid="start-another">
            {starting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Start another run
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/demo">See it in Mission Control</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AbandonedCard({ run, starting, fadedSteps = [], onStartAnother }: { run: Run; starting: boolean; fadedSteps?: FadedStep[]; onStartAnother: () => void }) {
  const duration = run.endedAt ? run.endedAt - run.startedAt : null;
  return (
    <Card data-testid="abandoned-card">
      <CardHeader className="p-4 pb-0">
        <p className="eyebrow">Run abandoned · observed</p>
        <h2 className="text-[15px] font-medium leading-snug text-ink">The run ended before the outcome screen</h2>
        <p className="text-[12px] text-slate">
          Recorded as abandoned after <span className="mono-data">{duration !== null ? formatDuration(duration) : "—"}</span>. Abandonments count against the Intent-to-Outcome Rate; nothing is hidden.
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <FadedSteps steps={fadedSteps} />
        <Button onClick={onStartAnother} disabled={starting} className="mt-3 first:mt-0" data-testid="start-another">
          {starting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Start another run
        </Button>
      </CardContent>
    </Card>
  );
}
