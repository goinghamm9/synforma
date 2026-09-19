"use client";
import * as React from "react";
import { toast } from "sonner";
import { useTrustLayer, type TrustLayerApi } from "@/components/trust";
import { useSynforma } from "@/lib/synforma/store";
import { MINIMUM_RUNS } from "@/lib/synforma/engine/metrics";
import { fetchPlannerStatus, plannerVendor, resolvePlannerKind } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import { DEFAULT_CONTEXT, SANDBOX_APP } from "@/lib/synforma/demo";
import type { AuditEntry, Hypothesis, Intervention, LedgerEntry, PlannerKind, Program, Run, RunEvent, SynformaSettings, WorkGraph } from "@/lib/synforma/types";
import { PHASE_INDEX, type PhaseId, type UiVariant } from "../types";
import { clearPrefs, readPrefs, readSandboxUiVariant, writePrefs } from "../demo-prefs";
import { useStoreHydrated } from "../use-store-hydrated";
import { useConnection, type ConnectionApi } from "./use-connection";
import { useDiscovery, type DiscoveryApi } from "./use-discovery";
import { useActRun, type ActRunApi } from "./use-act-run";
import { useSyntheticRuns, type SyntheticRunsApi } from "./use-synthetic-runs";
import { defaultPhaseFor, errorMessage, maxPhaseIndex, patchProgram, plannerLabelFor } from "./helpers";

export type DemoView = SynformaSettings["demoView"];

/**
 * Everything Mission Control's views need: the active program and its store-derived
 * collections, the sandbox connection, the engine jobs (discovery, act run, simulation),
 * the trust layer, phase navigation and the transient UI state around them.
 */
export interface MissionSession {
  /** Store rehydrated and the phase restored: panels may render. */
  ready: boolean;
  program: Program | null;
  programId: string | null;
  programRuns: Run[];
  programEvents: RunEvent[];
  programInterventions: Intervention[];
  programHypotheses: Record<string, Hypothesis>;
  storeGraph: WorkGraph | null;
  audit: AuditEntry[];
  settings: SynformaSettings;
  plannerKind: PlannerKind | null;
  /** Long planner label for badges ("Claude planner — configured"). */
  plannerLabel: string;
  /** Short planner name for prose ("heuristic planner" / "Claude planner"). */
  plannerName: string;
  connection: ConnectionApi;
  discovery: DiscoveryApi;
  act: ActRunApi;
  synth: SyntheticRunsApi;
  trust: TrustLayerApi;
  /** Provenance + rollback ledger entries for this program's agent runs. */
  programLedger: LedgerEntry[];
  /** The trust layer's demonstration recorder, with `start` clearing the agent overlays first. */
  demonstration: TrustLayerApi["demonstration"];
  /** Work context Synforma may use; restored from the program after hydration. */
  context: Record<string, string>;
  phase: PhaseId;
  setPhase: (id: PhaseId) => void;
  /** Highest phase index the operator may open. */
  maxIndex: number;
  completedPhases: Set<PhaseId>;
  uiVariant: UiVariant;
  uiBusy: boolean;
  /** Simulated vendor UI update: switch the sandbox to v1 or v2. */
  toggleUi: (v: UiVariant) => Promise<void>;
  drawerRun: Run | null;
  setDrawerRun: (run: Run | null) => void;
  drawerEvents: RunEvent[];
  confirmReset: boolean;
  setConfirmReset: (open: boolean) => void;
  /** Delete the program and everything derived from it; the audit log is kept. */
  startOver: () => void;
  /** Incremented to scroll the Understand phase to its evidence section. */
  evidenceFocus: number;
  reviewEvidence: () => void;
  approveProgram: () => void;
  /** Undo reversible fills of the ledger in the live interface. */
  undoLedger: () => Promise<void>;
  openOutcome: (url: string) => Promise<void>;
  exportJSON: () => void;
  copyJSON: () => Promise<void>;
  /** What the engine is doing right now, for the header and the frame ("Discovering", "Acting", …). */
  busyLabel: string | null;
  demoView: DemoView;
  setDemoView: (view: DemoView) => void;
}

export function useMissionSession(): MissionSession {
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
  const programHypotheses = React.useMemo<Record<string, Hypothesis>>(() => Object.fromEntries(Object.entries(hypotheses).filter(([, h]) => h.programId === programId)), [hypotheses, programId]);
  const storeGraph = program ? (graphs[program.graphId] ?? null) : null;

  // ─────────────── transient UI state ───────────────
  /** Workflow identity (id@version) the claims and contract were last derived for; undefined until the store is ready. */
  const trustedWorkflow = React.useRef<string | null | undefined>(undefined);
  const [phase, setPhaseState] = React.useState<PhaseId>("connect");
  const [phaseReady, setPhaseReady] = React.useState(false);
  const [plannerStatus, setPlannerStatus] = React.useState<PlannerStatus | null>(null);
  const [context, setContext] = React.useState<Record<string, string>>(DEFAULT_CONTEXT);
  /** The sandbox's UI version as stored right now ("v1" on the server, where nothing reads it). */
  const [uiVariant, setUiVariant] = React.useState<UiVariant>(() => readSandboxUiVariant());
  const [uiBusy, setUiBusy] = React.useState(false);
  const [drawerRun, setDrawerRun] = React.useState<Run | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [evidenceFocus, setEvidenceFocus] = React.useState(0);

  // ─────────────── connection, trust layer, engine jobs ───────────────
  const connection = useConnection();
  const { getDriver, driverLogSinkRef, abortRef, hideOverlays, syncUrl, connect } = connection;
  const trust = useTrustLayer(program, getDriver);
  const { refreshClaims, ensureContract, applyRegroundings, undo } = trust;

  const setPhase = React.useCallback((id: PhaseId) => {
    setPhaseState(id);
    const pid = useSynforma.getState().activeProgramId;
    if (pid) writePrefs(pid, { phase: id });
  }, []);

  const discovery = useDiscovery({ connection, programId, plannerStatus, setPhase, setContext });
  const act = useActRun({ connection, programId, context, applyRegroundings, setUiVariant });
  const synth = useSyntheticRuns({ connection, programId, context });

  const connected = connection.connected;
  const plannerKind: PlannerKind | null = program ? program.planner : plannerStatus ? resolvePlannerKind(settings.plannerPreference, plannerStatus) : null;
  const plannerLabel = plannerLabelFor(plannerKind, plannerStatus);
  const plannerName = plannerKind === "heuristic" ? "heuristic planner" : `${plannerVendor(plannerKind)} planner`;

  React.useEffect(() => {
    let cancelled = false;
    fetchPlannerStatus().then((s) => {
      if (!cancelled) setPlannerStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore phase and context once the store has rehydrated; reconnect silently when a program exists.
  // One-time synchronisation from the persisted store (an external system that hydrates after mount):
  // the restored values cannot be lazy initial state, so this effect sets them once, then never again.
  React.useEffect(() => {
    if (!hydrated || phaseReady) return;
    const s = useSynforma.getState();
    const p = s.activeProgramId ? (s.programs[s.activeProgramId] ?? null) : null;
    if (p) {
      // The work context lives on the Program; prefs.context is the pre-migration location and only a fallback.
      const prefs = readPrefs(p.id);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after store hydration
      setContext({ ...DEFAULT_CONTEXT, ...(prefs.context ?? {}), ...(p.context ?? {}) });
      const max = maxPhaseIndex(p, true);
      const wanted = prefs.phase && PHASE_INDEX[prefs.phase] <= max ? prefs.phase : defaultPhaseFor(p);
      setPhaseState(wanted);
      void connect(true);
    }
    setPhaseReady(true);
  }, [hydrated, phaseReady, connect]);

  // Derive the evidence and the Autonomy Contract whenever the workflow of record changes in this session
  // (first plan, re-plan, adopted demonstration). The first observation after hydration only records the
  // identity, so claims persisted from earlier sessions (including superseded naming claims) are kept.
  const ready = hydrated && phaseReady;
  const workflowKey = program?.workflow ? `${program.workflow.id}@${program.workflow.version ?? ""}` : null;
  React.useEffect(() => {
    if (!ready) return;
    if (trustedWorkflow.current === undefined) {
      trustedWorkflow.current = workflowKey;
      return;
    }
    if (trustedWorkflow.current === workflowKey) return;
    trustedWorkflow.current = workflowKey;
    if (!workflowKey || !programId) return;
    const s = useSynforma.getState();
    const claims = refreshClaims();
    // Live observations from earlier agent runs (controls renamed by the vendor) outlive any re-plan: fold them back in.
    const agentRuns = new Set(Object.values(s.runs).filter((r) => r.programId === programId && r.actor === "agent").map((r) => r.id));
    applyRegroundings(s.events.filter((e) => e.type === "action_regrounded" && agentRuns.has(e.runId)));
    const contract = ensureContract();
    const contested = claims.filter((c) => c.status === "contested").length;
    s.addAudit({ actor: "synforma", action: "Evidence derived", programId, detail: `${claims.length} claims · ${contested} contested · contract v${contract?.version ?? "?"}` });
  }, [ready, workflowKey, refreshClaims, ensureContract, applyRegroundings, programId]);

  // A program restored without a contract for its workflow (data from before the trust layer) gets the default one.
  React.useEffect(() => {
    if (ready && workflowKey && !trust.contract) ensureContract();
  }, [ready, workflowKey, trust.contract, ensureContract]);

  // ─────────────── operator actions ───────────────
  const actStatus = act.state.status;
  const undoLedger = React.useCallback(async () => {
    const driver = getDriver();
    if (!driver || actStatus === "running") return;
    try {
      const restored = await undo();
      hideOverlays();
      syncUrl();
      if (restored > 0) toast.success(`Restored ${restored} field${restored === 1 ? "" : "s"}`, { description: "Previous values written back in the live interface; the ledger rows are marked undone." });
      else toast.warning("Nothing could be restored", { description: "The fields are no longer on screen. A committed record needs a compensating action in the target system, which the sandbox does not expose." });
    } catch (e) {
      hideOverlays();
      toast.error(`Undo failed: ${errorMessage(e)}`);
    }
  }, [actStatus, getDriver, hideOverlays, syncUrl, undo]);

  const reviewEvidence = React.useCallback(() => {
    setEvidenceFocus((n) => n + 1);
    setPhase("understand");
  }, [setPhase]);

  /** Teach by doing: the person drives the sandbox directly, so the agent overlays must be out of the way. */
  const demonstrationStart = trust.demonstration.start;
  const startDemonstration = React.useCallback(async () => {
    abortRef.current?.abort();
    hideOverlays();
    driverLogSinkRef.current = null;
    await demonstrationStart();
    syncUrl();
  }, [abortRef, demonstrationStart, driverLogSinkRef, hideOverlays, syncUrl]);

  const openOutcome = connection.goto;

  const toggleUi = React.useCallback(
    async (v: UiVariant) => {
      const driver = getDriver();
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
    [getDriver, programId],
  );

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

  const discardDemonstration = trust.demonstration.discard;
  const { stop: stopAct, reset: resetAct } = act;
  const { reset: resetDiscovery } = discovery;
  const { reset: resetSynth } = synth;
  const { reset: resetConnection } = connection;
  const startOver = React.useCallback(() => {
    stopAct();
    const s = useSynforma.getState();
    if (s.activeProgramId) {
      const id = s.activeProgramId;
      s.addAudit({ actor: "admin", action: "Program deleted", programId: id, target: s.programs[id]?.title });
      s.deleteProgram(id);
      clearPrefs(id);
      // deleteProgram removes the contract of the current workflow only; earlier versions (re-plans, demonstrations) would linger.
      useSynforma.setState((st) => {
        const live = new Set(Object.values(st.programs).map((p) => p.workflow?.id).filter(Boolean));
        return { contracts: Object.fromEntries(Object.entries(st.contracts).filter(([wid]) => live.has(wid))) };
      });
    }
    discardDemonstration();
    resetDiscovery();
    resetAct();
    resetSynth();
    setContext(DEFAULT_CONTEXT);
    resetConnection();
    setPhaseState("connect");
    setConfirmReset(false);
  }, [discardDemonstration, resetAct, resetConnection, resetDiscovery, resetSynth, stopAct]);

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

  const setDemoView = React.useCallback((view: DemoView) => useSynforma.getState().setSettings({ demoView: view }), []);

  // ─────────────── derived ───────────────
  const busyLabel =
    discovery.state.status === "running"
      ? "Discovering"
      : discovery.state.status === "planning"
        ? "Planning"
        : act.state.status === "running"
          ? "Acting"
          : synth.state.status === "running"
            ? "Simulating"
            : uiBusy
              ? "Switching UI"
              : trust.undoing
                ? "Undoing fills"
                : trust.demonstration.status === "recording"
                  ? "Recording your demonstration"
                  : null;
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
  const programLedger = React.useMemo(() => trust.ledger.filter((e) => e.programId === programId && e.requestedBy === "agent"), [trust.ledger, programId]);
  const demonstration = React.useMemo(() => ({ ...trust.demonstration, start: startDemonstration }), [trust.demonstration, startDemonstration]);

  return {
    ready,
    program,
    programId,
    programRuns,
    programEvents,
    programInterventions,
    programHypotheses,
    storeGraph,
    audit,
    settings,
    plannerKind,
    plannerLabel,
    plannerName,
    connection,
    discovery,
    act,
    synth,
    trust,
    programLedger,
    demonstration,
    context,
    phase,
    setPhase,
    maxIndex,
    completedPhases,
    uiVariant,
    uiBusy,
    toggleUi,
    drawerRun,
    setDrawerRun,
    drawerEvents,
    confirmReset,
    setConfirmReset,
    startOver,
    evidenceFocus,
    reviewEvidence,
    approveProgram,
    undoLedger,
    openOutcome,
    exportJSON,
    copyJSON,
    busyLabel,
    demoView: settings.demoView,
    setDemoView,
  };
}
