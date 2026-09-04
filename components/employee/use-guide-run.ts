"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import { HumanObserver, anchorMatchesPage, resolveAnchorRect, type ChecklistItem } from "@/lib/synforma/engine/observer";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { assignCohort, reactToSignal } from "@/lib/synforma/engine/adoption";
import { createPlanner, fetchPlannerStatus, resolvePlannerKind, type Planner } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import { DEFAULT_CONTEXT } from "@/lib/synforma/demo";
import { useSynforma } from "@/lib/synforma/store";
import type {
  ApprovalRequest,
  ElementRect,
  Intervention,
  PageModel,
  PlannerKind,
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
 * as RunEvents; nothing here is estimated.
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
}

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
}

export interface GuideRunApi extends GuideRunState {
  workflow: Workflow;
  startUrl: string;
  context: Record<string, string>;
  startRun: () => void;
  startAnotherRun: () => Promise<void>;
  abandonRun: () => void;
  dismissIntervention: (helpful: boolean) => void;
  assistStep: (stepId: string) => Promise<void>;
  showAssistanceAnyway: () => void;
  decideApproval: (decision: "granted" | "denied") => void;
  reloadFrame: () => Promise<void>;
  /** The person interacted with the panel: counts as activity for the hesitation timer. */
  touch: () => void;
}

const UI_VERSION_KEY = "meridian-ui-version";

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

  const driverRef = useRef<IframeDriver | null>(null);
  const observerRef = useRef<HumanObserver | null>(null);
  const runIdRef = useRef<string | null>(null);
  const phaseRef = useRef<RunPhase>("idle");
  const currentStepRef = useRef<WorkflowStep | null>(null);
  const interventionRef = useRef<Intervention | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const forcedRef = useRef(false);
  const assistingRef = useRef<string | null>(null);
  const reactingRef = useRef(false);
  const plannerRef = useRef<Planner | null>(null);
  const plannerKindRef = useRef<PlannerKind>("heuristic");
  const navigatedRef = useRef(false);
  const highlightRef = useRef<OverlayHighlight | null>(null);
  const frameRef = useRef<FrameBox | null>(null);

  // Until the server has answered, assume no live LLM is configured (never claim more than is known).
  const plannerKind: PlannerKind = plannerStatus ? resolvePlannerKind(settings.plannerPreference, plannerStatus) : "heuristic";
  plannerKindRef.current = plannerKind;

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
      let anchor: SemanticAnchor | undefined;
      let kind: OverlayHighlight["kind"] = "step";
      if (active?.content.anchor) {
        anchor = active.content.anchor;
        kind = "assistance";
      } else if (currentStepRef.current) {
        anchor = currentStepRef.current.anchor;
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
      interventionRef.current = i;
      setIntervention(i);
      setWithheld(null);
      record("assistance_shown", { interventionId: i.id, techniqueId: i.techniqueId, generatedBy: i.generatedBy }, i.stepId, `Assistance shown: ${i.content.title}`);
      if (!run.interventionIds.includes(i.id)) st.updateRun(run.id, { interventionIds: [...run.interventionIds, i.id] });
      st.addAudit({ actor: "synforma", action: "assistance shown", target: i.content.title, detail: `technique ${i.techniqueId}`, runId: run.id, programId: program.id });
      const p = driverRef.current ? driverRef.current.snapshot().page : null;
      if (p) updateOverlay(p);
    },
    [currentRun, program.id, record, updateOverlay],
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
        const result = await reactToSignal(signal, {
          planner: plannerRef.current,
          program,
          getSignalsForStep: (stepId) => useSynforma.getState().signals.filter((s) => s.runId === id && s.stepId === stepId),
          getInterventionsForStep: (stepId) => Object.values(useSynforma.getState().interventions).filter((i) => i.programId === program.id && i.stepId === stepId),
          getRuns: () => Object.values(useSynforma.getState().runs).filter((r) => r.programId === program.id),
          saveHypothesis: fresh.addHypothesis,
          saveIntervention: fresh.upsertIntervention,
        });
        if (!result || phaseRef.current !== "running" || runIdRef.current !== id) return;
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
    (helpful: boolean) => {
      const i = interventionRef.current;
      if (!i) return;
      record("assistance_dismissed", helpful ? { interventionId: i.id } : { interventionId: i.id, helpful: false }, i.stepId, helpful ? "Assistance dismissed" : "Assistance marked not helpful");
      interventionRef.current = null;
      setIntervention(null);
      observerRef.current?.touch();
      const p = driverRef.current ? driverRef.current.snapshot().page : null;
      if (p) updateOverlay(p);
    },
    [record, updateOverlay],
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

  // ─────────────── run lifecycle ───────────────

  const finishRun = useCallback(
    (outcome: "completed" | "abandoned", extra: Partial<Run>, reason?: string) => {
      const run = currentRun();
      const st = useSynforma.getState();
      if (run) {
        st.updateRun(run.id, { outcome, endedAt: Date.now(), ...extra });
        st.addAudit({ actor: "human", action: outcome === "completed" ? "run completed" : "run abandoned", detail: reason, runId: run.id, programId: program.id });
      }
      observerRef.current?.stop();
      observerRef.current = null;
      interventionRef.current = null;
      currentStepRef.current = null;
      setIntervention(null);
      setWithheld(null);
      clearOverlay();
      phaseRef.current = outcome;
      setPhase(outcome);
    },
    [clearOverlay, currentRun, program.id],
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
    };
    st.addRun(run);
    runIdRef.current = id;
    shownRef.current = new Set();
    forcedRef.current = false;
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
    setCompletion(null);
    clearOverlay();
    st.addEvent({ runId: id, type: "run_started", message: `Guide run started (${run.cohort} cohort, UI ${run.uiVariant})`, data: { actor: "human", mode: "guide", cohort: run.cohort, uiVariant: run.uiVariant, hesitationThresholdMs: st.settings.hesitationThresholdMs } });
    st.addAudit({ actor: "human", action: "run started", detail: `Guide mode · ${run.cohort} cohort · UI ${run.uiVariant}`, runId: id, programId: program.id });

    const observer = new HumanObserver({
      driver,
      workflow,
      requirements,
      hesitationThresholdMs: st.settings.hesitationThresholdMs,
      hooks: {
        onEvent: (type, data, stepId, message) => {
          record(type, data, stepId, message);
          if (type === "step_completed" && stepId) setCompletedStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
        },
        onStepChange: (step, index) => {
          currentStepRef.current = step;
          setCurrentIndex(index);
        },
        onSignal: (signal) => void handleSignal(signal),
        onChecklist: (items) => setChecklist(items),
        onPage: (p) => {
          setPage((prev) => (prev && prev.url === p.url && prev.heading === p.heading && prev.fingerprint === p.fingerprint ? prev : p));
          measureFrame();
          updateOverlay(p);
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
  }, [clearOverlay, finishRun, getDriver, handleSignal, measureFrame, program.id, record, requirements, updateOverlay, workflow]);

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
  abandonRef.current = () => {
    if (phaseRef.current !== "running") return;
    record("run_abandoned", { reason: "left the page" }, currentStepRef.current?.id, "Run abandoned: left the page");
    finishRun("abandoned", {}, "left the page");
  };
  useEffect(() => {
    return () => {
      abandonRef.current();
      observerRef.current?.stop();
      observerRef.current = null;
    };
  }, []);

  // ─────────────── assist (Synforma performs one step) ───────────────

  const decideApprovalRef = useRef<((d: "granted" | "denied") => void) | null>(null);

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
            requestApproval: (req) =>
              new Promise<"granted" | "denied">((resolve) => {
                const request: ApprovalRequest = { ...req, id: shortId("apr"), runId: id, requestedAt: Date.now() };
                useSynforma.getState().addApproval(request);
                useSynforma.getState().addAudit({ actor: "synforma", action: "approval requested", target: req.title, runId: id, programId: program.id, approval: "requested" });
                const settle = (decision: "granted" | "denied") => {
                  useSynforma.getState().decideApproval(request.id, decision);
                  useSynforma.getState().addAudit({ actor: "human", action: decision === "granted" ? "approval granted" : "approval denied", target: req.title, runId: id, programId: program.id, approval: decision });
                  decideApprovalRef.current = null;
                  setApproval(null);
                  observerRef.current?.touch();
                  resolve(decision);
                };
                decideApprovalRef.current = settle;
                setApproval({ ...request, resolve: settle });
              }),
          },
        });
        record("assist_completed", { via: "assist", outcome: result.outcome, regroundings: result.regroundings, error: result.error ?? null }, stepId, result.outcome === "completed" ? `Synforma did "${step.title}"` : `Synforma could not finish "${step.title}": ${result.error ?? result.outcome}`);
        const run = currentRun();
        if (run && result.regroundings) useSynforma.getState().updateRun(run.id, { regroundings: run.regroundings + result.regroundings });
        useSynforma.getState().addAudit({ actor: "synforma", action: "assist completed", target: step.title, detail: `${result.outcome}${result.regroundings ? ` · ${result.regroundings} re-grounding${result.regroundings === 1 ? "" : "s"}` : ""}`, runId: id, programId: program.id });
        if (result.outcome !== "completed") toast.error(`Synforma could not finish "${step.title}"`, { description: result.error ?? result.outcome });
        else if (interventionRef.current?.stepId === stepId) dismissIntervention(true);
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
    [context, currentRun, dismissIntervention, program.id, record, requirements, workflow],
  );

  const decideApproval = useCallback((decision: "granted" | "denied") => {
    decideApprovalRef.current?.(decision);
  }, []);

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
    startRun,
    startAnotherRun,
    abandonRun,
    dismissIntervention,
    assistStep,
    showAssistanceAnyway,
    decideApproval,
    reloadFrame: loadStart,
    touch,
  };
}
