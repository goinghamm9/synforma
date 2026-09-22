"use client";
import { useDecider } from "@/components/decisions/use-decider";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { IframeDriver } from "@/lib/synforma/interaction/driver";
import { HumanObserver, type ChecklistItem } from "@/lib/synforma/engine/observer";
import { assignCohort } from "@/lib/synforma/engine/adoption";
import { fetchPlannerStatus, resolvePlannerKind } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import { contextFor, targetForProgram } from "@/lib/synforma/targets";
import { useSynforma } from "@/lib/synforma/store";
import type { AssistancePreference, FrictionInference, KeyboardWindow, PageModel, PlannerKind, PointerWindow, Program, Run } from "@/lib/synforma/types";
import { shortId } from "@/lib/utils";
import { useGuideRefs, type CurrentRun, type RecordEvent } from "./guide/shared";
import type { GuideRunApi, RunPhase, SensingStatus } from "./guide/types";
import { useApprovals } from "./guide/use-approvals";
import { useAssist } from "./guide/use-assist";
import { useFrame } from "./guide/use-frame";
import { useGetItDone } from "./guide/use-get-it-done";
import { useInterventions } from "./guide/use-interventions";
import { useOverlay } from "./guide/use-overlay";
import { useProficiency } from "./guide/use-proficiency";

export type {
  AssistanceFeedback,
  FadedStep,
  FrameBox,
  GetItDoneState,
  GuideRunApi,
  GuideRunState,
  OverlayCursor,
  OverlayHighlight,
  PendingApproval,
  QuietDecision,
  RunPhase,
  SensingStatus,
} from "./guide/types";

/**
 * Guide-mode run orchestration for the Employee view.
 *
 * Owns exactly one IframeDriver (created lazily for the mounted iframe) and at
 * most one HumanObserver per run. Everything observed is written to the store
 * as RunEvents; nothing here is estimated. Decisions go through the policy
 * (`decide`), so "do nothing" is recorded as deliberately as showing help.
 *
 * This hook is the composition: it wires the focused hooks under ./guide
 * (frame, overlay, interventions, approvals, assist, Get It Done, proficiency),
 * owns the run lifecycle and the observer session, and records what the
 * observer reports.
 */

const UI_VERSION_KEY = "meridian-ui-version";

function readUiVariant(driver: IframeDriver): string {
  try {
    return driver.win?.localStorage.getItem(UI_VERSION_KEY) ?? "v1";
  } catch {
    return "v1";
  }
}

export function useGuideRun(program: Program, iframeRef: RefObject<HTMLIFrameElement | null>): GuideRunApi {
  const workflow = program.workflow!;
  const requirements = useMemo(() => program.parsed?.requirements ?? [], [program.parsed]);
  const context = useMemo(() => ({ ...contextFor(targetForProgram(program)), ...((program as Program & { context?: Record<string, string> }).context ?? {}) }), [program]);
  const startUrl = workflow.startUrl || context.entryUrl || program.application.baseUrl;
  const settings = useSynforma((s) => s.settings);

  const [phase, setPhase] = useState<RunPhase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [page, setPage] = useState<PageModel | null>(null);
  const [completion, setCompletion] = useState<{ requirementsMet: string[]; outcomeUrl: string } | null>(null);
  const [plannerStatus, setPlannerStatus] = useState<PlannerStatus | null>(null);
  const [startingAnother, setStartingAnother] = useState(false);
  const [preference, setPreferenceState] = useState<AssistancePreference>(() => useSynforma.getState().settings.assistancePreference);
  const [friction, setFriction] = useState<FrictionInference | null>(null);

  const refs = useGuideRefs(preference);
  const { observerRef, runIdRef, phaseRef, currentStepRef, preferenceRef, getItDoneRef, foundRef } = refs;

  const sensing: SensingStatus = !settings.interactionSensing ? "off" : settings.sensingPaused ? "paused" : "on";

  // Until the server has answered, assume no live LLM is configured (never claim more than is known).
  const plannerKind: PlannerKind = plannerStatus ? resolvePlannerKind(settings.plannerPreference, plannerStatus) : "heuristic";

  useEffect(() => {
    let cancelled = false;
    void fetchPlannerStatus().then((s) => {
      if (!cancelled) setPlannerStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─────────────── store helpers (always read fresh state) ───────────────

  const record = useCallback<RecordEvent>(
    (type, data, stepId, message) => {
      const id = runIdRef.current;
      if (!id) return;
      useSynforma.getState().addEvent({ runId: id, type, stepId, message, data });
    },
    [runIdRef],
  );

  const currentRun = useCallback<CurrentRun>(() => {
    const id = runIdRef.current;
    return id ? (useSynforma.getState().runs[id] ?? null) : null;
  }, [runIdRef]);

  // ─────────────── focused hooks ───────────────

  const { highlight, cursor, setCursor, updateOverlay, refreshOverlay, clearOverlay } = useOverlay(refs);
  const { frameReady, frameError, frame, getDriver, measureFrame, loadStart } = useFrame({ refs, iframeRef, startUrl, setCursor });
  const interventions = useInterventions({ refs, program, plannerKind, record, currentRun, refreshOverlay, setPreferenceState });
  const { handleSignal, dismissIntervention, setQuiet, setLastPointer, setLastKeyboard, resetForRun: resetInterventions, clearForFinish: clearInterventions } = interventions;
  const approvals = useApprovals({ refs, programId: program.id });
  const { approval, requestApproval, decideApproval, clear: clearApproval } = approvals;
  const { decider } = useDecider();
  const { assistingStepId, assistStep } = useAssist({ refs, programId: program.id, workflow, requirements, context, record, currentRun, requestApproval, dismissIntervention, setCursor, decider });
  const gid = useGetItDone({ refs, program, workflow, requirements, context, record, currentRun, approvals, dismissIntervention, setCursor, setPreferenceState, decider });
  const { attachShortcut, beginRun: beginGetItDone, endRun: endGetItDone } = gid;
  const { fadedSteps, clearFaded, overrideProficiency, applyProficiency } = useProficiency({ refs, programId: program.id, workflow, record });

  // ─────────────── run lifecycle ───────────────

  const finishRun = useCallback(
    (outcome: "completed" | "abandoned", extra: Partial<Run>, reason?: string) => {
      const run = currentRun();
      const st = useSynforma.getState();
      if (run) {
        st.updateRun(run.id, { outcome, endedAt: Date.now(), ...extra });
        st.addAudit({ actor: "human", action: outcome === "completed" ? "run completed" : "run abandoned", detail: reason, runId: run.id, programId: program.id });
        applyProficiency({ ...run, outcome, ...extra }, outcome);
      }
      observerRef.current?.stop();
      observerRef.current = null;
      endGetItDone();
      clearInterventions();
      currentStepRef.current = null;
      foundRef.current = null;
      setFriction(null);
      clearApproval();
      clearOverlay();
      phaseRef.current = outcome;
      setPhase(outcome);
    },
    [applyProficiency, clearApproval, clearInterventions, clearOverlay, currentRun, currentStepRef, endGetItDone, foundRef, observerRef, phaseRef, program.id],
  );

  const startRun = useCallback(() => {
    const driver = getDriver();
    if (!driver || phaseRef.current === "running") return;
    const st = useSynforma.getState();
    const id = shortId("run");
    const run: Run = {
      id,
      programId: program.id,
      workflowId: workflow.id,
      actor: "human",
      mode: "guide",
      startedAt: Date.now(),
      cohort: assignCohort(id, st.settings.treatmentShare),
      interventionIds: [],
      requirementsMet: [],
      regroundings: 0,
      uiVariant: readUiVariant(driver),
      preference: preferenceRef.current,
      getItDone: false,
      assistanceShown: 0,
      withheld: 0,
    };
    st.addRun(run);
    runIdRef.current = id;
    resetInterventions();
    getItDoneRef.current = false;
    foundRef.current = null;
    beginGetItDone();
    currentStepRef.current = null;
    phaseRef.current = "running";
    setRunId(id);
    setPhase("running");
    setCurrentIndex(-1);
    setCompletedStepIds([]);
    setChecklist([]);
    setFriction(null);
    clearFaded();
    setCompletion(null);
    clearOverlay();
    const sensingOn = st.settings.interactionSensing && !st.settings.sensingPaused;
    st.addEvent({
      runId: id,
      type: "run_started",
      message: `Guide run started (${run.cohort} cohort, UI ${run.uiVariant}, ${run.preference?.replace(/_/g, " ")})`,
      data: { actor: "human", mode: "guide", cohort: run.cohort, uiVariant: run.uiVariant, hesitationThresholdMs: st.settings.hesitationThresholdMs, preference: run.preference, sensing: sensingOn, sensingPaused: st.settings.sensingPaused },
    });
    st.addAudit({ actor: "human", action: "run started", detail: `Guide mode · ${run.cohort} cohort · UI ${run.uiVariant} · ${run.preference?.replace(/_/g, " ")}`, runId: id, programId: program.id });

    const observer = new HumanObserver({
      driver,
      workflow,
      requirements,
      hesitationThresholdMs: st.settings.hesitationThresholdMs,
      sensing: sensingOn,
      policyConstraints: program.parsed?.policyConstraints,
      hooks: {
        onEvent: (type, data, stepId, message) => {
          record(type, data, stepId, message);
          if (type === "step_completed" && stepId) setCompletedStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
          if (type === "pointer_window" && data) setLastPointer(data as unknown as PointerWindow);
          if (type === "keyboard_window" && data) setLastKeyboard(data as unknown as KeyboardWindow);
        },
        onStepChange: (step, index) => {
          currentStepRef.current = step;
          foundRef.current = null;
          setCurrentIndex(index);
          setQuiet(null);
        },
        onSignal: (signal) => void handleSignal(signal),
        onChecklist: (items) => setChecklist(items),
        onFriction: (inference) => {
          setFriction(inference);
          const step = currentStepRef.current;
          if (step && (inference.state === "DECISION_UNCERTAINTY" || inference.state === "POLICY_UNCERTAINTY") && inference.confidence >= 0.45 && foundRef.current !== step.id) {
            // The control was found: from here on this step gets no ring, whatever else happens.
            foundRef.current = step.id;
            refreshOverlay();
          }
        },
        onPage: (p) => {
          setPage((prev) => (prev && prev.url === p.url && prev.heading === p.heading && prev.fingerprint === p.fingerprint ? prev : p));
          measureFrame();
          updateOverlay(p);
          const doc = driver.doc;
          if (doc) attachShortcut(doc);
        },
        onComplete: ({ requirementsMet, outcomeUrl }) => {
          record("run_completed", { requirementsMet, outcomeUrl }, undefined, `Run completed: ${requirementsMet.length} requirement${requirementsMet.length === 1 ? "" : "s"} verified`);
          setCompletion({ requirementsMet, outcomeUrl });
          finishRun("completed", { requirementsMet }, `${requirementsMet.length} requirements verified on ${outcomeUrl}`);
        },
      },
    });
    observerRef.current = observer;
    observer.start();
  }, [attachShortcut, beginGetItDone, clearFaded, clearOverlay, currentStepRef, finishRun, foundRef, getDriver, getItDoneRef, handleSignal, measureFrame, observerRef, phaseRef, preferenceRef, program.id, program.parsed?.policyConstraints, record, refreshOverlay, requirements, resetInterventions, runIdRef, setLastKeyboard, setLastPointer, setQuiet, updateOverlay, workflow]);

  const abandonRun = useCallback(() => {
    if (phaseRef.current !== "running") return;
    record("run_abandoned", { reason: "abandoned by the person" }, currentStepRef.current?.id, "Run abandoned");
    finishRun("abandoned", {}, "abandoned by the person");
  }, [currentStepRef, finishRun, phaseRef, record]);

  const startAnotherRun = useCallback(async () => {
    const driver = getDriver();
    if (!driver) return;
    setStartingAnother(true);
    try {
      await driver.goto(startUrl);
      startRun();
    } finally {
      setStartingAnother(false);
    }
  }, [getDriver, startRun, startUrl]);

  // Leaving the page mid-run counts as abandonment; never leave a run without an outcome.
  const abandonRef = useRef<() => void>(() => {});
  useEffect(() => {
    abandonRef.current = () => {
      if (phaseRef.current !== "running") return;
      record("run_abandoned", { reason: "left the page" }, currentStepRef.current?.id, "Run abandoned: left the page");
      finishRun("abandoned", {}, "left the page");
    };
  }, [currentStepRef, finishRun, phaseRef, record]);
  useEffect(() => {
    return () => {
      abandonRef.current();
      observerRef.current?.stop();
      observerRef.current = null;
    };
  }, [observerRef]);

  const touch = useCallback(() => observerRef.current?.touch(), [observerRef]);

  return {
    workflow,
    startUrl,
    context,
    phase,
    runId,
    frameReady,
    frameError,
    currentIndex,
    completedStepIds,
    checklist,
    page,
    highlight,
    cursor,
    frame,
    intervention: interventions.intervention,
    withheld: interventions.withheld,
    assistingStepId,
    approval,
    completion,
    plannerStatus,
    plannerKind,
    startingAnother,
    preference,
    friction,
    quiet: interventions.quiet,
    lastPointer: interventions.lastPointer,
    lastKeyboard: interventions.lastKeyboard,
    sensing,
    getItDone: gid.getItDone,
    fadedSteps,
    startRun,
    startAnotherRun,
    abandonRun,
    dismissIntervention,
    assistStep,
    showAssistanceAnyway: interventions.showAssistanceAnyway,
    decideApproval,
    reloadFrame: loadStart,
    touch,
    setPreference: interventions.setPreference,
    setSensingPaused: interventions.setSensingPaused,
    getItDoneNow: gid.getItDoneNow,
    reopenApproval: gid.reopenApproval,
    chooseNextTime: gid.chooseNextTime,
    overrideProficiency,
  };
}
