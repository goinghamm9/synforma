"use client";
import * as React from "react";
import { useSynforma } from "@/lib/synforma/store";
import { explore, type DiscoveredState } from "@/lib/synforma/engine/explorer";
import { createPlanner, fetchPlannerStatus, resolvePlannerKind } from "@/lib/synforma/planner";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import { cloneGraph, countByType, createGraph } from "@/lib/synforma/graph/work-graph";
import type { TargetApp } from "@/lib/synforma/targets";
import type { PlannerKind, Program, WorkGraph } from "@/lib/synforma/types";
import { shortId } from "@/lib/utils";
import type { LogLevel, PhaseId } from "../types";
import { writePrefs } from "../demo-prefs";
import type { DiscoveryState } from "../phases/discover-panel";
import type { ConnectionApi } from "./use-connection";
import { EMPTY_COUNTERS, INITIAL_DISCOVERY, appendLog, errorMessage, mkLine, patchProgram, stripPlan, versionWorkflow } from "./helpers";

export interface DiscoveryApi {
  state: DiscoveryState;
  /** The Work Graph as the explorer builds it (throttled); null when nothing is being discovered. */
  liveGraph: WorkGraph | null;
  /** Create or update the program, then crawl and plan ("discover") or re-plan from the stored discovery ("replan"). */
  start: (objectiveText: string, ctx: Record<string, string>, mode: "discover" | "replan") => Promise<void>;
  stop: () => void;
  /** Crawl the current program again with its planner. */
  restart: () => void;
  reset: () => void;
}

interface Options {
  target: TargetApp;
  connection: ConnectionApi;
  programId: string | null;
  plannerStatus: PlannerStatus | null;
  setPhase: (id: PhaseId) => void;
  setContext: (ctx: Record<string, string>) => void;
}

/** Explorer run with live graph updates, planning and re-planning, and the discovery log. */
export function useDiscovery({ connection, programId, plannerStatus, setPhase, setContext, target }: Options): DiscoveryApi {
  const { getDriver, driverLogSinkRef, abortRef, hideOverlays } = connection;
  const graphTimer = React.useRef<number | null>(null);
  const pendingGraph = React.useRef<WorkGraph | null>(null);
  const [discovery, setDiscovery] = React.useState<DiscoveryState>(INITIAL_DISCOVERY);
  const [liveGraph, setLiveGraph] = React.useState<WorkGraph | null>(null);

  const pushDiscoveryLog = React.useCallback((level: LogLevel, message: string) => {
    const line = mkLine(level, message);
    setDiscovery((d) => ({ ...d, log: appendLog(d.log, line) }));
  }, []);

  React.useEffect(() => {
    return () => {
      if (graphTimer.current) window.clearTimeout(graphTimer.current);
    };
  }, []);

  const plan = React.useCallback(
    async (prog: Program, states: DiscoveredState[], graph: WorkGraph, kind: PlannerKind, replanned = false) => {
      setDiscovery((d) => ({ ...d, status: "planning", error: null }));
      try {
        const planner = createPlanner(kind);
        const parsed = await planner.parseObjective({ objectiveText: prog.objectiveText, appName: target.name });
        const inferred = await planner.inferWorkflow({ parsed, states, graph, startUrl: target.baseUrl });
        const fallback = kind !== "heuristic" ? ((planner as { lastError?: string | null }).lastError ?? null) : null;
        const effectiveKind: PlannerKind = fallback ? "heuristic" : kind;
        const workflow = versionWorkflow(inferred, prog.workflow, effectiveKind, replanned);
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
        pushDiscoveryLog("done", `${effectiveKind} planner mapped ${mapped}/${fieldReqs.length} requirements into ${workflow.steps.length} steps (workflow v${workflow.version})${fallback ? ` (Gemini unavailable: ${fallback})` : ""}`);
        setDiscovery((d) => ({ ...d, status: "done", planned: { mapped, total: fieldReqs.length, steps: workflow.steps.length } }));
        setPhase("understand");
      } catch (e) {
        setDiscovery((d) => ({ ...d, status: "error", error: `Planning failed: ${errorMessage(e)}` }));
        patchProgram(prog.id, { status: "draft" });
      }
    },
    [pushDiscoveryLog, setPhase, target],
  );

  const discover = React.useCallback(
    async (prog: Program, kind: PlannerKind) => {
      const driver = getDriver();
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
      useSynforma.getState().addAudit({ actor: "synforma", action: "Discovery started", programId: prog.id, target: target.baseUrl, detail: "commit actions are recorded, never executed" });
      driver.paceMs = 120;
      driverLogSinkRef.current = (m) => pushDiscoveryLog(/re-grounded/i.test(m) ? "heal" : /could not/i.test(m) ? "warn" : "info", m);
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
          startUrl: target.baseUrl,
          appName: target.name,
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
        driverLogSinkRef.current = null;
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
        driverLogSinkRef.current = null;
        hideOverlays();
        setDiscovery((d) => ({ ...d, status: "error", error: errorMessage(e) }));
        patchProgram(prog.id, { status: "draft" });
      }
    },
    [abortRef, driverLogSinkRef, getDriver, hideOverlays, plan, pushDiscoveryLog, setPhase, target],
  );

  const start = React.useCallback(
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
          application: { name: target.name, baseUrl: target.baseUrl },
          context: ctx,
          graphId: shortId("g"),
          status: "discovering",
          planner: kind,
          createdAt: now,
          updatedAt: now,
        };
        s.upsertProgram(prog);
        s.setActiveProgram(prog.id);
        s.saveGraph(createGraph(prog.graphId));
        s.addAudit({ actor: "admin", action: "Program created", programId: prog.id, target: target.name, detail: `planner: ${kind}` });
      } else {
        prog = { ...prog, objectiveText, planner: kind, context: ctx };
        s.upsertProgram(prog);
      }
      setContext(ctx);
      writePrefs(prog.id, { phase: "discover" });
      const existing = s.discoveries[prog.id];
      if (mode === "replan" && existing?.length) {
        const base = s.graphs[prog.graphId] ?? createGraph(prog.graphId);
        const graph = stripPlan(cloneGraph(base));
        setPhase("discover");
        setLiveGraph(cloneGraph(graph));
        pushDiscoveryLog("info", `Re-planning with the existing discovery (${existing.length} states)`);
        await plan(prog, existing, graph, kind, true);
        return;
      }
      await discover(prog, kind);
    },
    [discover, plan, plannerStatus, programId, pushDiscoveryLog, setContext, setPhase, target],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    pushDiscoveryLog("warn", "Stop requested — finishing the current action");
  }, [abortRef, pushDiscoveryLog]);

  const restart = React.useCallback(() => {
    const s = useSynforma.getState();
    const prog = programId ? s.programs[programId] : null;
    if (!prog) return;
    void discover(prog, prog.planner);
  }, [discover, programId]);

  const reset = React.useCallback(() => {
    setDiscovery(INITIAL_DISCOVERY);
    setLiveGraph(null);
  }, []);

  return { state: discovery, liveGraph, start, stop, restart, reset };
}
