"use client";
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Square } from "lucide-react";
import { Badge, Button, Label, Switch } from "@/components/ui";
import { composeRecap } from "@/lib/synforma/engine/proficiency";
import { useSynforma } from "@/lib/synforma/store";
import type { Program } from "@/lib/synforma/types";
import { formatDuration } from "@/lib/utils";
import { AssistanceCard, QUIET_TECHNIQUES } from "./assistance-card";
import { AssistanceChooser } from "./assistance-chooser";
import { CompletionCard, AbandonedCard } from "./completion-card";
import { FrictionChip } from "./friction-chip";
import { GetItDoneButton, GetItDoneStatus, RecapCard } from "./get-it-done";
import { IndependenceList } from "./independence-list";
import { IntroCard } from "./intro-card";
import { PlannerBadge } from "./planner-badge";
import { QuietLine } from "./quiet-line";
import { SensingInspector } from "./sensing-inspector";
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
  const withheldCount = useMemo(() => events.filter((e) => e.type === "intervention_withheld").length, [events]);
  const elapsed = useElapsed(storedRun?.startedAt ?? null, run.phase === "running");

  const steps = run.workflow.steps;
  const located = run.currentIndex >= 0;
  const focusStep = steps[located ? run.currentIndex : 0] ?? null;
  const interventionStep = run.intervention ? (steps.find((s) => s.id === run.intervention!.stepId) ?? null) : null;
  const offerAssist = Boolean(focusStep && (focusStep.mode !== "guide" || (run.intervention?.stepId === focusStep.id && run.intervention.content.offerAssist)));
  const objectHint = program.parsed?.objectHints[0] ?? "record";
  const entryLabel = entryLabelFrom(run.context.entryUrl);
  const busy = run.assistingStepId !== null || run.getItDone.status !== "idle";
  const recap = useMemo(() => (run.phase === "completed" && storedRun?.getItDone && run.runId ? composeRecap(events, run.workflow, run.runId) : null), [events, run.phase, run.runId, run.workflow, storedRun?.getItDone]);
  const handledSteps = useMemo(() => steps.filter((s) => run.getItDone.handledStepIds.includes(s.id)), [run.getItDone.handledStepIds, steps]);
  // A quiet note ("clarify consequence") never gets a ring; the hook already withholds it, this only keeps the two in step.
  const quietIntervention = Boolean(run.intervention && QUIET_TECHNIQUES.has(run.intervention.techniqueId));

  return (
    <div className="flex h-full flex-col" onPointerDown={run.touch} onKeyDown={run.touch}>
      <header className="shrink-0 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1 basis-40">
            <p className="eyebrow whitespace-nowrap">Synforma · Guide</p>
            <p className="truncate text-[13px] font-medium text-ink">{program.title}</p>
          </div>
          {run.phase === "running" && storedRun ? (
            <Button variant="ghost" size="sm" onClick={run.abandonRun} data-testid="abandon-run">
              <Square /> Abandon run
            </Button>
          ) : (
            <div className="max-sm:basis-full">
              <PlannerBadge kind={run.plannerKind} status={run.plannerStatus} />
            </div>
          )}
        </div>
        {run.phase === "running" && storedRun ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5" data-testid="run-status-row">
            <FrictionChip friction={run.friction} />
            <Badge variant={storedRun.cohort === "control" ? "muted" : "outline"} title="Cohort for measuring assistance" data-testid="cohort-badge">
              <FlaskConical className="h-3 w-3" aria-hidden="true" />
              {storedRun.cohort === "control" ? "Control" : "Treatment"}
            </Badge>
            <span className="mono-data text-[12px] text-slate" aria-label="Elapsed time">
              {elapsed !== null ? formatDuration(elapsed) : "0s"}
            </span>
            <div className="ml-auto min-w-[150px] max-w-[220px] flex-1">
              <AssistanceChooser value={run.preference} onChange={run.setPreference} variant="compact" />
            </div>
          </div>
        ) : null}
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
            preference={run.preference}
            onPreferenceChange={run.setPreference}
            onOverrideProficiency={run.overrideProficiency}
            onStart={run.startRun}
          />
        ) : null}

        {run.phase === "completed" && storedRun ? (
          <CompletionCard
            run={storedRun}
            requirements={requirements}
            events={events}
            outcomeUrl={run.completion?.outcomeUrl ?? null}
            starting={run.startingAnother}
            fadedSteps={run.fadedSteps}
            onStartAnother={() => void run.startAnotherRun()}
          />
        ) : null}
        {run.phase === "completed" && recap ? <RecapCard recap={recap} handledSteps={handledSteps} onChoose={run.chooseNextTime} /> : null}
        {run.phase === "abandoned" && storedRun ? <AbandonedCard run={storedRun} starting={run.startingAnother} fadedSteps={run.fadedSteps} onStartAnother={() => void run.startAnotherRun()} /> : null}

        {run.phase === "running" ? (
          <>
            <GetItDoneStatus state={run.getItDone} steps={steps} currentIndex={run.currentIndex} approvalOpen={run.approval !== null} onReopen={run.reopenApproval} />

            {run.intervention ? (
              <AssistanceCard
                intervention={run.intervention}
                hypothesis={hypotheses[run.intervention.hypothesisId] ?? null}
                step={interventionStep}
                assisting={run.assistingStepId === run.intervention.stepId}
                onGotIt={() => run.dismissIntervention("got_it")}
                onFeedback={(feedback) => run.dismissIntervention(feedback)}
                onDoItForMe={() => void run.assistStep(run.intervention!.stepId)}
              />
            ) : null}

            {run.quiet && !run.intervention ? <QuietLine quiet={run.quiet} /> : null}

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
                offerAssist={offerAssist && !quietIntervention}
                assisting={run.assistingStepId === focusStep.id}
                leftForYou={run.getItDone.leftForYou}
                onAssist={() => void run.assistStep(focusStep.id)}
              />
            ) : null}

            {run.getItDone.status === "idle" ? <GetItDoneButton disabled={busy} onClick={run.getItDoneNow} /> : null}

            <StepList steps={steps} currentIndex={run.currentIndex} completedStepIds={run.completedStepIds} running />

            <SensingInspector pointer={run.lastPointer} keyboard={run.lastKeyboard} sensing={run.sensing} running onPause={run.setSensingPaused} />

            <SignalsStrip signals={signals} runStartedAt={storedRun?.startedAt ?? null} hesitationThresholdMs={settings.hesitationThresholdMs} withheldCount={withheldCount} />
          </>
        ) : null}

        {run.phase !== "running" ? (
          <>
            <div>
              <h3 className="eyebrow mb-1.5">Workflow · inferred from discovery</h3>
              <StepList steps={steps} currentIndex={-1} completedStepIds={[]} running={false} />
            </div>
            {run.phase !== "idle" ? (
              <div>
                <h3 className="eyebrow mb-1.5">Your independence</h3>
                <IndependenceList program={program} onOverride={run.overrideProficiency} />
              </div>
            ) : null}
            <SensingInspector pointer={null} keyboard={null} sensing={run.sensing} running={false} onPause={run.setSensingPaused} />
            {signals.length || withheldCount ? <SignalsStrip signals={signals} runStartedAt={storedRun?.startedAt ?? null} hesitationThresholdMs={settings.hesitationThresholdMs} withheldCount={withheldCount} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
