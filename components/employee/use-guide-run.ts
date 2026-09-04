"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import { HumanObserver, anchorMatchesPage, resolveAnchorRect, type ChecklistItem } from "@/lib/synforma/engine/observer";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { assignCohort, decide } from "@/lib/synforma/engine/adoption";
import { LEVEL_LABEL, initialProficiency, stepOutcomesForRun, updateProficiency } from "@/lib/synforma/engine/proficiency";
import { DO_NOTHING_ID } from "@/lib/synforma/science/techniques";
import { createPlanner, fetchPlannerStatus, resolvePlannerKind, type Planner } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import { DEFAULT_CONTEXT } from "@/lib/synforma/demo";
import { useSynforma } from "@/lib/synforma/store";
import type {
  Action,
  ApprovalRequest,
  AssistanceLevel,
  AssistancePreference,
  ElementRect,
  FrictionInference,
  FrictionState,
  Intervention,
  KeyboardWindow,
  PageModel,
  PlannerKind,
  PointerWindow,
  Program,
  Run,
  RunEventType,
  SemanticAnchor,
  StruggleSignal,
  Workflow,
  WorkflowStep,
} from "@/lib/synforma/types";
import { shortId } from "@/lib/utils";

/**
 * Guide-mode run orchestration for the Employee view.
 *
 * Owns exactly one IframeDriver (created lazily for the mounted iframe) and at
 * most one HumanObserver per run. Everything observed is written to the store
 * as RunEvents; nothing here is estimated. Decisions go through the policy
 * (`decide`), so "do nothing" is recorded as deliberately as showing help.
 */

export type RunPhase = "idle" | "running" | "completed" | "abandoned";

export interface OverlayHighlight {
  /** Rect in iframe viewport coordinates. */
  rect: ElementRect;
  label: string;
  kind: "step" | "assistance";
}

export interface OverlayCursor {
  rect: ElementRect;
  label?: string;
}

export interface FrameBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PendingApproval extends ApprovalRequest {
  resolve: (decision: "granted" | "denied") => void;
  /** Judgment fields Synforma left to the person (Get It Done). */
  leftForYou?: string[];
  /** Label for the non-approving button. */
  denyLabel?: string;
}

/** What the person said about a card when dismissing it. */
export type AssistanceFeedback = "helpful" | "not_helpful" | "wrong_moment" | "wrong_assumption" | "too_much_help";

/** A decision in which DO_NOTHING won: recorded, and shown discreetly. */
export interface QuietDecision {
  stepId: string;
  frictionState: FrictionState | null;
  confidence: number | null;
  candidates: { techniqueId: string; total: number }[];
  reason: string;
  t: number;
}

export type SensingStatus = "on" | "paused" | "off";

export interface GetItDoneState {
  status: "idle" | "running" | "ready" | "committing";
  /** Judgment fields Synforma left to the person. */
  leftForYou: { requirementId: string | null; fieldName: string }[];
  /** Steps Synforma handled in this run (distinct ids). */
  handledStepIds: string[];
  /** Name of the commit control Synforma stopped before. */
  stoppedBefore: string | null;
  error: string | null;
}

export interface FadedStep {
  stepId: string;
  title: string;
  level: AssistanceLevel;
}

const IDLE_GID: GetItDoneState = { status: "idle", leftForYou: [], handledStepIds: [], stoppedBefore: null, error: null };

export interface GuideRunState {
  phase: RunPhase;
  runId: string | null;
  frameReady: boolean;
  frameError: string | null;
  /** Index of the workflow step the person is on; -1 when off the workflow. */
  currentIndex: number;
  completedStepIds: string[];
  checklist: ChecklistItem[];
  page: PageModel | null;
  highlight: OverlayHighlight | null;
  cursor: OverlayCursor | null;
  frame: FrameBox | null;
  intervention: Intervention | null;
  withheld: Intervention | null;
  assistingStepId: string | null;
  approval: PendingApproval | null;
  completion: { requirementsMet: string[]; outcomeUrl: string } | null;
  plannerStatus: PlannerStatus | null;
  plannerKind: PlannerKind;
  startingAnother: boolean;
  /** Assistance preference for this (or the next) run. */
  preference: AssistancePreference;
  /** Latest friction inference from the observer (every ~1.5 s during a run). */
  friction: FrictionInference | null;
  /** Latest decision in which Synforma chose to stay quiet. */
  quiet: QuietDecision | null;
  /** Latest one-second interaction windows (aggregates only). */
  lastPointer: PointerWindow | null;
  lastKeyboard: KeyboardWindow | null;
  sensing: SensingStatus;
  getItDone: GetItDoneState;
  /** Steps whose assistance level faded at the end of the last run. */
  fadedSteps: FadedStep[];
}

export interface GuideRunApi extends GuideRunState {
  workflow: Workflow;
  startUrl: string;
  context: Record<string, string>;
  startRun: () => void;
  startAnotherRun: () => Promise<void>;
  abandonRun: () => void;
  dismissIntervention: (feedback?: AssistanceFeedback | "got_it" | "resolved") => void;
  assistStep: (stepId: string) => Promise<void>;
  showAssistanceAnyway: () => void;
  decideApproval: (decision: "granted" | "denied") => void;
  reloadFrame: () => Promise<void>;
  /** The person interacted with the panel: counts as activity for the hesitation timer. */
  touch: () => void;
  setPreference: (preference: AssistancePreference) => void;
  setSensingPaused: (paused: boolean) => void;
  /** Get It Done: handle the routine steps from here and stop before the commit. */
  getItDoneNow: () => void;
  /** Re-open the approval for a Get It Done run that stopped before the commit. */
  reopenApproval: () => void;
  /** After a Get It Done run: what the next run should feel like. */
  chooseNextTime: (preference: "teach_me" | "just_do_it") => void;
  /** "Teach me anyway" / "Keep handling this": set the assistance level for a step. */
  overrideProficiency: (stepId: string, level: AssistanceLevel) => void;
}

const UI_VERSION_KEY = "meridian-ui-version";
const NEGATIVE_FEEDBACK: ReadonlySet<string> = new Set(["not_helpful", "wrong_moment", "wrong_assumption", "too_much_help"]);

function readUiVariant(driver: IframeDriver): string {
  try {
    return driver.win?.localStorage.getItem(UI_VERSION_KEY) ?? "v1";
  } catch {
    return "v1";
  }
}

function sameRect(a: ElementRect | null | undefined, b: ElementRect | null | undefined): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

function onScreen(rect: ElementRect, driver: IframeDriver): boolean {
  const win = driver.win;
  if (!win) return false;
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  if (rect.w <= 0 || rect.h <= 0) return false;
  return rect.x + rect.w > 0 && rect.y + rect.h > 0 && rect.x < vw && rect.y < vh;
}

function isGetItDoneShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "S" || e.key === "s" || e.code === "KeyS");
}

export function useGuideRun(program: Program, iframeRef: React.RefObject<HTMLIFrameElement | null>): GuideRunApi {
  const workflow = program.workflow!;
  const requirements = useMemo(() => program.parsed?.requirements ?? [], [program.parsed]);
  const context = useMemo(() => ({ ...DEFAULT_CONTEXT, ...((program as Program & { context?: Record<string, string> }).context ?? {}) }), [program]);
  const startUrl = workflow.startUrl || context.entryUrl || program.application.baseUrl;
  const settings = useSynforma((s) => s.settings);

  const [phase, setPhase] = useState<RunPhase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [page, setPage] = useState<PageModel | null>(null);
  const [highlight, setHighlight] = useState<OverlayHighlight | null>(null);
  const [cursor, setCursor] = useState<OverlayCursor | null>(null);
  const [frame, setFrame] = useState<FrameBox | null>(null);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [withheld, setWithheld] = useState<Intervention | null>(null);
  const [assistingStepId, setAssistingStepId] = useState<string | null>(null);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [completion, setCompletion] = useState<{ requirementsMet: string[]; outcomeUrl: string } | null>(null);
  const [plannerStatus, setPlannerStatus] = useState<PlannerStatus | null>(null);
  const [startingAnother, setStartingAnother] = useState(false);
  const [preference, setPreferenceState] = useState<AssistancePreference>(() => useSynforma.getState().settings.assistancePreference);
  const [friction, setFriction] = useState<FrictionInference | null>(null);
  const [quiet, setQuiet] = useState<QuietDecision | null>(null);
  const [lastPointer, setLastPointer] = useState<PointerWindow | null>(null);
  const [lastKeyboard, setLastKeyboard] = useState<KeyboardWindow | null>(null);
  const [getItDone, setGid] = useState<GetItDoneState>(IDLE_GID);
  const [fadedSteps, setFadedSteps] = useState<FadedStep[]>([]);

  const driverRef = useRef<IframeDriver | null>(null);
  const observerRef = useRef<HumanObserver | null>(null);
  const runIdRef = useRef<string | null>(null);
  const phaseRef = useRef<RunPhase>("idle");
  const currentStepRef = useRef<WorkflowStep | null>(null);
  const interventionRef = useRef<Intervention | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const shownCountRef = useRef(0);
  const lastShownAtRef = useRef<number | null>(null);
  const forcedRef = useRef(false);
  const assistingRef = useRef<string | null>(null);
  const reactingRef = useRef(false);
  const plannerRef = useRef<Planner | null>(null);
  const plannerKindRef = useRef<PlannerKind>("heuristic");
  const navigatedRef = useRef(false);
  const highlightRef = useRef<OverlayHighlight | null>(null);
  const frameRef = useRef<FrameBox | null>(null);
  const preferenceRef = useRef<AssistancePreference>(preference);
  const getItDoneRef = useRef(false);
  /** Step on which the person has already located the target: no ring for a found control. */
  const foundRef = useRef<string | null>(null);
  const gidRef = useRef<{ commitStepId: string; actions: Action[]; payload: Record<string, string>; left: { requirementId: string | null; fieldName: string }[]; targetName: string } | null>(null);
  const keyDocRef = useRef<Document | null>(null);
  const shortcutRef = useRef<() => void>(() => {});

  const sensing: SensingStatus = !settings.interactionSensing ? "off" : settings.sensingPaused ? "paused" : "on";

  // Until the server has answered, assume no live LLM is configured (never claim more than is known).
  const plannerKind: PlannerKind = plannerStatus ? resolvePlannerKind(settings.plannerPreference, plannerStatus) : "heuristic";
  useEffect(() => {
    plannerKindRef.current = plannerKind;
  }, [plannerKind]);

  // ─────────────── driver (one per iframe) ───────────────

  const getDriver = useCallback((): IframeDriver | null => {
    if (driverRef.current) return driverRef.current;
    const el = iframeRef.current;
    if (!el) return null;
    driverRef.current = new IframeDriver(el, {
      paceMs: 300,
      events: {
        onCursor: (rect, label) => setCursor(rect ? { rect, label } : null),
      },
    });
    return driverRef.current;
  }, [iframeRef]);

  const measureFrame = useCallback(() => {
    const driver = driverRef.current;
    if (!driver) return;
    const r = driver.frameRect();
    const next = { left: r.left, top: r.top, width: r.width, height: r.height };
    const prev = frameRef.current;
    if (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5) return;
    frameRef.current = next;
    setFrame(next);
  }, []);

  const loadStart = useCallback(async () => {
    const driver = getDriver();
    if (!driver) return;
    setFrameError(null);
    setFrameReady(false);
    try {
      await driver.goto(startUrl);
      const ok = Boolean(driver.doc && driver.doc.body && driver.doc.body.children.length > 0 && driver.currentUrl() !== "about:blank");
      if (!ok) throw new Error("The target application did not respond.");
      setFrameReady(true);
      measureFrame();
    } catch (e) {
      setFrameError(e instanceof Error ? e.message : "The target application did not load.");
    }
  }, [getDriver, measureFrame, startUrl]);

  useEffect(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    void loadStart();
  }, [loadStart]);

  useEffect(() => {
    let raf = 0;
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureFrame);
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [measureFrame]);

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

  const record = useCallback((type: RunEventType, data?: Record<string, unknown>, stepId?: string, message?: string) => {
    const id = runIdRef.current;
    if (!id) return;
    useSynforma.getState().addEvent({ runId: id, type, stepId, message, data });
  }, []);

  const currentRun = useCallback((): Run | null => {
    const id = runIdRef.current;
    return id ? (useSynforma.getState().runs[id] ?? null) : null;
  }, []);

  // ─────────────── overlay ───────────────

  const updateOverlay = useCallback(
    (livePage: PageModel) => {
      const driver = driverRef.current;
      if (!driver) return;
      const active = interventionRef.current;
      const step = currentStepRef.current;
      let anchor: SemanticAnchor | undefined;
      let kind: OverlayHighlight["kind"] = "step";
      if (active?.content.anchor) {
        // A found control is never highlighted: "clarify consequence" is rendered as a quiet inline card only.
        if (active.techniqueId !== "clarify_consequence") {
          anchor = active.content.anchor;
          kind = "assistance";
        }
      } else if (step && foundRef.current !== step.id) {
        anchor = step.anchor;
      }
      let next: OverlayHighlight | null = null;
      if (anchor && anchorMatchesPage(anchor, livePage)) {
        const hit = resolveAnchorRect(driver, anchor, livePage);
        if (hit && onScreen(hit.rect, driver)) next = { rect: hit.rect, label: hit.name, kind };
      }
      const prev = highlightRef.current;
      if (prev && next && sameRect(prev.rect, next.rect) && prev.label === next.label && prev.kind === next.kind) return;
      if (!prev && !next) return;
      highlightRef.current = next;
      setHighlight(next);
    },
    [],
  );

  const refreshOverlay = useCallback(() => {
    const p = driverRef.current ? driverRef.current.snapshot().page : null;
    if (p) updateOverlay(p);
  }, [updateOverlay]);

  const clearOverlay = useCallback(() => {
    highlightRef.current = null;
    setHighlight(null);
    setCursor(null);
  }, []);

  // ─────────────── assistance ───────────────

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
    [currentRun, program.id, record, refreshOverlay],
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
          setQuiet({ stepId: signal.stepId, frictionState: signal.frictionState ?? null, confidence: signal.frictionConfidence ?? null, candidates: decision.candidates.slice(0, 3), reason: decision.reason, t: signal.t });
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
    [currentRun, program, record, showIntervention],
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
    [currentRun, program.id, record, refreshOverlay],
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
  }, [currentRun, program.id, record, showIntervention, withheld]);

  // ─────────────── preference & sensing ───────────────

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
    [currentRun, program.id, record],
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
    [program.id, record],
  );

  const overrideProficiency = useCallback(
    (stepId: string, level: AssistanceLevel) => {
      const st = useSynforma.getState();
      const prev = st.proficiency[`${program.id}/${stepId}`] ?? initialProficiency(program.id, stepId);
      if (prev.assistanceLevel === level) return;
      st.setProficiency({ ...prev, assistanceLevel: level, updatedAt: Date.now() });
      const step = workflow.steps.find((s) => s.id === stepId);
      record("proficiency_updated", { stepId, previousLevel: prev.assistanceLevel, level, override: true }, stepId, `Assistance level set to ${LEVEL_LABEL[level]} on "${step?.title ?? stepId}" by the person`);
      st.addAudit({ actor: "human", action: "proficiency override", target: step?.title ?? stepId, detail: `${LEVEL_LABEL[prev.assistanceLevel]} → ${LEVEL_LABEL[level]}`, runId: runIdRef.current ?? undefined, programId: program.id });
    },
    [program.id, record, workflow.steps],
  );

  // ─────────────── proficiency at the end of a run ───────────────

  const applyProficiency = useCallback(
    (run: Run, outcome: "completed" | "abandoned") => {
      const st = useSynforma.getState();
      const events = st.events.filter((e) => e.runId === run.id);
      const touched = new Set(events.map((e) => e.stepId).filter((s): s is string => Boolean(s)));
      const faded: FadedStep[] = [];
      for (const o of stepOutcomesForRun(run, events, workflow)) {
        if (!touched.has(o.stepId)) continue; // never entered: nothing to learn
        if (outcome === "abandoned" && !o.completed) continue; // an abandoned run says nothing about the steps it did not finish
        const prev = useSynforma.getState().proficiency[`${program.id}/${o.stepId}`] ?? initialProficiency(program.id, o.stepId);
        const { next, faded: didFade } = updateProficiency(prev, o);
        useSynforma.getState().setProficiency(next);
        const step = workflow.steps.find((s) => s.id === o.stepId);
        record(
          "proficiency_updated",
          { stepId: o.stepId, completed: o.completed, assisted: o.assisted, errors: o.errors, previousLevel: prev.assistanceLevel, level: next.assistanceLevel, unassistedSuccesses: next.unassistedSuccesses, assistedRuns: next.assistedRuns, faded: didFade },
          o.stepId,
          didFade ? `Less help next time on "${step?.title ?? o.stepId}": ${LEVEL_LABEL[next.assistanceLevel]}` : `Proficiency updated on "${step?.title ?? o.stepId}": ${o.completed ? (o.assisted ? "completed with help" : "completed unassisted") : "not completed"}`,
        );
        if (didFade && step) faded.push({ stepId: step.id, title: step.title, level: next.assistanceLevel });
      }
      setFadedSteps(faded);
    },
    [program.id, record, workflow],
  );

  // ─────────────── run lifecycle ───────────────

  const onFrameKey = useCallback((e: KeyboardEvent) => {
    if (!isGetItDoneShortcut(e)) return;
    e.preventDefault();
    shortcutRef.current();
  }, []);

  const detachShortcut = useCallback(() => {
    const doc = keyDocRef.current;
    if (doc) doc.removeEventListener("keydown", onFrameKey, true);
    keyDocRef.current = null;
  }, [onFrameKey]);

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
      detachShortcut();
      interventionRef.current = null;
      currentStepRef.current = null;
      foundRef.current = null;
      gidRef.current = null;
      setIntervention(null);
      setWithheld(null);
      setQuiet(null);
      setFriction(null);
      setApproval(null);
      setGid((prev) => ({ ...prev, status: "idle", error: null }));
      clearOverlay();
      phaseRef.current = outcome;
      setPhase(outcome);
    },
    [applyProficiency, clearOverlay, currentRun, detachShortcut, program.id],
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
    shownRef.current = new Set();
    shownCountRef.current = 0;
    lastShownAtRef.current = null;
    forcedRef.current = false;
    getItDoneRef.current = false;
    foundRef.current = null;
    gidRef.current = null;
    interventionRef.current = null;
    currentStepRef.current = null;
    phaseRef.current = "running";
    setRunId(id);
    setPhase("running");
    setCurrentIndex(-1);
    setCompletedStepIds([]);
    setChecklist([]);
    setIntervention(null);
    setWithheld(null);
    setQuiet(null);
    setFriction(null);
    setLastPointer(null);
    setLastKeyboard(null);
    setGid(IDLE_GID);
    setFadedSteps([]);
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
          if (doc && doc !== keyDocRef.current) {
            detachShortcut();
            keyDocRef.current = doc;
            doc.addEventListener("keydown", onFrameKey, true);
          }
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
  }, [clearOverlay, detachShortcut, finishRun, getDriver, handleSignal, measureFrame, onFrameKey, program.id, program.parsed?.policyConstraints, record, refreshOverlay, requirements, updateOverlay, workflow]);

  const abandonRun = useCallback(() => {
    if (phaseRef.current !== "running") return;
    record("run_abandoned", { reason: "abandoned by the person" }, currentStepRef.current?.id, "Run abandoned");
    finishRun("abandoned", {}, "abandoned by the person");
  }, [finishRun, record]);

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
  }, [finishRun, record]);
  useEffect(() => {
    return () => {
      abandonRef.current();
      observerRef.current?.stop();
      observerRef.current = null;
    };
  }, []);

  // ─────────────── approvals (shared by Assist and Get It Done) ───────────────

  const decideApprovalRef = useRef<((d: "granted" | "denied") => void) | null>(null);

  const requestApproval = useCallback(
    (req: Omit<ApprovalRequest, "id" | "runId" | "requestedAt">, extra?: { leftForYou?: string[]; denyLabel?: string; onDecision?: (d: "granted" | "denied") => void }) =>
      new Promise<"granted" | "denied">((resolve) => {
        const id = runIdRef.current;
        if (!id) {
          resolve("denied");
          return;
        }
        const request: ApprovalRequest = { ...req, id: shortId("apr"), runId: id, requestedAt: Date.now() };
        useSynforma.getState().addApproval(request);
        useSynforma.getState().addAudit({ actor: "synforma", action: "approval requested", target: req.title, runId: id, programId: program.id, approval: "requested" });
        const settle = (decision: "granted" | "denied") => {
          useSynforma.getState().decideApproval(request.id, decision);
          useSynforma.getState().addAudit({ actor: "human", action: decision === "granted" ? "approval granted" : "approval denied", target: req.title, runId: id, programId: program.id, approval: decision });
          decideApprovalRef.current = null;
          setApproval(null);
          observerRef.current?.touch();
          extra?.onDecision?.(decision);
          resolve(decision);
        };
        decideApprovalRef.current = settle;
        setApproval({ ...request, resolve: settle, leftForYou: extra?.leftForYou, denyLabel: extra?.denyLabel });
      }),
    [program.id],
  );

  // ─────────────── assist (Synforma performs one step) ───────────────

  const assistStep = useCallback(
    async (stepId: string) => {
      const driver = driverRef.current;
      const id = runIdRef.current;
      const step = workflow.steps.find((s) => s.id === stepId);
      if (!driver || !id || !step || assistingRef.current || phaseRef.current !== "running") return;
      const st = useSynforma.getState();
      assistingRef.current = stepId;
      setAssistingStepId(stepId);
      record("assist_requested", { via: "assist", mode: step.mode, judgment: step.judgment, commit: step.commit, interventionId: interventionRef.current?.id ?? null }, stepId, `Asked Synforma to do "${step.title}"`);
      st.addAudit({ actor: "human", action: "assist requested", target: step.title, runId: id, programId: program.id });
      driver.paceMs = 300;
      try {
        const result = await runWorkflow({
          driver,
          workflow,
          requirements,
          context,
          actor: "human",
          onlySteps: [stepId],
          requireApprovalForCommit: st.settings.requireApprovalForCommit,
          hooks: {
            onEvent: (type, data, sid, message) => {
              // The observer already tracks the person's step progress; keep the runner's action-level trail.
              if (type === "step_entered" || type === "step_completed" || type === "run_completed") return;
              record(type, { ...(data ?? {}), via: "assist" }, sid ?? stepId, message);
            },
            requestApproval: (req) => requestApproval(req),
          },
        });
        record("assist_completed", { via: "assist", outcome: result.outcome, regroundings: result.regroundings, error: result.error ?? null }, stepId, result.outcome === "completed" ? `Synforma did "${step.title}"` : `Synforma could not finish "${step.title}": ${result.error ?? result.outcome}`);
        const run = currentRun();
        if (run && result.regroundings) useSynforma.getState().updateRun(run.id, { regroundings: run.regroundings + result.regroundings });
        useSynforma.getState().addAudit({ actor: "synforma", action: "assist completed", target: step.title, detail: `${result.outcome}${result.regroundings ? ` · ${result.regroundings} re-grounding${result.regroundings === 1 ? "" : "s"}` : ""}`, runId: id, programId: program.id });
        if (result.outcome !== "completed") toast.error(`Synforma could not finish "${step.title}"`, { description: result.error ?? result.outcome });
        else if (interventionRef.current?.stepId === stepId) dismissIntervention("resolved");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        record("assist_completed", { via: "assist", outcome: "failed", error: message }, stepId, `Assist failed: ${message}`);
        toast.error("Assist failed", { description: message });
      } finally {
        assistingRef.current = null;
        setAssistingStepId(null);
        setCursor(null);
        observerRef.current?.touch();
      }
    },
    [context, currentRun, dismissIntervention, program.id, record, requestApproval, requirements, workflow],
  );

  const decideApproval = useCallback((decision: "granted" | "denied") => {
    decideApprovalRef.current?.(decision);
  }, []);

  // ─────────────── Get It Done ───────────────

  const commitNow = useCallback(async () => {
    const driver = driverRef.current;
    const id = runIdRef.current;
    const g = gidRef.current;
    if (!driver || !id || !g || assistingRef.current || phaseRef.current !== "running") return;
    const step = workflow.steps.find((s) => s.id === g.commitStepId);
    if (!step) return;
    assistingRef.current = "get_it_done";
    setGid((prev) => ({ ...prev, status: "committing", error: null }));
    driver.paceMs = 250;
    // Only the actions from the commit control onward: the routine run already did the rest of this step.
    const trimmed: Workflow = { ...workflow, steps: workflow.steps.map((s) => (s.id === step.id ? { ...s, actions: g.actions } : s)) };
    try {
      const result = await runWorkflow({
        driver,
        workflow: trimmed,
        requirements,
        context,
        actor: "human",
        onlySteps: [step.id],
        routineOnly: false,
        requireApprovalForCommit: false, // the person approved a moment ago
        hooks: {
          onEvent: (type, data, sid, message) => {
            if (type === "step_entered" || type === "step_completed" || type === "run_completed") return;
            record(type, { ...(data ?? {}), via: "get_it_done", commit: true }, sid ?? step.id, message);
          },
          requestApproval: async () => "granted",
          onStep: (s, status) => {
            if (status === "completed") record("note", { via: "get_it_done", committed: s.title }, s.id, `Synforma committed "${s.title}" after approval`);
          },
        },
      });
      const run = currentRun();
      if (run && result.regroundings) useSynforma.getState().updateRun(run.id, { regroundings: run.regroundings + result.regroundings });
      if (result.outcome !== "completed") {
        record("note", { via: "get_it_done", commitFailed: result.error ?? result.outcome }, step.id, `Synforma could not commit: ${result.error ?? result.outcome}`);
        toast.error("Synforma could not commit", { description: result.error ?? result.outcome });
        setGid((prev) => ({ ...prev, status: "ready", error: result.error ?? result.outcome }));
      } else {
        useSynforma.getState().addAudit({ actor: "synforma", action: "get it done committed", target: g.targetName, runId: id, programId: program.id });
        gidRef.current = null;
        setGid((prev) => ({ ...prev, status: "idle" }));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      record("note", { via: "get_it_done", commitFailed: message }, step.id, `Synforma could not commit: ${message}`);
      toast.error("Synforma could not commit", { description: message });
      setGid((prev) => ({ ...prev, status: "ready", error: message }));
    } finally {
      assistingRef.current = null;
      driver.paceMs = 300;
      setCursor(null);
      observerRef.current?.touch();
    }
  }, [context, currentRun, program.id, record, requirements, workflow]);

  const openGetItDoneApproval = useCallback(() => {
    const g = gidRef.current;
    const id = runIdRef.current;
    if (!g || !id || phaseRef.current !== "running" || decideApprovalRef.current) return;
    const leftNames = g.left.map((l) => l.fieldName);
    record("approval_requested", { via: "get_it_done", payload: g.payload, leftForYou: leftNames }, g.commitStepId, `Approval requested: ${g.targetName}`);
    void requestApproval(
      {
        stepId: g.commitStepId,
        title: g.targetName,
        summary: `Synforma prepared the routine fields and stopped before "${g.targetName}". ${leftNames.length ? `Left for you: ${leftNames.join(", ")}.` : "Nothing was left for you."} Approving commits the record in ${program.application.name}.`,
        payload: { ...g.payload },
      },
      {
        leftForYou: leftNames,
        denyLabel: leftNames.length ? "Let me finish first" : "Not yet",
        onDecision: (decision) => {
          if (decision === "granted") {
            record("approval_granted", { via: "get_it_done" }, g.commitStepId, "Approval granted");
            void commitNow();
          } else {
            record("approval_denied", { via: "get_it_done", deferred: true }, g.commitStepId, "Approval deferred: the person will finish first");
          }
        },
      },
    );
  }, [commitNow, program.application.name, record, requestApproval]);

  const getItDoneNow = useCallback(async () => {
    const driver = driverRef.current;
    const id = runIdRef.current;
    if (!driver || !id || phaseRef.current !== "running" || assistingRef.current || gidRef.current) return;
    const st = useSynforma.getState();
    const run = currentRun();
    if (!run) return;
    const fromIndex = currentStepRef.current ? currentStepRef.current.index : 0;
    const remaining = workflow.steps.filter((s) => s.index >= fromIndex);
    if (!remaining.length) return;
    const commitStep = remaining.find((s) => s.commit) ?? null;
    getItDoneRef.current = true;
    st.updateRun(id, { getItDone: true });
    record("note", { getItDone: true, fromStepId: remaining[0].id, steps: remaining.map((s) => s.id), preference: preferenceRef.current }, remaining[0].id, `Get It Done: Synforma handles the routine steps from "${remaining[0].title}" and stops before the commit`);
    st.addAudit({ actor: "human", action: "get it done", detail: `${remaining.length} step(s) from "${remaining[0].title}"`, runId: id, programId: program.id });
    if (interventionRef.current) dismissIntervention("resolved");
    assistingRef.current = "get_it_done";
    setGid({ status: "running", leftForYou: [], handledStepIds: [], stoppedBefore: null, error: null });
    driver.paceMs = 250;
    const payload: Record<string, string> = {};
    const left: { requirementId: string | null; fieldName: string }[] = [];
    const handled: string[] = [];
    const stopped: { label: string | null } = { label: null };
    try {
      const result = await runWorkflow({
        driver,
        workflow,
        requirements,
        context,
        actor: "human",
        onlySteps: remaining.map((s) => s.id),
        routineOnly: true,
        requireApprovalForCommit: true,
        hooks: {
          onEvent: (type, data, sid, message) => {
            if (type === "step_entered" || type === "step_completed" || type === "run_completed") return;
            if (type === "note" && data?.skippedJudgment) {
              left.push({ requirementId: typeof data.requirementId === "string" ? data.requirementId : null, fieldName: String(data.skippedJudgment) });
              setGid((prev) => ({ ...prev, leftForYou: [...left] }));
            }
            if (type === "note" && typeof data?.stoppedBeforeCommit === "string") stopped.label = data.stoppedBeforeCommit;
            if (type === "action_executed" && data?.ok) {
              const a = data.action as Action | undefined;
              if (a && (a.kind === "type" || a.kind === "select" || a.kind === "check") && a.targetName) payload[a.targetName] = a.value ?? "";
            }
            record(type, { ...(data ?? {}), via: "get_it_done" }, sid, message);
          },
          onStep: (step, status) => {
            if (status === "entered") record("assist_requested", { via: "get_it_done", mode: step.mode, judgment: step.judgment, commit: step.commit }, step.id, `Synforma is handling "${step.title}"`);
            if (status === "completed") {
              record("assist_completed", { via: "get_it_done", outcome: "completed" }, step.id, step.commit ? `Synforma prepared "${step.title}" and stopped before the commit` : `Synforma handled "${step.title}"`);
              if (!handled.includes(step.id)) handled.push(step.id);
              setGid((prev) => ({ ...prev, handledStepIds: [...handled] }));
            }
            if (status === "failed") record("assist_completed", { via: "get_it_done", outcome: "failed" }, step.id, `Synforma could not finish "${step.title}"`);
          },
          requestApproval: async () => "denied", // never reached: routineOnly stops before the commit
        },
      });
      const fresh = currentRun();
      if (fresh && result.regroundings) useSynforma.getState().updateRun(fresh.id, { regroundings: fresh.regroundings + result.regroundings });
      if (result.outcome !== "completed") {
        record("note", { via: "get_it_done", failed: result.error ?? result.outcome, stepId: result.failedStepId ?? null }, result.failedStepId, `Get It Done stopped: ${result.error ?? result.outcome}`);
        toast.error("Synforma could not finish the routine steps", { description: result.error ?? result.outcome });
        setGid((prev) => ({ ...prev, status: "idle", error: result.error ?? result.outcome }));
        return;
      }
      if (commitStep && stopped.label) {
        const label = stopped.label;
        const idx = commitStep.actions.findIndex((a) => a.label === label);
        const lastClick = commitStep.actions.map((a, i) => (a.kind === "click" ? i : -1)).filter((i) => i >= 0).pop() ?? commitStep.actions.length - 1;
        const actions = commitStep.actions.slice(idx >= 0 ? idx : lastClick);
        const targetName = actions[0]?.targetName ?? commitStep.anchor.elementName ?? commitStep.title;
        gidRef.current = { commitStepId: commitStep.id, actions, payload, left, targetName };
        useSynforma.getState().addAudit({ actor: "synforma", action: "get it done stopped before commit", target: targetName, detail: left.length ? `left for the person: ${left.map((l) => l.fieldName).join(", ")}` : undefined, runId: id, programId: program.id });
        setGid((prev) => ({ ...prev, status: "ready", stoppedBefore: targetName }));
        assistingRef.current = null;
        openGetItDoneApproval();
      } else {
        setGid((prev) => ({ ...prev, status: "idle" }));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      record("note", { via: "get_it_done", failed: message }, currentStepRef.current?.id, `Get It Done failed: ${message}`);
      toast.error("Get It Done failed", { description: message });
      setGid((prev) => ({ ...prev, status: "idle", error: message }));
    } finally {
      assistingRef.current = null;
      driver.paceMs = 300;
      setCursor(null);
      observerRef.current?.touch();
    }
  }, [context, currentRun, dismissIntervention, openGetItDoneApproval, program.id, record, requirements, workflow]);

  const getItDoneNowSync = useCallback(() => {
    void getItDoneNow();
  }, [getItDoneNow]);

  const reopenApproval = useCallback(() => {
    if (!gidRef.current || phaseRef.current !== "running") return;
    openGetItDoneApproval();
  }, [openGetItDoneApproval]);

  const chooseNextTime = useCallback(
    (next: "teach_me" | "just_do_it") => {
      const st = useSynforma.getState();
      preferenceRef.current = next;
      setPreferenceState(next);
      st.setSettings({ assistancePreference: next });
      record("note", { learnNextTime: next === "teach_me", preference: next }, undefined, next === "teach_me" ? "Next run: teach me (the person wants to learn this)" : "Next run: just do it (Synforma keeps handling the routine)");
      st.addAudit({ actor: "human", action: "next run preference", detail: next.replace(/_/g, " "), runId: runIdRef.current ?? undefined, programId: program.id });
    },
    [program.id, record],
  );

  // Ctrl/Cmd+Shift+S anywhere on the page (the panel or the application frame).
  useEffect(() => {
    shortcutRef.current = () => {
      if (phaseRef.current !== "running") return;
      void getItDoneNow();
    };
  }, [getItDoneNow]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isGetItDoneShortcut(e)) return;
      e.preventDefault();
      shortcutRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => detachShortcut(), [detachShortcut]);

  const touch = useCallback(() => observerRef.current?.touch(), []);

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
    intervention,
    withheld,
    assistingStepId,
    approval,
    completion,
    plannerStatus,
    plannerKind,
    startingAnother,
    preference,
    friction,
    quiet,
    lastPointer,
    lastKeyboard,
    sensing,
    getItDone,
    fadedSteps,
    startRun,
    startAnotherRun,
    abandonRun,
    dismissIntervention,
    assistStep,
    showAssistanceAnyway,
    decideApproval,
    reloadFrame: loadStart,
    touch,
    setPreference,
    setSensingPaused,
    getItDoneNow: getItDoneNowSync,
    reopenApproval,
    chooseNextTime,
    overrideProficiency,
  };
}
