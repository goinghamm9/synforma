"use client";
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Square } from "lucide-react";
import { Badge, Button, Label, Switch } from "@/components/ui";
import { useSynforma } from "@/lib/synforma/store";
import type { Program } from "@/lib/synforma/types";
import { formatDuration } from "@/lib/utils";
import { AssistanceCard } from "./assistance-card";
import { CompletionCard, AbandonedCard } from "./completion-card";
import { IntroCard } from "./intro-card";
import { PlannerBadge } from "./planner-badge";
import { SignalsStrip } from "./signals-strip";
import { StepCard } from "./step-card";
import { StepList } from "./step-list";
import type { GuideRunApi } from "./use-guide-run";

function entryLabelFrom(url: string | undefined): string {
  if (!url) return "the entry record";
  const id = /\/([A-Z]{1,4}-\d+)(?:[/?#]|$)/.exec(url)?.[1];
  return id ? `lead ${id}` : "the entry record";
}

/** Elapsed time, ticking once a second while the run is live (never computed during render from Date.now()). */
function useElapsed(startedAt: number | null, live: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!startedAt || !live) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [startedAt, live]);
  if (!startedAt || now === null) return null;
  return now - startedAt;
}

export function SynformaPanel({ program, run }: { program: Program; run: GuideRunApi }) {
  const settings = useSynforma((s) => s.settings);
  const runs = useSynforma((s) => s.runs);
  const allEvents = useSynforma((s) => s.events);
  const allSignals = useSynforma((s) => s.signals);
  const hypotheses = useSynforma((s) => s.hypotheses);

  const storedRun = run.runId ? (runs[run.runId] ?? null) : null;
  const events = useMemo(() => (run.runId ? allEvents.filter((e) => e.runId === run.runId) : []), [allEvents, run.runId]);
  const signals = useMemo(() => (run.runId ? allSignals.filter((s) => s.runId === run.runId) : []), [allSignals, run.runId]);
  const requirements = useMemo(() => program.parsed?.requirements ?? [], [program.parsed]);
  const elapsed = useElapsed(storedRun?.startedAt ?? null, run.phase === "running");

  const steps = run.workflow.steps;
  const located = run.currentIndex >= 0;
  const focusStep = steps[located ? run.currentIndex : 0] ?? null;
  const interventionStep = run.intervention ? (steps.find((s) => s.id === run.intervention!.stepId) ?? null) : null;
  const offerAssist = Boolean(focusStep && (focusStep.mode !== "guide" || (run.intervention?.stepId === focusStep.id && run.intervention.content.offerAssist)));
  const objectHint = program.parsed?.objectHints[0] ?? "record";
  const entryLabel = entryLabelFrom(run.context.entryUrl);

  return (
    <div className="flex h-full flex-col" onPointerDown={run.touch} onKeyDown={run.touch}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface px-4 py-2.5">
        <div className="min-w-0 flex-1 basis-40">
          <p className="eyebrow whitespace-nowrap">Synforma · Guide</p>
          <p className="truncate text-[13px] font-medium text-ink">{program.title}</p>
        </div>
        {run.phase === "running" && storedRun ? (
          <>
            <Badge variant={storedRun.cohort === "control" ? "muted" : "outline"} title="Cohort for measuring assistance" data-testid="cohort-badge">
              <FlaskConical className="h-3 w-3" aria-hidden="true" />
              {storedRun.cohort === "control" ? "Control" : "Treatment"}
            </Badge>
            <span className="mono-data text-[12px] text-slate" aria-label="Elapsed time">
              {elapsed !== null ? formatDuration(elapsed) : "0s"}
            </span>
            <Button variant="ghost" size="sm" onClick={run.abandonRun} data-testid="abandon-run">
              <Square /> Abandon run
            </Button>
          </>
        ) : (
          <div className="max-sm:basis-full">
            <PlannerBadge kind={run.plannerKind} status={run.plannerStatus} />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {run.phase === "idle" ? (
          <IntroCard
            program={program}
            entryLabel={entryLabel}
            objectHint={objectHint}
            plannerKind={run.plannerKind}
            plannerStatus={run.plannerStatus}
            hesitationThresholdMs={settings.hesitationThresholdMs}
            treatmentShare={settings.treatmentShare}
            frameReady={run.frameReady}
            onStart={run.startRun}
          />
        ) : null}

        {run.phase === "completed" && storedRun ? (
          <CompletionCard run={storedRun} requirements={requirements} events={events} outcomeUrl={run.completion?.outcomeUrl ?? null} starting={run.startingAnother} onStartAnother={() => void run.startAnotherRun()} />
        ) : null}
        {run.phase === "abandoned" && storedRun ? <AbandonedCard run={storedRun} starting={run.startingAnother} onStartAnother={() => void run.startAnotherRun()} /> : null}

        {run.phase === "running" ? (
          <>
            {run.intervention ? (
              <AssistanceCard
                intervention={run.intervention}
                hypothesis={hypotheses[run.intervention.hypothesisId] ?? null}
                step={interventionStep}
                assisting={run.assistingStepId === run.intervention.stepId}
                onGotIt={() => run.dismissIntervention(true)}
                onNotHelpful={() => run.dismissIntervention(false)}
                onDoItForMe={() => void run.assistStep(run.intervention!.stepId)}
              />
            ) : null}

            {run.withheld && storedRun?.cohort === "control" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-slate" data-testid="control-withheld">
                <span>Control cohort: assistance withheld for measurement.</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Label htmlFor="show-anyway" className="text-[12px] font-normal text-graphite">
                    Show assistance anyway
                  </Label>
                  <Switch id="show-anyway" checked={false} onCheckedChange={run.showAssistanceAnyway} data-testid="show-anyway" />
                </span>
              </div>
            ) : null}

            {focusStep ? (
              <StepCard
                step={focusStep}
                located={located}
                requirements={requirements}
                checklist={run.checklist}
                offerAssist={offerAssist}
                assisting={run.assistingStepId === focusStep.id}
                onAssist={() => void run.assistStep(focusStep.id)}
              />
            ) : null}

            <StepList steps={steps} currentIndex={run.currentIndex} completedStepIds={run.completedStepIds} running />

            <SignalsStrip signals={signals} runStartedAt={storedRun?.startedAt ?? null} hesitationThresholdMs={settings.hesitationThresholdMs} />
          </>
        ) : null}

        {run.phase !== "running" ? (
          <>
            <div>
              <h3 className="eyebrow mb-1.5">Workflow · inferred from discovery</h3>
              <StepList steps={steps} currentIndex={-1} completedStepIds={[]} running={false} />
            </div>
            {signals.length ? <SignalsStrip signals={signals} runStartedAt={storedRun?.startedAt ?? null} hesitationThresholdMs={settings.hesitationThresholdMs} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
