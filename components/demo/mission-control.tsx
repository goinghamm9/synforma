"use client";
import * as React from "react";
import { toast } from "sonner";
import { Cpu, Loader2, RotateCcw } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton } from "@/components/ui";
import { useSynforma } from "@/lib/synforma/store";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import { explore, type DiscoveredState } from "@/lib/synforma/engine/explorer";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { reactToSignal } from "@/lib/synforma/engine/adoption";
import { PERSONAS } from "@/lib/synforma/engine/synthetic";
import { MINIMUM_RUNS } from "@/lib/synforma/engine/metrics";
import { createPlanner, fetchPlannerStatus, resolvePlannerKind } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import { cloneGraph, countByType, createGraph } from "@/lib/synforma/graph/work-graph";
import { DEFAULT_CONTEXT, DEFAULT_OBJECTIVE, SANDBOX_APP } from "@/lib/synforma/demo";
import type { ApprovalRequest, PageModel, PlannerKind, Program, Run, RunEventType, StruggleType, WorkGraph } from "@/lib/synforma/types";
import { cn, shortId } from "@/lib/utils";
import { PHASE_INDEX, type ConnectionInfo, type LogLevel, type LogLine, type OverlayTarget, type PhaseId, type UiVariant } from "./types";
import { clearPrefs, readPrefs, readSandboxUiVariant, writePrefs } from "./demo-prefs";
import { useStoreHydrated } from "./use-store-hydrated";
import { PhaseRail } from "./phase-rail";
import { TargetFrame } from "./target-frame";
import { ApprovalDialog } from "./approval-dialog";
import { RunEventsDrawer } from "./run-events-drawer";
import { PanelSkeleton } from "./bits";
import { ConnectPanel } from "./phases/connect-panel";
import { ObjectivePanel } from "./phases/objective-panel";
import { DiscoverPanel, type DiscoveryState } from "./phases/discover-panel";
import { UnderstandPanel } from "./phases/understand-panel";
import { ActPanel, type ActState } from "./phases/act-panel";
import { GuidePanel, type SynthState } from "./phases/guide-panel";
import { AdaptPanel } from "./phases/adapt-panel";
import { MeasurePanel } from "./phases/measure-panel";

/**
 * Mission Control — the operator's view of one adoption program, driven end to
 * end by the engine against the sandbox application in the iframe.
 *
 * Domain data (program, graph, discovery, runs, events, audit, approvals,
 * interventions) is persisted through the Synforma store so a reload restores
 * the state; only transient progress (logs, cursors) lives here.
 */

const EMPTY_COUNTERS = { screens: 0, actions: 0, fields: 0, objects: 0, states: 0 };

const INITIAL_DISCOVERY: DiscoveryState = { status: "idle", log: [], counters: EMPTY_COUNTERS, stats: null, error: null, startedAt: null, planned: null };
const INITIAL_ACT: ActState = { status: "idle", runId: null, log: [], result: null, currentStepId: null, stepStatus: {}, startedAt: null, endedAt: null, error: null, regroundings: 0, uiVariant: null };
const INITIAL_SYNTH: SynthState = { status: "idle", currentPersonaId: null, completed: 0, error: null };

const STRUGGLE_EVENTS: Partial<Record<RunEventType, { type: StruggleType; magnitude: number }>> = {
  hesitation: { type: "hesitation", magnitude: 0.5 },
  validation_error: { type: "validation_error", magnitude: 0.7 },
  action_failed: { type: "hesitation", magnitude: 0.6 },
  backtrack: { type: "backtrack", magnitude: 0.5 },
  wrong_screen: { type: "wrong_screen", magnitude: 0.5 },
  run_abandoned: { type: "abandon", magnitude: 0.9 },
};

const MAX_LOG = 400;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function summarizePage(page: PageModel): ConnectionInfo {
  return {
    url: page.url,
    title: page.title,
    heading: page.heading,
    headings: page.headings,
    landmarks: page.landmarks,
    actions: page.actions.length,
    fields: page.fields.length,
    elements: page.elements.length,
    tables: page.tables.length,
    sampleActions: Array.from(new Set(page.actions.map((a) => a.name))).slice(0, 10),
  };
}

function plannerLabelFor(kind: PlannerKind | null, status: PlannerStatus | null): string {
  if (!kind) return "Resolving planner…";
  if (kind === "gemini") return `Gemini planner${status?.model ? ` · ${status.model}` : ""}`;
  return status?.configured ? "Heuristic planner — by preference" : "Heuristic planner — no API key configured";
}

function maxPhaseIndex(program: Program | null, connected: boolean): number {
  if (!program) return connected ? 1 : 0;
  if (program.status === "discovering" || program.status === "draft" || program.status === "paused") return 2;
  if (program.status === "understood") return 3;
  return 7;
}

function defaultPhaseFor(program: Program): PhaseId {
  if (program.status === "active") return "act";
  if (program.status === "understood") return "understand";
  if (program.status === "discovering") return "discover";
  return "objective";
}

function patchProgram(id: string, patch: Partial<Program>) {
  const s = useSynforma.getState();
  const current = s.programs[id];
  if (!current) return;
  s.upsertProgram({ ...current, ...patch });
}

/** Remove planner-produced nodes so a re-plan starts from the discovered structure only. */
function stripPlan(graph: WorkGraph): WorkGraph {
  const drop = new Set(graph.nodes.filter((n) => n.type === "workflow" || n.type === "step" || n.type === "requirement").map((n) => n.id));
  return { ...graph, nodes: graph.nodes.filter((n) => !drop.has(n.id)), edges: graph.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)) };
}

export function MissionControl() {
  const hydrated = useStoreHydrated();

  // ─────────────── store ───────────────
  const programs = useSynforma((s) => s.programs);
  const activeProgramId = useSynforma((s) => s.activeProgramId);
  const graphs = useSynforma((s) => s.graphs);
  const runsMap = useSynforma((s) => s.runs);
  const events = useSynforma((s) => s.events);
  const interventionsMap = useSynforma((s) => s.interventions);
  const hypotheses = useSynforma((s) => s.hypotheses);
  const audit = useSynforma((s) => s.audit);
  const settings = useSynforma((s) => s.settings);

  const program = activeProgramId ? (programs[activeProgramId] ?? null) : null;
  const programId = program?.id ?? null;
  const programRuns = React.useMemo(() => Object.values(runsMap).filter((r) => r.programId === programId).sort((a, b) => a.startedAt - b.startedAt), [runsMap, programId]);
  const programEvents = React.useMemo(() => {
    const ids = new Set(programRuns.map((r) => r.id));
    return events.filter((e) => ids.has(e.runId));
  }, [events, programRuns]);
  const programInterventions = React.useMemo(() => Object.values(interventionsMap).filter((i) => i.programId === programId), [interventionsMap, programId]);
  const storeGraph = program ? (graphs[program.graphId] ?? null) : null;

  // ─────────────── transient UI state ───────────────
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const driverRef = React.useRef<IframeDriver | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const logSeq = React.useRef(0);
  const driverLogSink = React.useRef<((message: string) => void) | null>(null);
  const graphTimer = React.useRef<number | null>(null);
  const pendingGraph = React.useRef<WorkGraph | null>(null);
  const approvalResolver = React.useRef<((d: "granted" | "denied") => void) | null>(null);
  const approvalRequest = React.useRef<ApprovalRequest | null>(null);

  const [phase, setPhaseState] = React.useState<PhaseId>("connect");
  const [phaseReady, setPhaseReady] = React.useState(false);
  const [connection, setConnection] = React.useState<{ status: "idle" | "connecting" | "connected" | "error"; info: ConnectionInfo | null; error: string | null }>({ status: "idle", info: null, error: null });
  const [currentUrl, setCurrentUrl] = React.useState("");
  const [cursor, setCursor] = React.useState<OverlayTarget | null>(null);
  const [highlight, setHighlight] = React.useState<OverlayTarget | null>(null);
  const [plannerStatus, setPlannerStatus] = React.useState<PlannerStatus | null>(null);
  const [context, setContext] = React.useState<Record<string, string>>(DEFAULT_CONTEXT);
  const [discovery, setDiscovery] = React.useState<DiscoveryState>(INITIAL_DISCOVERY);
  const [liveGraph, setLiveGraph] = React.useState<WorkGraph | null>(null);
  const [act, setAct] = React.useState<ActState>(INITIAL_ACT);
  const [approval, setApproval] = React.useState<ApprovalRequest | null>(null);
  const [synth, setSynth] = React.useState<SynthState>(INITIAL_SYNTH);
  const [uiVariant, setUiVariant] = React.useState<UiVariant>("v1");
  const [uiBusy, setUiBusy] = React.useState(false);
  const [drawerRun, setDrawerRun] = React.useState<Run | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);

  const connected = connection.status === "connected";
  const plannerKind: PlannerKind | null = program ? program.planner : plannerStatus ? resolvePlannerKind(settings.plannerPreference, plannerStatus) : null;
  const plannerLabel = plannerLabelFor(plannerKind, plannerStatus);
  const plannerName = plannerKind === "gemini" ? "Gemini planner" : "heuristic planner";

  /** Fade the agent cursor and highlight out in place once the engine is done with the iframe. */
  const hideOverlays = React.useCallback(() => {
    setCursor((c) => (c ? { ...c, visible: false } : null));
    setHighlight((h) => (h ? { ...h, visible: false } : null));
  }, []);

  const mkLine = React.useCallback((level: LogLevel, message: string): LogLine => ({ id: ++logSeq.current, t: Date.now(), level, message }), []);
  const pushDiscoveryLog = React.useCallback(
    (level: LogLevel, message: string) => {
      const line = mkLine(level, message);
      setDiscovery((d) => ({ ...d, log: d.log.length >= MAX_LOG ? [...d.log.slice(d.log.length - MAX_LOG + 1), line] : [...d.log, line] }));
    },
    [mkLine],
  );
  const pushActLog = React.useCallback(
    (level: LogLevel, message: string) => {
      const line = mkLine(level, message);
      setAct((a) => ({ ...a, log: a.log.length >= MAX_LOG ? [...a.log.slice(a.log.length - MAX_LOG + 1), line] : [...a.log, line] }));
    },
    [mkLine],
  );

  // ─────────────── driver: one per iframe, created after mount ───────────────
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const driver = new IframeDriver(iframe, {
      paceMs: 120,
      events: {
        onCursor: (rect, label) => setCursor((c) => (rect ? { rect, label, visible: true } : c ? { ...c, visible: false } : null)),
        onHighlight: (rect, label) => setHighlight((h) => (rect ? { rect, label, visible: true } : h ? { ...h, visible: false } : null)),
        onNavigate: (url) => {
          setCurrentUrl(url);
          setCursor((c) => (c ? { ...c, visible: false } : null));
          setHighlight((h) => (h ? { ...h, visible: false } : null));
        },
        onLog: (message) => driverLogSink.current?.(message),
      },
    });
    driverRef.current = driver;
    const urlPoll = window.setInterval(() => {
      const url = driver.currentUrl();
      setCurrentUrl((u) => (u === url ? u : url));
    }, 1000);
    return () => {
      window.clearInterval(urlPoll);
      driverRef.current = null;
    };
  }, []);

  // Cancel any running engine work on unmount.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      approvalResolver.current?.("denied");
      approvalResolver.current = null;
      if (graphTimer.current) window.clearTimeout(graphTimer.current);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetchPlannerStatus().then((s) => {
      if (!cancelled) setPlannerStatus(s);
    });
    setUiVariant(readSandboxUiVariant());
    return () => {
      cancelled = true;
    };
  }, []);

  // ─────────────── connect ───────────────
  const connect = React.useCallback(async (silent = false) => {
    const driver = driverRef.current;
    if (!driver) return;
    setConnection((c) => ({ ...c, status: "connecting", error: null }));
    try {
      const page = await driver.goto(SANDBOX_APP.baseUrl);
      if (page.fingerprint === "empty" || page.elements.length === 0) throw new Error("The application did not render anything Synforma could read.");
      const info = summarizePage(page);
      setConnection({ status: "connected", info, error: null });
      setCurrentUrl(driver.currentUrl());
      if (!silent) {
        useSynforma.getState().addAudit({ actor: "admin", action: "Connected application", target: SANDBOX_APP.name, detail: `${info.actions} actions · ${info.fields} fields · ${info.landmarks.length} landmarks on ${info.url}` });
      }
    } catch (e) {
      setConnection({ status: "error", info: null, error: errorMessage(e) });
    }
  }, []);

  // Restore phase and context once the store has rehydrated; reconnect silently when a program exists.
  React.useEffect(() => {
    if (!hydrated || phaseReady) return;
    const s = useSynforma.getState();
    const p = s.activeProgramId ? (s.programs[s.activeProgramId] ?? null) : null;
    if (p) {
      const prefs = readPrefs(p.id);
      setContext({ ...DEFAULT_CONTEXT, ...(prefs.context ?? {}) });
      const max = maxPhaseIndex(p, true);
      const wanted = prefs.phase && PHASE_INDEX[prefs.phase] <= max ? prefs.phase : defaultPhaseFor(p);
      setPhaseState(wanted);
      void connect(true);
    }
    setPhaseReady(true);
  }, [hydrated, phaseReady, connect]);

  const setPhase = React.useCallback(
    (id: PhaseId) => {
      setPhaseState(id);
      const pid = useSynforma.getState().activeProgramId;
      if (pid) writePrefs(pid, { phase: id });
    },
    [],
  );

  // ─────────────── discovery + planning ───────────────
  const plan = React.useCallback(
    async (prog: Program, states: DiscoveredState[], graph: WorkGraph, kind: PlannerKind) => {
      setDiscovery((d) => ({ ...d, status: "planning", error: null }));
      try {
        const planner = createPlanner(kind);
        const parsed = await planner.parseObjective({ objectiveText: prog.objectiveText, appName: SANDBOX_APP.name });
        const workflow = await planner.inferWorkflow({ parsed, states, graph, startUrl: SANDBOX_APP.baseUrl });
        const fallback = kind === "gemini" ? ((planner as { lastError?: string | null }).lastError ?? null) : null;
        const effectiveKind: PlannerKind = fallback ? "heuristic" : kind;
        const s = useSynforma.getState();
        s.saveGraph(graph);
        const fieldReqs = parsed.requirements.filter((r) => r.kind === "field");
        const mapped = new Set(workflow.steps.flatMap((st) => st.requirementIds)).size;
        patchProgram(prog.id, { parsed, workflow, title: parsed.title, status: "understood", planner: effectiveKind });
        s.addAudit({
          actor: "synforma",
          action: "Program understood",
          programId: prog.id,
          detail: `${effectiveKind} planner · ${mapped}/${fieldReqs.length} requirements mapped · ${workflow.steps.length} steps${fallback ? ` · Gemini unavailable (${fallback}), heuristic fallback` : ""}`,
        });
        setLiveGraph(cloneGraph(graph));
        pushDiscoveryLog("done", `${effectiveKind} planner mapped ${mapped}/${fieldReqs.length} requirements into ${workflow.steps.length} steps${fallback ? ` (Gemini unavailable: ${fallback})` : ""}`);
        setDiscovery((d) => ({ ...d, status: "done", planned: { mapped, total: fieldReqs.length, steps: workflow.steps.length } }));
        setPhase("understand");
      } catch (e) {
        setDiscovery((d) => ({ ...d, status: "error", error: `Planning failed: ${errorMessage(e)}` }));
        patchProgram(prog.id, { status: "draft" });
      }
    },
    [pushDiscoveryLog, setPhase],
  );

  const discover = React.useCallback(
    async (prog: Program, kind: PlannerKind) => {
      const driver = driverRef.current;
      if (!driver) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const graph = createGraph(prog.graphId);
      const startedAt = Date.now();
      setDiscovery({ status: "running", log: [], counters: EMPTY_COUNTERS, stats: null, error: null, startedAt, planned: null });
      setLiveGraph(null);
      setPhase("discover");
      patchProgram(prog.id, { status: "discovering", parsed: undefined, workflow: undefined, discovery: { startedAt, screens: 0, actions: 0, fields: 0, objects: 0, statesVisited: 0 } });
      useSynforma.getState().addAudit({ actor: "synforma", action: "Discovery started", programId: prog.id, target: SANDBOX_APP.baseUrl, detail: "commit actions are recorded, never executed" });
      driver.paceMs = 120;
      driverLogSink.current = (m) => pushDiscoveryLog(/re-grounded/i.test(m) ? "heal" : /could not/i.test(m) ? "warn" : "info", m);
      let statesSeen = 0;
      const scheduleGraph = (g: WorkGraph) => {
        pendingGraph.current = g;
        if (graphTimer.current) return;
        graphTimer.current = window.setTimeout(() => {
          graphTimer.current = null;
          if (pendingGraph.current) setLiveGraph(cloneGraph(pendingGraph.current));
        }, 350);
      };
      try {
        const { states, stats } = await explore({
          driver,
          startUrl: SANDBOX_APP.baseUrl,
          appName: SANDBOX_APP.name,
          graph,
          limits: { maxStates: 40, timeBudgetMs: 120_000 },
          signal: ac.signal,
          onEvent: (e) => {
            if (e.type === "log") pushDiscoveryLog(e.level === "warn" ? "warn" : "info", e.message);
            else if (e.type === "state") {
              statesSeen += 1;
              pushDiscoveryLog("action", `State ${statesSeen}: ${e.state.label} · ${e.state.page.fields.length} fields · ${e.state.page.actions.length} actions`);
            } else if (e.type === "action") {
              if (!e.result.ok) pushDiscoveryLog("warn", `${e.action.label} — ${e.result.error ?? "failed"}`);
              else if (e.action.kind === "expand" || e.action.kind === "click") pushDiscoveryLog("action", e.action.label);
            } else if (e.type === "graph") {
              const c = countByType(e.graph);
              setDiscovery((d) => ({ ...d, counters: { screens: c.screen ?? 0, actions: c.action ?? 0, fields: c.field ?? 0, objects: c.object ?? 0, states: statesSeen } }));
              scheduleGraph(e.graph);
            }
          },
        });
        driverLogSink.current = null;
        hideOverlays();
        if (graphTimer.current) {
          window.clearTimeout(graphTimer.current);
          graphTimer.current = null;
        }
        const s = useSynforma.getState();
        s.saveDiscovery(prog.id, states);
        s.saveGraph(graph);
        patchProgram(prog.id, { discovery: { startedAt, endedAt: Date.now(), screens: stats.screens, actions: stats.actions, fields: stats.fields, objects: stats.objects, statesVisited: stats.statesVisited } });
        s.addAudit({
          actor: "synforma",
          action: stats.stoppedBy === "aborted" ? "Discovery stopped by operator" : "Discovery completed",
          programId: prog.id,
          detail: `${stats.statesVisited} states · ${stats.screens} screens · ${stats.fields} fields · ${Math.round(stats.durationMs / 1000)}s · ${stats.stoppedBy}`,
        });
        setDiscovery((d) => ({ ...d, stats, counters: { screens: stats.screens, actions: stats.actions, fields: stats.fields, objects: stats.objects, states: stats.statesVisited } }));
        setLiveGraph(cloneGraph(graph));
        pushDiscoveryLog("done", `Discovery ${stats.stoppedBy === "aborted" ? "stopped" : "finished"}: ${stats.statesVisited} states in ${Math.round(stats.durationMs / 1000)}s`);
        if (states.length === 0) {
          setDiscovery((d) => ({ ...d, status: "error", error: "No application state could be read. Is the sandbox reachable?" }));
          patchProgram(prog.id, { status: "draft" });
          return;
        }
        await plan(prog, states, graph, kind);
      } catch (e) {
        driverLogSink.current = null;
        hideOverlays();
        setDiscovery((d) => ({ ...d, status: "error", error: errorMessage(e) }));
        patchProgram(prog.id, { status: "draft" });
      }
    },
    [hideOverlays, plan, pushDiscoveryLog, setPhase],
  );

  const startDiscovery = React.useCallback(
    async (objectiveText: string, ctx: Record<string, string>, mode: "discover" | "replan") => {
      const s = useSynforma.getState();
      const status = plannerStatus ?? (await fetchPlannerStatus());
      const kind = resolvePlannerKind(s.settings.plannerPreference, status);
      let prog = programId ? (s.programs[programId] ?? null) : null;
      const now = Date.now();
      if (!prog) {
        prog = {
          id: shortId("prg"),
          title: "New program",
          objectiveText,
          application: { name: SANDBOX_APP.name, baseUrl: SANDBOX_APP.baseUrl },
          graphId: shortId("g"),
          status: "discovering",
          planner: kind,
          createdAt: now,
          updatedAt: now,
        };
        s.upsertProgram(prog);
        s.setActiveProgram(prog.id);
        s.saveGraph(createGraph(prog.graphId));
        s.addAudit({ actor: "admin", action: "Program created", programId: prog.id, target: SANDBOX_APP.name, detail: `planner: ${kind}` });
      } else {
        prog = { ...prog, objectiveText, planner: kind };
        s.upsertProgram(prog);
      }
      setContext(ctx);
      writePrefs(prog.id, { context: ctx, phase: "discover" });
      const existing = s.discoveries[prog.id];
      if (mode === "replan" && existing?.length) {
        const base = s.graphs[prog.graphId] ?? createGraph(prog.graphId);
        const graph = stripPlan(cloneGraph(base));
        setPhase("discover");
        setLiveGraph(cloneGraph(graph));
        pushDiscoveryLog("info", `Re-planning with the existing discovery (${existing.length} states)`);
        await plan(prog, existing, graph, kind);
        return;
      }
      await discover(prog, kind);
    },
    [discover, plan, plannerStatus, programId, pushDiscoveryLog, setPhase],
  );

  const stopDiscovery = React.useCallback(() => {
    abortRef.current?.abort();
    pushDiscoveryLog("warn", "Stop requested — finishing the current action");
  }, [pushDiscoveryLog]);

  const restartDiscovery = React.useCallback(() => {
    const s = useSynforma.getState();
    const prog = programId ? s.programs[programId] : null;
    if (!prog) return;
    void discover(prog, prog.planner);
  }, [discover, programId]);

  // ─────────────── approvals ───────────────
  const decideApproval = React.useCallback((decision: "granted" | "denied") => {
    const req = approvalRequest.current;
    const resolve = approvalResolver.current;
    approvalRequest.current = null;
    approvalResolver.current = null;
    setApproval(null);
    if (req) useSynforma.getState().decideApproval(req.id, decision);
    resolve?.(decision);
  }, []);

  // ─────────────── act ───────────────
  const runAct = React.useCallback(async () => {
    const driver = driverRef.current;
    const s = useSynforma.getState();
    const prog = programId ? s.programs[programId] : null;
    if (!driver || !prog?.workflow || !prog.parsed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { workflow, parsed } = prog;
    const runId = shortId("run");
    const startedAt = Date.now();
    const variant = readSandboxUiVariant();
    setUiVariant(variant);
    const run: Run = { id: runId, programId: prog.id, workflowId: workflow.id, actor: "agent", mode: "act", startedAt, interventionIds: [], uiVariant: variant, requirementsMet: [], regroundings: 0 };
    s.addRun(run);
    s.addEvent({ runId, type: "run_started", data: { actor: "agent", uiVariant: variant, planner: prog.planner } });
    s.addAudit({ actor: "agent", action: "Run started", runId, programId: prog.id, detail: `Act mode · UI ${variant} · workflow by ${prog.planner} planner` });
    setAct({ ...INITIAL_ACT, status: "running", runId, startedAt, uiVariant: variant });
    driver.paceMs = 350;
    driverLogSink.current = (m) => {
      const heal = /^Re-grounded "(.+?)" → "(.+?)"/.exec(m);
      if (heal) pushActLog("heal", `Self-healed: ${heal[1]} → ${heal[2]}`);
      else if (/could not/i.test(m)) pushActLog("warn", m);
    };
    let regroundings = 0;
    try {
      const result = await runWorkflow({
        driver,
        workflow,
        requirements: parsed.requirements,
        context,
        actor: "agent",
        requireApprovalForCommit: s.settings.requireApprovalForCommit,
        signal: ac.signal,
        hooks: {
          onEvent: (type, data, stepId, message) => {
            const store = useSynforma.getState();
            store.addEvent({ runId, type, data, stepId, message });
            const step = stepId ? workflow.steps.find((st) => st.id === stepId) : undefined;
            switch (type) {
              case "step_entered":
                pushActLog("info", `Step ${step ? step.index + 1 : "?"}: ${message ?? ""}`);
                break;
              case "action_executed": {
                const d = data as { action?: { targetName?: string; label?: string }; ok?: boolean; regrounded?: boolean; regroundedTo?: string | null } | undefined;
                pushActLog(d?.ok ? "action" : "warn", message ?? "Action");
                store.addAudit({ actor: "agent", action: d?.action?.label ?? message ?? "Action", target: d?.action?.targetName, runId, programId: prog.id, detail: d?.regrounded ? `self-healed → ${d.regroundedTo ?? "?"}` : undefined });
                break;
              }
              case "action_regrounded":
                regroundings += 1;
                setAct((a) => ({ ...a, regroundings }));
                break;
              case "approval_requested":
                pushActLog("approval", message ?? "Approval requested");
                store.addAudit({ actor: "agent", action: "Approval requested", target: step?.title, runId, programId: prog.id, approval: "requested", detail: message });
                break;
              case "approval_granted":
                pushActLog("approval", "Approval granted by the operator");
                store.addAudit({ actor: "admin", action: "Approval granted", target: step?.title, runId, programId: prog.id, approval: "granted" });
                break;
              case "approval_denied":
                pushActLog("warn", "Approval denied by the operator");
                store.addAudit({ actor: "admin", action: "Approval denied", target: step?.title, runId, programId: prog.id, approval: "denied" });
                break;
              case "outcome_verified":
                pushActLog("done", message ?? "Outcome verified");
                break;
              case "run_completed":
                pushActLog("done", "Run completed");
                store.addAudit({ actor: "agent", action: "Run completed", runId, programId: prog.id, detail: `${(data?.requirementsMet as string[] | undefined)?.length ?? 0} requirements verified` });
                break;
              case "run_failed":
                pushActLog("warn", `Run failed${message ? `: ${message}` : ""}`);
                store.addAudit({ actor: "agent", action: "Run failed", runId, programId: prog.id, detail: message ?? (data?.error as string | undefined) ?? (data?.reason as string | undefined) });
                break;
              case "run_abandoned":
                pushActLog("warn", "Run abandoned");
                store.addAudit({ actor: "agent", action: "Run abandoned", runId, programId: prog.id, detail: (data?.reason as string | undefined) ?? message });
                break;
              case "validation_error":
              case "action_failed":
                pushActLog("warn", message ?? type);
                break;
              default:
                if (message) pushActLog("info", message);
            }
          },
          requestApproval: (req) =>
            new Promise<"granted" | "denied">((resolve) => {
              const request: ApprovalRequest = { id: shortId("apr"), runId, requestedAt: Date.now(), ...req };
              useSynforma.getState().addApproval(request);
              approvalRequest.current = request;
              approvalResolver.current = resolve;
              setApproval(request);
            }),
          onStep: (step, status) => setAct((a) => ({ ...a, currentStepId: step.id, stepStatus: { ...a.stepStatus, [step.id]: status } })),
        },
      });
      driverLogSink.current = null;
      hideOverlays();
      const endedAt = Date.now();
      useSynforma.getState().updateRun(runId, { endedAt, outcome: result.outcome, requirementsMet: result.requirementsMet, regroundings: result.regroundings });
      setAct((a) => ({ ...a, status: "done", result, endedAt, regroundings: result.regroundings, currentStepId: null }));
      setCurrentUrl(driver.currentUrl());
      const total = parsed.requirements.filter((r) => r.kind === "field").length;
      if (result.outcome === "completed") toast.success(`Run completed — ${result.requirementsMet.length}/${total} requirements verified${result.regroundings ? ` · ${result.regroundings} self-healed` : ""}`);
      else toast.warning(`Run ${result.outcome}${result.error ? `: ${result.error}` : ""}`);
    } catch (e) {
      driverLogSink.current = null;
      hideOverlays();
      const aborted = ac.signal.aborted;
      const endedAt = Date.now();
      const store = useSynforma.getState();
      store.addEvent({ runId, type: aborted ? "run_abandoned" : "run_failed", data: { reason: aborted ? "stopped by operator" : errorMessage(e) } });
      store.updateRun(runId, { endedAt, outcome: aborted ? "abandoned" : "failed" });
      store.addAudit({ actor: "agent", action: aborted ? "Run stopped by operator" : "Run failed", runId, programId: prog.id, detail: aborted ? undefined : errorMessage(e) });
      setAct((a) => ({ ...a, status: aborted ? "stopped" : "error", error: aborted ? null : errorMessage(e), endedAt, currentStepId: null }));
    }
  }, [context, hideOverlays, programId, pushActLog]);

  const stopRun = React.useCallback(() => {
    abortRef.current?.abort();
    if (approvalResolver.current) decideApproval("denied");
  }, [decideApproval]);

  const openOutcome = React.useCallback(async (url: string) => {
    const driver = driverRef.current;
    if (!driver) return;
    await driver.goto(url);
    setCurrentUrl(driver.currentUrl());
  }, []);

  const toggleUi = React.useCallback(
    async (v: UiVariant) => {
      const driver = driverRef.current;
      if (!driver) return;
      setUiBusy(true);
      try {
        await driver.goto(`${SANDBOX_APP.baseUrl}/settings?ui=${v}`);
        setUiVariant(v);
        useSynforma.getState().addAudit({ actor: "admin", action: "Simulated vendor UI update", target: SANDBOX_APP.name, detail: `UI ${v}${v === "v2" ? " — labels, menus, tabs and DOM ids changed" : " — original release"}`, programId: programId ?? undefined });
      } catch (e) {
        toast.error(`Could not switch the UI: ${errorMessage(e)}`);
      } finally {
        setUiBusy(false);
      }
    },
    [programId],
  );

  // ─────────────── synthetic users ───────────────
  const runSynthetic = React.useCallback(async () => {
    const driver = driverRef.current;
    const s0 = useSynforma.getState();
    const prog = programId ? s0.programs[programId] : null;
    if (!driver || !prog?.workflow || !prog.parsed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { workflow, parsed } = prog;
    const planner = createPlanner(prog.planner);
    driver.paceMs = 0;
    driverLogSink.current = null;
    setSynth({ status: "running", currentPersonaId: null, completed: 0, error: null });
    let completed = 0;
    let newInterventions = 0;
    let reactChain: Promise<void> = Promise.resolve();

    const react = (signalId: string) => {
      reactChain = reactChain.then(async () => {
        const st = useSynforma.getState();
        const signal = st.signals.find((sg) => sg.id === signalId);
        const program = st.programs[prog.id];
        if (!signal || !program) return;
        const runIdsOf = () => new Set(Object.values(useSynforma.getState().runs).filter((r) => r.programId === prog.id).map((r) => r.id));
        const before = new Set(Object.keys(st.interventions));
        try {
          const intervention = await reactToSignal(signal, {
            planner,
            program,
            getSignalsForStep: (stepId) => {
              const ids = runIdsOf();
              return useSynforma.getState().signals.filter((sg) => sg.stepId === stepId && ids.has(sg.runId));
            },
            getInterventionsForStep: (stepId) => Object.values(useSynforma.getState().interventions).filter((i) => i.programId === prog.id && i.stepId === stepId),
            getRuns: () => Object.values(useSynforma.getState().runs).filter((r) => r.programId === prog.id),
            saveHypothesis: (h) => useSynforma.getState().addHypothesis(h),
            saveIntervention: (i) => useSynforma.getState().upsertIntervention(i),
          });
          if (intervention && !before.has(intervention.id)) {
            newInterventions += 1;
            const step = workflow.steps.find((x) => x.id === intervention.stepId);
            useSynforma.getState().addAudit({ actor: "synforma", action: "Intervention proposed", target: step?.title, programId: prog.id, runId: signal.runId, detail: `${intervention.techniqueId} · from a ${signal.type} signal in a synthetic run` });
          }
        } catch (e) {
          useSynforma.getState().addAudit({ actor: "synforma", action: "Diagnosis failed", programId: prog.id, runId: signal.runId, detail: errorMessage(e) });
        }
      });
    };

    for (const persona of PERSONAS) {
      if (ac.signal.aborted) break;
      setSynth((st) => ({ ...st, currentPersonaId: persona.id }));
      const runId = shortId("run");
      const startedAt = Date.now();
      const variant = readSandboxUiVariant();
      const s = useSynforma.getState();
      s.addRun({ id: runId, programId: prog.id, workflowId: workflow.id, actor: "synthetic", persona: persona.name, mode: "guide", startedAt, interventionIds: [], uiVariant: variant, requirementsMet: [], regroundings: 0 });
      s.addEvent({ runId, type: "run_started", data: { actor: "synthetic", persona: persona.id, capabilities: { ...persona.capabilities }, simulated: true } });
      s.addAudit({ actor: "synthetic", action: `Simulation started: ${persona.name}`, runId, programId: prog.id, detail: "synthetic user — labeled simulation, excluded from human timing" });
      try {
        const result = await runWorkflow({
          driver,
          workflow,
          requirements: parsed.requirements,
          context,
          actor: "synthetic",
          capabilities: persona.capabilities,
          requireApprovalForCommit: false,
          signal: ac.signal,
          hooks: {
            onEvent: (type, data, stepId, message) => {
              const store = useSynforma.getState();
              store.addEvent({ runId, type, data, stepId, message });
              const struggle = STRUGGLE_EVENTS[type];
              if (struggle && stepId) {
                const signal = store.addSignal({ runId, stepId, type: struggle.type, magnitude: struggle.magnitude, t: Date.now(), detail: message ?? (data?.reason as string | undefined) });
                react(signal.id);
              }
            },
            requestApproval: async () => "granted",
          },
        });
        useSynforma.getState().updateRun(runId, { endedAt: Date.now(), outcome: result.outcome, requirementsMet: result.requirementsMet, regroundings: result.regroundings });
        useSynforma.getState().addAudit({ actor: "synthetic", action: `Simulation ${result.outcome}: ${persona.name}`, runId, programId: prog.id, detail: `${result.requirementsMet.length} requirements verified` });
      } catch (e) {
        const aborted = ac.signal.aborted;
        useSynforma.getState().addEvent({ runId, type: aborted ? "run_abandoned" : "run_failed", data: { reason: aborted ? "stopped by operator" : errorMessage(e), simulated: true } });
        useSynforma.getState().updateRun(runId, { endedAt: Date.now(), outcome: aborted ? "abandoned" : "failed" });
        if (aborted) break;
      }
      completed += 1;
      setSynth((st) => ({ ...st, completed }));
    }
    await reactChain;
    hideOverlays();
    setCurrentUrl(driver.currentUrl());
    const stopped = ac.signal.aborted;
    setSynth({ status: stopped ? "stopped" : "done", currentPersonaId: null, completed, error: null });
    toast(stopped ? `Simulation stopped after ${completed} synthetic run${completed === 1 ? "" : "s"}` : `${completed} synthetic runs finished (simulation)`, {
      description: newInterventions ? `${newInterventions} intervention${newInterventions === 1 ? "" : "s"} proposed from observed struggle` : "No new interventions proposed",
    });
  }, [context, hideOverlays, programId]);

  const stopSynthetic = React.useCallback(() => abortRef.current?.abort(), []);

  // ─────────────── program lifecycle ───────────────
  const approveProgram = React.useCallback(() => {
    const s = useSynforma.getState();
    const prog = programId ? s.programs[programId] : null;
    if (!prog) return;
    if (prog.status !== "active") {
      patchProgram(prog.id, { status: "active" });
      s.addAudit({ actor: "admin", action: "Program approved", programId: prog.id, target: prog.title, detail: `${prog.workflow?.steps.length ?? 0} steps · ${prog.planner} planner` });
      toast.success("Program approved");
    }
    setPhase("act");
  }, [programId, setPhase]);

  const startOver = React.useCallback(() => {
    abortRef.current?.abort();
    if (approvalResolver.current) decideApproval("denied");
    const s = useSynforma.getState();
    if (s.activeProgramId) {
      const id = s.activeProgramId;
      s.addAudit({ actor: "admin", action: "Program deleted", programId: id, target: s.programs[id]?.title });
      s.deleteProgram(id);
      clearPrefs(id);
    }
    setDiscovery(INITIAL_DISCOVERY);
    setLiveGraph(null);
    setAct(INITIAL_ACT);
    setSynth(INITIAL_SYNTH);
    setContext(DEFAULT_CONTEXT);
    setConnection({ status: "idle", info: null, error: null });
    setCursor(null);
    setHighlight(null);
    setPhaseState("connect");
    setConfirmReset(false);
    const iframe = iframeRef.current;
    if (iframe) iframe.src = "about:blank";
    setCurrentUrl("");
  }, [decideApproval]);

  // ─────────────── export ───────────────
  const exportJSON = React.useCallback(() => {
    const json = useSynforma.getState().exportJSON();
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synforma-${programId ?? "export"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Export prepared", { description: "If the download is blocked in this sandbox, use Copy to put the JSON on the clipboard." });
    } catch (e) {
      toast.error(`Export failed: ${errorMessage(e)}`);
    }
  }, [programId]);

  const copyJSON = React.useCallback(async () => {
    const json = useSynforma.getState().exportJSON();
    try {
      await navigator.clipboard.writeText(json);
      toast.success(`Copied ${Math.round(json.length / 1024)} KB of JSON to the clipboard`);
    } catch {
      toast.error("Clipboard unavailable in this browser context");
    }
  }, []);

  // ─────────────── derived ───────────────
  const busyLabel = discovery.status === "running" ? "Discovering" : discovery.status === "planning" ? "Planning" : act.status === "running" ? "Acting" : synth.status === "running" ? "Simulating" : uiBusy ? "Switching UI" : null;
  const maxIndex = maxPhaseIndex(program, connected);
  const completedPhases = React.useMemo(() => {
    const set = new Set<PhaseId>();
    if (connected || program) set.add("connect");
    if (program) set.add("objective");
    if (program?.discovery?.endedAt && program.status !== "discovering") set.add("discover");
    if (program?.status === "active") set.add("understand");
    if (programRuns.some((r) => r.actor === "agent" && r.outcome)) set.add("act");
    if (programRuns.some((r) => r.actor !== "agent" && r.outcome)) set.add("guide");
    if (programInterventions.length) set.add("adapt");
    if (programRuns.filter((r) => r.outcome).length >= MINIMUM_RUNS) set.add("measure");
    return set;
  }, [connected, program, programRuns, programInterventions]);

  const drawerEvents = React.useMemo(() => (drawerRun ? programEvents.filter((e) => e.runId === drawerRun.id) : []), [drawerRun, programEvents]);
  const graphForPreview = liveGraph ?? storeGraph;

  // ─────────────── render ───────────────
  const ready = hydrated && phaseReady;

  let panel: React.ReactNode;
  if (!ready) panel = <PanelSkeleton />;
  else if (phase === "connect")
    panel = <ConnectPanel status={connection.status} info={connection.info} error={connection.error} appName={SANDBOX_APP.name} baseUrl={SANDBOX_APP.baseUrl} version={SANDBOX_APP.version} onConnect={() => void connect()} onContinue={() => setPhase("objective")} />;
  else if (phase === "objective")
    panel = (
      <ObjectivePanel
        key={program?.id ?? "new"}
        objective={program?.objectiveText ?? DEFAULT_OBJECTIVE}
        context={context}
        hasDiscovery={Boolean(program?.discovery?.endedAt)}
        plannerLabel={plannerLabel}
        busy={discovery.status === "running" || discovery.status === "planning"}
        onStart={(o, c, m) => void startDiscovery(o, c, m)}
        onBack={() => setPhase("connect")}
      />
    );
  else if (phase === "discover")
    panel = (
      <DiscoverPanel
        state={discovery}
        program={program}
        liveGraph={graphForPreview}
        plannerLabel={plannerLabel}
        plannerName={plannerName}
        engineBusy={discovery.status === "running" || act.status === "running" || synth.status === "running" || uiBusy}
        onStop={stopDiscovery}
        onRestart={restartDiscovery}
        onContinue={() => setPhase("understand")}
      />
    );
  else if (!program) panel = <PanelSkeleton />;
  else if (phase === "understand")
    panel = <UnderstandPanel program={program} plannerLabel={plannerLabel} plannerName={plannerName} onApprove={approveProgram} onEdit={() => setPhase("objective")} onDiscover={() => setPhase("discover")} />;
  else if (phase === "act")
    panel = (
      <ActPanel
        state={act}
        program={program}
        uiVariant={uiVariant}
        uiBusy={uiBusy}
        plannerName={plannerName}
        requireApproval={settings.requireApprovalForCommit}
        agentRuns={programRuns.filter((r) => r.actor === "agent")}
        onRun={() => void runAct()}
        onStop={stopRun}
        onToggleUi={(v) => void toggleUi(v)}
        onOpenOutcome={(url) => void openOutcome(url)}
      />
    );
  else if (phase === "guide") panel = <GuidePanel state={synth} program={program} runs={programRuns} events={programEvents} onRunSynthetic={() => void runSynthetic()} onStop={stopSynthetic} onOpenRun={setDrawerRun} />;
  else if (phase === "adapt") panel = <AdaptPanel program={program} interventions={programInterventions} hypotheses={hypotheses} runs={programRuns} onGoGuide={() => setPhase("guide")} />;
  else panel = <MeasurePanel program={program} runs={programRuns} events={programEvents} audit={audit} onOpenRun={setDrawerRun} onExport={exportJSON} onCopy={() => void copyJSON()} />;

  const approvalStep = approval && program?.workflow ? program.workflow.steps.find((s) => s.id === approval.stepId) : undefined;

  return (
    <div className="flex flex-col bg-paper lg:h-[calc(100dvh-3rem)] lg:min-h-[640px]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="eyebrow hidden sm:inline">Mission Control</span>
          <span className="hidden text-line-strong sm:inline" aria-hidden="true">
            /
          </span>
          {ready ? (
            <>
              <span className="truncate text-sm font-medium text-ink" data-testid="program-title">
                {program?.title ?? "New program"}
              </span>
              {program ? (
                <Badge variant={program.status === "active" ? "verdant" : "muted"} data-testid="program-status">
                  {program.status}
                </Badge>
              ) : null}
            </>
          ) : (
            <Skeleton className="h-4 w-40" />
          )}
        </div>
        <Badge variant="outline" className="hidden max-w-[320px] truncate md:inline-flex" title={plannerLabel} data-testid="planner-badge">
          <Cpu className="h-3 w-3" aria-hidden="true" />
          {plannerLabel}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {busyLabel ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {busyLabel}…
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={!ready} data-testid="start-over">
            <RotateCcw aria-hidden="true" />
            Start over
          </Button>
        </div>
      </header>

      <PhaseRail current={phase} completed={completedPhases} maxIndex={ready ? maxIndex : -1} onSelect={setPhase} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="h-[420px] shrink-0 border-b border-line lg:h-auto lg:w-[58%] lg:border-b-0 lg:border-r" aria-label="Target application">
          <TargetFrame
            iframeRef={iframeRef}
            title={`${SANDBOX_APP.name} · sandbox`}
            connected={connected}
            connecting={connection.status === "connecting"}
            currentUrl={currentUrl}
            busy={Boolean(busyLabel)}
            cursor={cursor}
            highlight={highlight}
            onConnect={() => void connect()}
          />
        </section>
        <aside className={cn("min-h-0 flex-1 lg:w-[42%] lg:overflow-y-auto scrollbar-thin")} aria-label="Phase panel" data-testid="phase-panel">
          {panel}
        </aside>
      </div>

      <ApprovalDialog request={approval} step={approvalStep} onDecide={decideApproval} />
      <RunEventsDrawer run={drawerRun} events={drawerEvents} workflow={program?.workflow} open={Boolean(drawerRun)} onOpenChange={(o) => !o && setDrawerRun(null)} />

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Start over?</DialogTitle>
            <DialogDescription>This deletes the program, its Work Graph, discovery, runs, events and interventions from this browser. The audit log is kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="signal" onClick={startOver} data-testid="confirm-start-over">
              Start over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
