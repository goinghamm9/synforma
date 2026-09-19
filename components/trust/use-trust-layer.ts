"use client";
import * as React from "react";
import { DemonstrationRecorder, reconstructWorkflow, type Reconstruction, type TraceEvent } from "@/lib/synforma/engine/demonstration";
import { claimsFromProgram, claimsFromRegrounding, validateClaim } from "@/lib/synforma/engine/evidence";
import { rollbackEntries } from "@/lib/synforma/engine/ledger";
import { defaultContract } from "@/lib/synforma/engine/trust";
import { cloneGraph, nodeId, upsertEdge, upsertNode } from "@/lib/synforma/graph/work-graph";
import type { IframeDriver } from "@/lib/synforma/interaction/driver";
import { useSynforma } from "@/lib/synforma/store";
import type { AutonomyContract, Claim, LedgerEntry, Program, RunEvent, WorkGraph, Workflow } from "@/lib/synforma/types";
import type { DemonstrationStatus } from "./demonstration-panel";

const EMPTY_CLAIMS: Claim[] = [];

export interface TrustLayerApi {
  claims: Claim[];
  contract: AutonomyContract | undefined;
  ledger: LedgerEntry[];
  /** Recompute claims from the program, graph and discovery; keeps prior validations by statement. */
  refreshClaims: () => Claim[];
  /** Fold re-grounding events of a finished run into the claim set (live observation supersedes old naming). */
  applyRegroundings: (events: RunEvent[]) => void;
  validate: (claim: Claim, ok: boolean) => void;
  ensureContract: () => AutonomyContract | undefined;
  setContract: (next: AutonomyContract) => void;
  approveContract: () => void;
  undo: () => Promise<number>;
  undoing: boolean;
  demonstration: {
    status: DemonstrationStatus;
    trace: TraceEvent[];
    reconstruction: Reconstruction | null;
    answers: Record<string, string>;
    start: () => Promise<void>;
    stop: () => void;
    answer: (questionId: string, option: string) => void;
    adopt: () => void;
    discard: () => void;
    busy: boolean;
  };
}

/** Keep validated / retired statuses when claims are recomputed (matched by statement). */
export function mergeClaimValidation(previous: Claim[], next: Claim[]): Claim[] {
  const byStatement = new Map(previous.filter((c) => c.status === "validated" || (c.status === "retired" && c.validatedBy)).map((c) => [c.statement, c]));
  return next.map((c) => {
    const prev = byStatement.get(c.statement);
    return prev ? { ...c, status: prev.status, validatedBy: prev.validatedBy, validatedAt: prev.validatedAt, reason: prev.reason ?? c.reason } : c;
  });
}

/** Add workflow and step nodes for a (demonstrated) workflow to the graph, mirroring what the planner does. */
export function addWorkflowToGraph(graph: WorkGraph, workflow: Workflow): WorkGraph {
  const g = cloneGraph(graph);
  const wfNode = nodeId("workflow", workflow.id);
  upsertNode(g, { id: wfNode, type: "workflow", label: workflow.title, status: "observed", confidence: workflow.confidence, data: { steps: workflow.steps.length, version: workflow.version ?? null, origin: workflow.origin ?? null }, provenance: { source: "human_confirmation", trust: "OBSERVED_HIGH_CONFIDENCE", observedAt: Date.now() } });
  for (const st of workflow.steps) {
    const stNode = nodeId("step", workflow.id, st.id);
    upsertNode(g, { id: stNode, type: "step", label: `${st.index + 1}. ${st.title}`, description: st.modeRationale, status: "observed", confidence: workflow.confidence, data: { mode: st.mode, commit: st.commit, judgment: st.judgment }, provenance: { source: "human_confirmation", trust: "OBSERVED_HIGH_CONFIDENCE", observedAt: Date.now() } });
    upsertEdge(g, wfNode, stNode, "contains");
    if (st.screenId) upsertEdge(g, stNode, st.screenId, "targets");
    for (const rid of st.requirementIds) upsertEdge(g, stNode, nodeId("requirement", rid), "requires");
  }
  return g;
}

export function useTrustLayer(program: Program | null, getDriver: () => IframeDriver | null): TrustLayerApi {
  const programId = program?.id ?? null;
  const workflowId = program?.workflow?.id ?? null;
  const claims = useSynforma((s) => (programId ? (s.claims[programId] ?? EMPTY_CLAIMS) : EMPTY_CLAIMS));
  const contract = useSynforma((s) => (workflowId ? s.contracts[workflowId] : undefined));
  const ledger = useSynforma((s) => s.ledger);
  const [undoing, setUndoing] = React.useState(false);
  const [demoStatus, setDemoStatus] = React.useState<DemonstrationStatus>("idle");
  const [trace, setTrace] = React.useState<TraceEvent[]>([]);
  const [reconstruction, setReconstruction] = React.useState<Reconstruction | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const recorder = React.useRef<DemonstrationRecorder | null>(null);

  const refreshClaims = React.useCallback((): Claim[] => {
    if (!program) return [];
    const s = useSynforma.getState();
    const graph = s.graphs[program.graphId];
    const states = s.discoveries[program.id] ?? [];
    if (!graph) return [];
    const next = mergeClaimValidation(s.claims[program.id] ?? [], claimsFromProgram(program, graph, states));
    s.setClaims(program.id, next);
    return next;
  }, [program]);

  const applyRegroundings = React.useCallback(
    (events: RunEvent[]) => {
      if (!program) return;
      const s = useSynforma.getState();
      const existing = [...(s.claims[program.id] ?? [])];
      let added = 0;
      for (const e of events.filter((x) => x.type === "action_regrounded")) {
        const created = claimsFromRegrounding(program.id, e, existing);
        existing.push(...created);
        added += created.length;
      }
      if (added) s.setClaims(program.id, existing);
    },
    [program],
  );

  const validate = React.useCallback(
    (claim: Claim, ok: boolean) => {
      if (!program) return;
      const s = useSynforma.getState();
      const next = (s.claims[program.id] ?? []).map((c) => (c.id === claim.id ? validateClaim(c, "you", ok) : c));
      s.setClaims(program.id, next);
      s.addAudit({ actor: "admin", action: ok ? "claim_validated" : "claim_rejected", target: claim.subject, detail: claim.statement, programId: program.id });
    },
    [program],
  );

  const ensureContract = React.useCallback((): AutonomyContract | undefined => {
    const wf = program?.workflow;
    if (!wf) return undefined;
    const s = useSynforma.getState();
    const existing = s.contracts[wf.id];
    if (existing) return existing;
    const created = defaultContract(wf);
    s.setContract(created);
    return created;
  }, [program]);

  const setContract = React.useCallback(
    (next: AutonomyContract) => {
      const s = useSynforma.getState();
      s.setContract(next);
      s.addAudit({ actor: "admin", action: "autonomy_contract_changed", target: next.workflowId, detail: next.rules.map((r) => `${r.actionClass}=${r.synforma}`).join(", "), programId: programId ?? undefined });
    },
    [programId],
  );

  const approveContract = React.useCallback(() => {
    if (!contract) return;
    const s = useSynforma.getState();
    s.setContract({ ...contract, approvedAt: Date.now(), approvedBy: "you" });
    s.addAudit({ actor: "admin", action: "autonomy_contract_approved", target: contract.workflowId, detail: `v${contract.version}`, programId: programId ?? undefined });
  }, [contract, programId]);

  const undo = React.useCallback(async (): Promise<number> => {
    const driver = getDriver();
    if (!driver || !programId) return 0;
    const s = useSynforma.getState();
    const mine = s.ledger.filter((e) => e.programId === programId && e.rollback.possible && !e.rolledBackAt);
    if (!mine.length) return 0;
    setUndoing(true);
    try {
      const { restored } = await rollbackEntries(driver, mine);
      for (const e of restored) s.updateLedger(e.id, { rolledBackAt: e.rolledBackAt });
      s.addAudit({ actor: "admin", action: "ledger_rollback", detail: `${restored.length} of ${mine.length} reversible action(s) undone`, programId });
      return restored.length;
    } finally {
      setUndoing(false);
    }
  }, [getDriver, programId]);

  const start = React.useCallback(async () => {
    const driver = getDriver();
    if (!driver || !program) return;
    setBusy(true);
    try {
      const entry = program.context?.entryUrl ?? program.workflow?.startUrl ?? program.application.baseUrl;
      await driver.goto(entry);
      setTrace([]);
      setReconstruction(null);
      setAnswers({});
      const rec = new DemonstrationRecorder(driver, (e) => setTrace((t) => [...t, e]));
      recorder.current = rec;
      rec.start();
      setDemoStatus("recording");
    } finally {
      setBusy(false);
    }
  }, [getDriver, program]);

  const stop = React.useCallback(() => {
    if (!program) return;
    const captured = recorder.current?.stop() ?? [];
    recorder.current = null;
    const s = useSynforma.getState();
    const rec = reconstructWorkflow(captured, {
      objective: program.parsed,
      states: s.discoveries[program.id] ?? [],
      planned: program.workflow,
      startUrl: program.application.baseUrl,
      planner: program.planner,
      previousVersion: program.workflow?.version,
    });
    setTrace(captured);
    setReconstruction(rec);
    setDemoStatus("reconstructed");
    s.addAudit({ actor: "human", action: "demonstration_recorded", detail: rec.summary, programId: program.id });
  }, [program]);

  const answer = React.useCallback((questionId: string, option: string) => setAnswers((a) => ({ ...a, [questionId]: option })), []);

  const adopt = React.useCallback(() => {
    if (!program || !reconstruction) return;
    const s = useSynforma.getState();
    const note = reconstruction.questions.map((q) => `${q.question} → ${answers[q.id] ?? "(unanswered)"}`).join("\n");
    const alwaysAsk = reconstruction.questions.some((q) => q.kind === "commit_approval" && answers[q.id] === "Never automate");
    const workflow: Workflow = { ...reconstruction.workflow, governance: { status: "reviewed", owner: "you", at: Date.now(), note } };
    if (alwaysAsk) for (const st of workflow.steps) if (st.commit) st.mode = "guide";
    const graph = s.graphs[program.graphId];
    if (graph) s.saveGraph(addWorkflowToGraph(graph, workflow));
    s.upsertProgram({ ...program, workflow, updatedAt: Date.now() });
    s.setContract(defaultContract(workflow));
    s.addAudit({ actor: "admin", action: "workflow_adopted", target: workflow.id, detail: `v${workflow.version} from demonstration`, programId: program.id });
    setDemoStatus("adopted");
  }, [program, reconstruction, answers]);

  const discard = React.useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    setTrace([]);
    setReconstruction(null);
    setAnswers({});
    setDemoStatus("idle");
  }, []);

  React.useEffect(() => () => {
    recorder.current?.stop();
    recorder.current = null;
  }, []);

  // Claims are recomputed by the caller after planning; refresh once when a program with a graph appears and no claims exist.
  React.useEffect(() => {
    if (!program?.workflow) return;
    const s = useSynforma.getState();
    if ((s.claims[program.id] ?? []).length === 0 && s.graphs[program.graphId]) refreshClaims();
  }, [program, refreshClaims]);

  return {
    claims,
    contract,
    ledger,
    refreshClaims,
    applyRegroundings,
    validate,
    ensureContract,
    setContract,
    approveContract,
    undo,
    undoing,
    demonstration: { status: demoStatus, trace, reconstruction, answers, start, stop, answer, adopt, discard, busy },
  };
}
