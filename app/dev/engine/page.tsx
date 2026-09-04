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
import { decide } from "@/lib/synforma/engine/adoption";
import { claimsFromProgram, truthReport, resolveBelief } from "@/lib/synforma/engine/evidence";
import { defaultContract, stepTrust } from "@/lib/synforma/engine/trust";
import { rollbackEntries } from "@/lib/synforma/engine/ledger";
import { DemonstrationRecorder, reconstructWorkflow } from "@/lib/synforma/engine/demonstration";
import { composeRecap, skillStatus } from "@/lib/synforma/engine/proficiency";
import type { Claim, Hypothesis, Intervention, LedgerEntry, ParsedObjective, StruggleSignal } from "@/lib/synforma/types";
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
      ledger: [] as LedgerEntry[],
      async act(context: Record<string, string> = DEFAULT_CONTEXT, approve = true, extra: { routineOnly?: boolean; useTrust?: boolean; onlySteps?: string[]; workflowOverride?: Workflow } = {}) {
        const workflow = extra.workflowOverride ?? ((api as Record<string, unknown>).workflow as Workflow);
        const parsed = (api as Record<string, unknown>).parsed as ParsedObjective;
        api.events = [];
        api.ledger = [];
        const claims = extra.useTrust ? ((api as Record<string, unknown>).claimsData as Claim[] | undefined) : undefined;
        const result = await runWorkflow({
          driver,
          workflow,
          requirements: parsed.requirements,
          context,
          actor: "agent",
          routineOnly: extra.routineOnly,
          onlySteps: extra.onlySteps,
          contract: extra.useTrust ? defaultContract(workflow) : undefined,
          claims,
          runId: "run_test",
          programId: "p_test",
          intent: workflow.title,
          decidedBy: "heuristic",
          hooks: {
            onEvent: (type, data, stepId, message) => api.events.push({ type, data, stepId, message }),
            requestApproval: async () => (approve ? "granted" : "denied"),
            onLedger: (e) => api.ledger.push(e),
          },
        });
        return { result, events: api.events, ledger: api.ledger };
      },
      async rollback() {
        const r = await rollbackEntries(driver, api.ledger);
        return { restored: r.restored.length, skipped: r.skipped.length, page: driver.snapshot().page.fields.map((f) => `${f.name}=${f.value ?? (f.checked ? "checked" : "")}`) };
      },
      claims(objectiveOverride?: ParsedObjective) {
        const states = (api as Record<string, unknown>).states as DiscoveredState[];
        const graph = (api as Record<string, unknown>).graph as ReturnType<typeof createGraph>;
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        const parsed = objectiveOverride ?? ((api as Record<string, unknown>).parsed as ParsedObjective);
        const program = { id: "p_test", title: "t", objectiveText: "", application: { name: SANDBOX_APP.name, baseUrl: SANDBOX_APP.baseUrl }, parsed, workflow, graphId: "g", status: "active", planner: "heuristic", createdAt: Date.now(), updatedAt: Date.now() } as unknown as Parameters<typeof claimsFromProgram>[0];
        const claims = claimsFromProgram(program, graph, states);
        (api as Record<string, unknown>).claimsData = claims;
        return { report: truthReport(claims), sample: claims.slice(0, 6).map((c) => `${c.authority} · ${c.statement}`), contested: claims.filter((c) => c.status === "contested").map((c) => c.statement + " — " + (c.reason ?? "")), belief: resolveBelief(claims, "requirement:r2") };
      },
      trust() {
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        const claims = ((api as Record<string, unknown>).claimsData as Claim[]) ?? [];
        const contract = defaultContract(workflow);
        return { contract: contract.rules.map((r) => `${r.actionClass}: synforma=${r.synforma}`), steps: workflow.steps.map((s) => ({ step: s.title, ...stepTrust(s, workflow, contract, claims) })) };
      },
      async replan(objectiveText: string) {
        const states = (api as Record<string, unknown>).states as DiscoveredState[];
        const graph = (api as Record<string, unknown>).graph as ReturnType<typeof createGraph>;
        const parsed = await planner.parseObjective({ objectiveText, appName: SANDBOX_APP.name });
        const workflow = await planner.inferWorkflow({ parsed, states, graph, startUrl: SANDBOX_APP.baseUrl });
        (api as Record<string, unknown>).parsed = parsed;
        (api as Record<string, unknown>).workflow = workflow;
        return { requirements: parsed.requirements.map((r) => r.text), steps: workflow.steps.map((s) => s.title) };
      },
      recorder: null as DemonstrationRecorder | null,
      startRecording() {
        api.recorder = new DemonstrationRecorder(driver);
        api.recorder.start();
      },
      reconstruct() {
        const trace = api.recorder?.stop() ?? [];
        const states = (api as Record<string, unknown>).states as DiscoveredState[];
        const parsed = (api as Record<string, unknown>).parsed as ParsedObjective;
        const planned = (api as Record<string, unknown>).workflow as Workflow;
        const rec = reconstructWorkflow(trace, { objective: parsed, states, planned, startUrl: SANDBOX_APP.baseUrl, planner: "heuristic" });
        (api as Record<string, unknown>).demonstrated = rec.workflow;
        return { traceCount: trace.length, summary: rec.summary, steps: rec.workflow.steps.map((s) => `${s.title} [${s.mode}${s.commit ? ", commit" : ""}] ${s.actions.map((a) => `${a.kind}:${a.targetName}`).join(" ; ")}`), questions: rec.questions.map((q) => q.question), deviations: rec.deviations, version: rec.workflow.version };
      },
      recap() {
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        return composeRecap(api.events.map((e, i) => ({ id: String(i), runId: "run_test", t: Date.now(), type: e.type!, stepId: e.stepId, message: e.message, data: e.data })), workflow, "run_test");
      },
      skill() {
        const now = Date.now();
        return [
          skillStatus(undefined, "1.0", now),
          skillStatus({ programId: "p", stepId: "s", assistedRuns: 0, unassistedSuccesses: 1, recentErrors: 0, errorHistory: [false], assistanceLevel: "guide", updatedAt: now, exposures: 1, lastExecutedAt: now }, "1.0", now),
          skillStatus({ programId: "p", stepId: "s", assistedRuns: 1, unassistedSuccesses: 0, recentErrors: 0, errorHistory: [false, false, false, false], assistanceLevel: "explain", updatedAt: now, exposures: 4, lastExecutedAt: now, workflowVersion: "1.0" }, "1.1", now),
          skillStatus({ programId: "p", stepId: "s", assistedRuns: 1, unassistedSuccesses: 0, recentErrors: 0, errorHistory: [false, false, false, false], assistanceLevel: "explain", updatedAt: now, exposures: 4, lastExecutedAt: now - 60 * 86_400_000, workflowVersion: "1.0" }, "1.0", now),
        ];
      },
      frictions: [] as unknown[],
      observe(onSignal: (s: unknown) => void, sensing = true) {
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        const parsed = (api as Record<string, unknown>).parsed as { requirements: never[]; policyConstraints: string[] };
        api.events = [];
        api.frictions = [];
        const observer = new HumanObserver({
          driver,
          workflow,
          requirements: parsed.requirements,
          hesitationThresholdMs: 3000,
          sensing,
          policyConstraints: parsed.policyConstraints,
          hooks: {
            onEvent: (type, data, stepId, message) => api.events.push({ type, data, stepId, message }),
            onStepChange: () => {},
            onSignal: (s) => onSignal(s),
            onComplete: (r) => api.events.push({ type: "run_completed", data: r as unknown as Record<string, unknown> }),
            onFriction: (f) => api.frictions.push(f),
          },
        });
        observer.start();
        return observer;
      },
      async decide(signal: StruggleSignal, opts: { preference?: "just_do_it" | "work_with_me" | "teach_me" | "stay_out"; getItDone?: boolean; unassisted?: number } = {}) {
        const workflow = (api as Record<string, unknown>).workflow as Workflow;
        const parsed = (api as Record<string, unknown>).parsed as Record<string, unknown>;
        const hyps: Hypothesis[] = [];
        const ints: Intervention[] = [];
        const program = { id: "p_test", title: "t", objectiveText: "", application: { name: SANDBOX_APP.name, baseUrl: SANDBOX_APP.baseUrl }, parsed, workflow, graphId: "g", status: "active", planner: "heuristic", createdAt: 0, updatedAt: 0 } as unknown as Parameters<typeof decide>[1]["program"];
        return decide(signal, {
          planner,
          program,
          getSignalsForStep: () => [signal],
          getInterventionsForStep: () => ints,
          getRuns: () => [],
          saveHypothesis: (h) => hyps.push(h),
          saveIntervention: (i) => ints.push(i),
          preference: opts.preference,
          getItDone: opts.getItDone,
          proficiency: opts.unassisted !== undefined ? { programId: "p_test", stepId: signal.stepId, assistedRuns: 0, unassistedSuccesses: opts.unassisted, recentErrors: 0, errorHistory: [], assistanceLevel: opts.unassisted >= 3 ? "explain" : "guide", updatedAt: 0 } : undefined,
        });
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
