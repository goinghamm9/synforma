"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { decide } from "@/lib/synforma/engine/adoption";
import { DO_NOTHING_ID } from "@/lib/synforma/science/techniques";
import { createPlanner, type Planner } from "@/lib/synforma/planner";
import { useSynforma } from "@/lib/synforma/store";
import type { AssistancePreference, Intervention, KeyboardWindow, PlannerKind, PointerWindow, Program, StruggleSignal } from "@/lib/synforma/types";
import type { CurrentRun, GuideRefs, RecordEvent } from "./shared";
import type { AssistanceFeedback, QuietDecision } from "./types";

const NEGATIVE_FEEDBACK: ReadonlySet<string> = new Set(["not_helpful", "wrong_moment", "wrong_assumption", "too_much_help"]);

export interface InterventionsApi {
  intervention: Intervention | null;
  /** A card the policy chose but the control cohort did not see. */
  withheld: Intervention | null;
  quiet: QuietDecision | null;
  lastPointer: PointerWindow | null;
  lastKeyboard: KeyboardWindow | null;
  setQuiet: (quiet: QuietDecision | null) => void;
  setLastPointer: (window: PointerWindow | null) => void;
  setLastKeyboard: (window: KeyboardWindow | null) => void;
  /** A struggle signal from the observer: record it, decide, then show, withhold or stay quiet. */
  handleSignal: (partial: Omit<StruggleSignal, "id" | "runId">) => Promise<void>;
  dismissIntervention: (feedback?: AssistanceFeedback | "got_it" | "resolved") => void;
  showAssistanceAnyway: () => void;
  setPreference: (preference: AssistancePreference) => void;
  setSensingPaused: (paused: boolean) => void;
  /** startRun: forget the previous run's cards, budget and windows. */
  resetForRun: () => void;
  /** finishRun: drop whatever is on screen. */
  clearForFinish: () => void;
}

/**
 * Assistance decisions. Every signal goes through the policy (`decide`), so
 * "do nothing" is recorded as deliberately as showing help; cards never stack,
 * and the per-run budget (count, spacing) is kept here.
 */
export function useInterventions({
  refs,
  program,
  plannerKind,
  record,
  currentRun,
  refreshOverlay,
  setPreferenceState,
}: {
  refs: GuideRefs;
  program: Program;
  plannerKind: PlannerKind;
  record: RecordEvent;
  currentRun: CurrentRun;
  refreshOverlay: () => void;
  setPreferenceState: (preference: AssistancePreference) => void;
}): InterventionsApi {
  const { runIdRef, phaseRef, currentStepRef, interventionRef, assistingRef, observerRef, preferenceRef, getItDoneRef } = refs;
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [withheld, setWithheld] = useState<Intervention | null>(null);
  const [quiet, setQuiet] = useState<QuietDecision | null>(null);
  const [lastPointer, setLastPointer] = useState<PointerWindow | null>(null);
  const [lastKeyboard, setLastKeyboard] = useState<KeyboardWindow | null>(null);

  const shownRef = useRef<Set<string>>(new Set());
  const shownCountRef = useRef(0);
  const lastShownAtRef = useRef<number | null>(null);
  const forcedRef = useRef(false);
  const reactingRef = useRef(false);
  const plannerRef = useRef<Planner | null>(null);
  const plannerKindRef = useRef<PlannerKind>("heuristic");

  useEffect(() => {
    plannerKindRef.current = plannerKind;
  }, [plannerKind]);

  const showIntervention = useCallback(
    (i: Intervention) => {
      const st = useSynforma.getState();
      const run = currentRun();
      if (!run) return;
      shownRef.current.add(i.id);
      shownCountRef.current += 1;
      lastShownAtRef.current = Date.now();
      interventionRef.current = i;
      setIntervention(i);
      setWithheld(null);
      setQuiet(null);
      record("assistance_shown", { interventionId: i.id, techniqueId: i.techniqueId, generatedBy: i.generatedBy, preference: preferenceRef.current }, i.stepId, `Assistance shown: ${i.content.title}`);
      st.updateRun(run.id, { interventionIds: run.interventionIds.includes(i.id) ? run.interventionIds : [...run.interventionIds, i.id], assistanceShown: (run.assistanceShown ?? 0) + 1 });
      st.addAudit({ actor: "synforma", action: "assistance shown", target: i.content.title, detail: `technique ${i.techniqueId}`, runId: run.id, programId: program.id });
      refreshOverlay();
    },
    [currentRun, interventionRef, preferenceRef, program.id, record, refreshOverlay],
  );

  const handleSignal = useCallback(
    async (partial: Omit<StruggleSignal, "id" | "runId">) => {
      const id = runIdRef.current;
      if (!id || phaseRef.current !== "running") return;
      if (assistingRef.current) return; // Synforma is acting; this is not the person's struggle.
      const st = useSynforma.getState();
      const signal = st.addSignal({ ...partial, runId: id });
      if (interventionRef.current || reactingRef.current) return; // never stack cards
      reactingRef.current = true;
      try {
        if (!plannerRef.current || plannerRef.current.kind !== plannerKindRef.current) plannerRef.current = createPlanner(plannerKindRef.current);
        const fresh = useSynforma.getState();
        const decision = await decide(signal, {
          planner: plannerRef.current,
          program,
          getSignalsForStep: (stepId) => useSynforma.getState().signals.filter((s) => s.runId === id && s.stepId === stepId),
          getInterventionsForStep: (stepId) => Object.values(useSynforma.getState().interventions).filter((i) => i.programId === program.id && i.stepId === stepId),
          getRuns: () => Object.values(useSynforma.getState().runs).filter((r) => r.programId === program.id),
          saveHypothesis: fresh.addHypothesis,
          saveIntervention: fresh.upsertIntervention,
          preference: preferenceRef.current,
          getItDone: getItDoneRef.current,
          proficiency: fresh.proficiency[`${program.id}/${signal.stepId}`],
          shownThisRun: shownCountRef.current,
          sinceLastShownMs: lastShownAtRef.current !== null ? Date.now() - lastShownAtRef.current : undefined,
        });
        if (!decision || phaseRef.current !== "running" || runIdRef.current !== id) return;
        if (decision.selected === DO_NOTHING_ID || !decision.intervention) {
          // DO_NOTHING won. Record it as deliberately as showing help (false-intervention metric).
          const run = currentRun();
          record(
            "intervention_withheld",
            { candidates: decision.candidates.slice(0, 5), reason: decision.reason, frictionState: signal.frictionState ?? null, frictionConfidence: signal.frictionConfidence ?? null, signalType: signal.type, hypothesisId: decision.hypothesis.id, preference: preferenceRef.current },
            signal.stepId,
            `Stayed quiet: ${signal.frictionState ?? signal.type}`,
          );
          if (run) useSynforma.getState().updateRun(run.id, { withheld: (run.withheld ?? 0) + 1 });
          setQuiet({ stepId: signal.stepId, frictionState: signal.frictionState ?? null, confidence: signal.frictionConfidence ?? null, signalType: signal.type, detail: signal.detail, candidates: decision.candidates.slice(0, 3), reason: decision.reason, t: signal.t });
          return;
        }
        const result = decision.intervention;
        if (shownRef.current.has(result.id) || interventionRef.current) return;
        const run = currentRun();
        if (!run) return;
        if (run.cohort === "control" && !forcedRef.current) {
          record("note", { withheld: true, interventionId: result.id, techniqueId: result.techniqueId, cohort: "control" }, result.stepId, "Assistance withheld: control cohort");
          setWithheld(result);
          return;
        }
        showIntervention(result);
      } catch (e) {
        toast.error("Synforma could not compose assistance", { description: e instanceof Error ? e.message : String(e) });
      } finally {
        reactingRef.current = false;
      }
    },
    [assistingRef, currentRun, getItDoneRef, interventionRef, phaseRef, preferenceRef, program, record, runIdRef, showIntervention],
  );

  const dismissIntervention = useCallback(
    (feedback: AssistanceFeedback | "got_it" | "resolved" = "got_it") => {
      const i = interventionRef.current;
      if (!i) return;
      const negative = NEGATIVE_FEEDBACK.has(feedback);
      const message = feedback === "got_it" ? "Assistance dismissed" : feedback === "resolved" ? "Assistance resolved: Synforma did the step" : feedback === "not_helpful" ? "Assistance marked not helpful" : `Feedback: ${feedback.replace(/_/g, " ")}`;
      record("assistance_dismissed", { interventionId: i.id, techniqueId: i.techniqueId, feedback, ...(negative ? { helpful: false } : {}) }, i.stepId, message);
      if (feedback !== "got_it" && feedback !== "resolved") {
        const run = currentRun();
        useSynforma.getState().addAudit({ actor: "human", action: "assistance feedback", target: i.content.title, detail: feedback.replace(/_/g, " "), runId: run?.id, programId: program.id });
      }
      interventionRef.current = null;
      setIntervention(null);
      observerRef.current?.touch();
      refreshOverlay();
    },
    [currentRun, interventionRef, observerRef, program.id, record, refreshOverlay],
  );

  const showAssistanceAnyway = useCallback(() => {
    const run = currentRun();
    if (!run) return;
    const st = useSynforma.getState();
    forcedRef.current = true;
    st.updateRun(run.id, { cohort: "treatment" });
    record("note", { cohortOverride: "treatment" }, currentStepRef.current?.id, "Person chose to see assistance: run moved to the treatment cohort");
    st.addAudit({ actor: "human", action: "cohort override", detail: "control → treatment (assistance requested)", runId: run.id, programId: program.id });
    if (withheld && !interventionRef.current && !shownRef.current.has(withheld.id)) showIntervention(withheld);
    else setWithheld(null);
  }, [currentRun, currentStepRef, interventionRef, program.id, record, showIntervention, withheld]);

  const setPreference = useCallback(
    (next: AssistancePreference) => {
      if (next === preferenceRef.current) return;
      preferenceRef.current = next;
      setPreferenceState(next);
      const st = useSynforma.getState();
      st.setSettings({ assistancePreference: next });
      const run = currentRun();
      if (run && phaseRef.current === "running") {
        st.updateRun(run.id, { preference: next });
        record("note", { preference: next }, currentStepRef.current?.id, `Assistance preference changed to "${next.replace(/_/g, " ")}"`);
        st.addAudit({ actor: "human", action: "assistance preference", detail: next.replace(/_/g, " "), runId: run.id, programId: program.id });
      }
    },
    [currentRun, currentStepRef, phaseRef, preferenceRef, program.id, record, setPreferenceState],
  );

  const setSensingPaused = useCallback(
    (paused: boolean) => {
      const st = useSynforma.getState();
      if (st.settings.sensingPaused === paused) return;
      st.setSettings({ sensingPaused: paused });
      observerRef.current?.setSensing(st.settings.interactionSensing && !paused);
      if (paused) {
        setLastPointer(null);
        setLastKeyboard(null);
      }
      record("note", { sensingPaused: paused }, currentStepRef.current?.id, paused ? "Interaction sensing paused by the person" : "Interaction sensing resumed by the person");
      st.addAudit({ actor: "human", action: paused ? "sensing paused" : "sensing resumed", runId: runIdRef.current ?? undefined, programId: program.id });
    },
    [currentStepRef, observerRef, program.id, record, runIdRef],
  );

  const resetForRun = useCallback(() => {
    shownRef.current = new Set();
    shownCountRef.current = 0;
    lastShownAtRef.current = null;
    forcedRef.current = false;
    interventionRef.current = null;
    setIntervention(null);
    setWithheld(null);
    setQuiet(null);
    setLastPointer(null);
    setLastKeyboard(null);
  }, [interventionRef]);

  const clearForFinish = useCallback(() => {
    interventionRef.current = null;
    setIntervention(null);
    setWithheld(null);
    setQuiet(null);
  }, [interventionRef]);

  return {
    intervention,
    withheld,
    quiet,
    lastPointer,
    lastKeyboard,
    setQuiet,
    setLastPointer,
    setLastKeyboard,
    handleSignal,
    dismissIntervention,
    showAssistanceAnyway,
    setPreference,
    setSensingPaused,
    resetForRun,
    clearForFinish,
  };
}
