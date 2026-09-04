"use client";
/**
 * Engine harness (development only). Exposes the Universal Interaction Layer,
 * explorer, planner and runner on window.__synforma so end-to-end tests can
 * drive the engine against the sandbox without any UI.
 */
import { useEffect, useRef } from "react";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import { explore, type DiscoveredState, type ExploreEvent } from "@/lib/synforma/engine/explorer";
import { createGraph } from "@/lib/synforma/graph/work-graph";
import { HeuristicPlanner } from "@/lib/synforma/planner/heuristic";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { HumanObserver } from "@/lib/synforma/engine/observer";
import { DEFAULT_CONTEXT, DEFAULT_OBJECTIVE, SANDBOX_APP } from "@/lib/synforma/demo";
import type { RunEvent, Workflow } from "@/lib/synforma/types";

declare global {
  interface Window {
    __synforma?: Record<string, unknown>;
  }
}

export default function EngineHarness() {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = ref.current!;
    const logs: string[] = [];
    const driver = new IframeDriver(iframe, { paceMs: 0, events: { onLog: (m) => logs.push(m) } });
    const planner = new HeuristicPlanner();
    const api = {
      driver,
      planner,
      logs,
      events: [] as Partial<RunEvent>[],
      async snapshot(url?: string) {
        if (url) await driver.goto(url);
        return driver.snapshot().page;
      },
      async discover(startUrl = SANDBOX_APP.baseUrl, limits?: Record<string, number>) {
        const graph = createGraph("g_test");
        const events: ExploreEvent[] = [];
        const { states, stats } = await explore({ driver, startUrl, appName: SANDBOX_APP.name, graph, limits, onEvent: (e) => events.push(e) });
        (api as Record<string, unknown>).states = states;
        (api as Record<string, unknown>).graph = graph;
        return { states: states.map((s) => ({ id: s.id, label: s.label, route: s.route, fields: s.page.fields.map((f) => f.name), actions: s.page.actions.map((a) => a.name), revealed: s.revealed, depth: s.depth })), stats, graphCounts: { nodes: graph.nodes.length, edges: graph.edges.length }, logs: events.filter((e) => e.type === "log").map((e) => (e as { message: string }).message) };
      },
      async plan(objective = DEFAULT_OBJECTIVE) {
        const states = (api as Record<string, unknown>).states as DiscoveredState[];
        const graph = (api as Record<string, unknown>).graph as ReturnType<typeof createGraph>;
        const parsed = await planner.parseObjective({ objectiveText: objective, appName: SANDBOX_APP.name });
        const workflow = await planner.inferWorkflow({ parsed, states, graph, startUrl: SANDBOX_APP.baseUrl });
        (api as Record<string, unknown>).parsed = parsed;
        (api as Record<string, unknown>).workflow = workflow;
        return { parsed, workflow };
      },
      async act(context: Record<string, string> = DEFAULT_CONTEXT, approve = true) {
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        const parsed = (api as Record<string, unknown>).parsed as { requirements: never[] };
        api.events = [];
        const result = await runWorkflow({
          driver,
          workflow,
          requirements: parsed.requirements,
          context,
          actor: "agent",
          hooks: {
            onEvent: (type, data, stepId, message) => api.events.push({ type, data, stepId, message }),
            requestApproval: async () => (approve ? "granted" : "denied"),
          },
        });
        return { result, events: api.events };
      },
      observe(onSignal: (s: unknown) => void) {
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        const parsed = (api as Record<string, unknown>).parsed as { requirements: never[] };
        api.events = [];
        const observer = new HumanObserver({
          driver,
          workflow,
          requirements: parsed.requirements,
          hesitationThresholdMs: 3000,
          hooks: {
            onEvent: (type, data, stepId, message) => api.events.push({ type, data, stepId, message }),
            onStepChange: () => {},
            onSignal: (s) => onSignal(s),
            onComplete: (r) => api.events.push({ type: "run_completed", data: r as unknown as Record<string, unknown> }),
          },
        });
        observer.start();
        return observer;
      },
    };
    window.__synforma = api;
    return () => {
      delete window.__synforma;
    };
  }, []);
  return (
    <div className="p-4">
      <p className="mb-2 text-sm text-slate">Engine harness. Open the console and use window.__synforma.</p>
      <iframe ref={ref} title="target" src="about:blank" className="h-[720px] w-full border border-line bg-white" />
    </div>
  );
}
