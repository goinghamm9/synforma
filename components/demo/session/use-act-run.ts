"use client";
import * as React from "react";
import { toast } from "sonner";
import { CLASS_SHORT, DECISION_LABEL } from "@/components/trust";
import { useSynforma } from "@/lib/synforma/store";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import type { ActionClass, ApprovalRequest, Run, RunEvent, TrustDecision } from "@/lib/synforma/types";
import { shortId } from "@/lib/utils";
import type { ChangeRecord, LogLevel, UiVariant } from "../types";
import { readSandboxUiVariant } from "../demo-prefs";
import type { TargetApp } from "@/lib/synforma/targets";
import type { ActState } from "../phases/act-panel";
import type { ConnectionApi } from "./use-connection";
import { INITIAL_ACT, appendLog, errorMessage, mkLine } from "./helpers";

export interface ActRunApi {
  state: ActState;
  /** The commit approval the runner is waiting on, if any. */
  approval: ApprovalRequest | null;
  /** Perform the program's workflow as the agent, under the Autonomy Contract and the current evidence. */
  run: () => Promise<void>;
  /** Abort the run; a pending approval is denied. */
  stop: () => void;
  decideApproval: (decision: "granted" | "denied") => void;
  reset: () => void;
}

interface Options {
  target: TargetApp;
  connection: ConnectionApi;
  programId: string | null;
  /** Fallback work context when the program carries none. */
  context: Record<string, string>;
  /** Trust layer: fold a finished run's re-grounding events into the evidence. */
  applyRegroundings: (events: RunEvent[]) => void;
  setUiVariant: (v: UiVariant) => void;
}

/** The agent's Act run: policy-gated execution with approval, action log, change list and ledger provenance. */
export function useActRun({ connection, programId, context, applyRegroundings, setUiVariant, target }: Options): ActRunApi {
  const { getDriver, driverLogSinkRef, abortRef, hideOverlays, syncUrl } = connection;
  const approvalResolver = React.useRef<((d: "granted" | "denied") => void) | null>(null);
  const approvalRequest = React.useRef<ApprovalRequest | null>(null);
  const changeSeq = React.useRef(0);
  const [act, setAct] = React.useState<ActState>(INITIAL_ACT);
  const [approval, setApproval] = React.useState<ApprovalRequest | null>(null);

  const pushActLog = React.useCallback((level: LogLevel, message: string) => {
    const line = mkLine(level, message);
    setAct((a) => ({ ...a, log: appendLog(a.log, line) }));
  }, []);

  // A pending approval is denied when the page goes away.
  React.useEffect(() => {
    return () => {
      approvalResolver.current?.("denied");
      approvalResolver.current = null;
    };
  }, []);

  const decideApproval = React.useCallback((decision: "granted" | "denied") => {
    const req = approvalRequest.current;
    const resolve = approvalResolver.current;
    approvalRequest.current = null;
    approvalResolver.current = null;
    setApproval(null);
    if (req) useSynforma.getState().decideApproval(req.id, decision);
    resolve?.(decision);
  }, []);

  const run = React.useCallback(async () => {
    const driver = getDriver();
    const s = useSynforma.getState();
    const prog = programId ? s.programs[programId] : null;
    if (!driver || !prog?.workflow || !prog.parsed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { workflow, parsed } = prog;
    const runId = shortId("run");
    const startedAt = Date.now();
    const variant = readSandboxUiVariant(target.uiVersionKey);
    setUiVariant(variant);
    const run: Run = { id: runId, programId: prog.id, workflowId: workflow.id, actor: "agent", mode: "act", startedAt, interventionIds: [], uiVariant: variant, requirementsMet: [], regroundings: 0 };
    s.addRun(run);
    s.addEvent({ runId, type: "run_started", data: { actor: "agent", uiVariant: variant, planner: prog.planner } });
    s.addAudit({ actor: "agent", action: "Run started", runId, programId: prog.id, detail: `Act mode · UI ${variant} · workflow by ${prog.planner} planner` });
    setAct({ ...INITIAL_ACT, status: "running", runId, startedAt, uiVariant: variant });
    driver.paceMs = 350;
    driverLogSinkRef.current = (m) => {
      const heal = /^Re-grounded "(.+?)" → "(.+?)"/.exec(m);
      if (heal) pushActLog("heal", `Self-healed: ${heal[1]} → ${heal[2]}`);
      else if (/could not/i.test(m)) pushActLog("warn", m);
    };
    let regroundings = 0;
    // Trust layer: the workflow's Autonomy Contract and the current evidence gate every step; every action goes to the ledger.
    const contract = s.contracts[workflow.id];
    const claims = s.claims[prog.id] ?? [];
    try {
      const result = await runWorkflow({
        driver,
        workflow,
        requirements: parsed.requirements,
        context: prog.context ?? context,
        actor: "agent",
        policy: { commits: s.settings.requireApprovalForCommit ? "ask" : "auto", scope: "all", trust: { contract, claims } },
        signal: ac.signal,
        ledger: { runId, programId: prog.id, intent: workflow.title, decidedBy: prog.planner },
        hooks: {
          onLedger: (entry) => useSynforma.getState().addLedger(entry),
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
              case "action_regrounded": {
                regroundings += 1;
                const d = data as { from?: string; to?: string; toName?: string | null; change?: { screen?: string | null; affectedStep?: string; risk?: string } } | undefined;
                const from = d?.from ?? "?";
                const to = d?.toName ?? d?.to ?? "?";
                const change: ChangeRecord = { id: ++changeSeq.current, t: Date.now(), stepId, screen: d?.change?.screen ?? step?.route ?? null, from, to, risk: d?.change?.risk ?? "low" };
                setAct((a) => ({ ...a, regroundings, changes: [...a.changes, change] }));
                pushActLog("change", `UI change detected on ${change.screen ?? "unknown screen"}: '${change.from}' is now '${change.to}' · ${change.risk} risk · re-verified by execution`);
                store.addAudit({ actor: "synforma", action: "UI change detected", target: change.screen ?? undefined, runId, programId: prog.id, detail: `'${change.from}' is now '${change.to}' · ${change.risk} risk · ${step?.title ?? stepId ?? "step"} · re-verified by execution` });
                break;
              }
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
              case "run_abandoned": {
                const reason = data?.reason as string | undefined;
                if (reason === "conflicting sources") {
                  const details = Array.isArray(data?.details) ? (data.details as string[]) : [];
                  setAct((a) => ({ ...a, trustStop: { stepId, reason: message ?? details[0] ?? "Sources conflict about what should happen.", details } }));
                  pushActLog("warn", `Stopped before ${step ? `step ${step.index + 1} (${step.title})` : "the step"}: sources conflict — a person must resolve the evidence first`);
                } else pushActLog("warn", "Run abandoned");
                store.addAudit({ actor: "agent", action: reason === "conflicting sources" ? "Run stopped by the trust layer" : "Run abandoned", target: step?.title, runId, programId: prog.id, detail: reason ?? message });
                break;
              }
              case "trust_decision": {
                const d = data as { decision?: TrustDecision; actionClass?: ActionClass; risk?: number } | undefined;
                const decision = d?.decision ? DECISION_LABEL[d.decision].toLowerCase() : "?";
                const cls = d?.actionClass ? CLASS_SHORT[d.actionClass] : "?";
                pushActLog("trust", `Trust: ${decision} (${cls})${typeof d?.risk === "number" ? ` · risk ${d.risk.toFixed(2)}` : ""}`);
                break;
              }
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
      driverLogSinkRef.current = null;
      hideOverlays();
      const endedAt = Date.now();
      const store = useSynforma.getState();
      store.updateRun(runId, { endedAt, outcome: result.outcome, requirementsMet: result.requirementsMet, regroundings: result.regroundings });
      // Live observations from re-groundings supersede the old naming claims in the evidence.
      if (result.regroundings) applyRegroundings(store.events.filter((e) => e.runId === runId));
      setAct((a) => ({ ...a, status: "done", result, endedAt, regroundings: result.regroundings, currentStepId: null }));
      syncUrl();
      const total = parsed.requirements.filter((r) => r.kind === "field").length;
      if (result.outcome === "completed") toast.success(`Run completed — ${result.requirementsMet.length}/${total} requirements verified${result.regroundings ? ` · ${result.regroundings} self-healed` : ""}`);
      else toast.warning(`Run ${result.outcome}${result.error ? `: ${result.error}` : ""}`);
    } catch (e) {
      driverLogSinkRef.current = null;
      hideOverlays();
      const aborted = ac.signal.aborted;
      const endedAt = Date.now();
      const store = useSynforma.getState();
      store.addEvent({ runId, type: aborted ? "run_abandoned" : "run_failed", data: { reason: aborted ? "stopped by operator" : errorMessage(e) } });
      store.updateRun(runId, { endedAt, outcome: aborted ? "abandoned" : "failed" });
      store.addAudit({ actor: "agent", action: aborted ? "Run stopped by operator" : "Run failed", runId, programId: prog.id, detail: aborted ? undefined : errorMessage(e) });
      setAct((a) => ({ ...a, status: aborted ? "stopped" : "error", error: aborted ? null : errorMessage(e), endedAt, currentStepId: null }));
    }
  }, [abortRef, applyRegroundings, context, driverLogSinkRef, getDriver, hideOverlays, programId, pushActLog, setUiVariant, syncUrl, target]);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    if (approvalResolver.current) decideApproval("denied");
  }, [abortRef, decideApproval]);

  const reset = React.useCallback(() => setAct(INITIAL_ACT), []);

  return { state: act, approval, run, stop, decideApproval, reset };
}
