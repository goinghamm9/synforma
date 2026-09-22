"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { RemoteDecider } from "@/lib/synforma/decisions";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { useSynforma } from "@/lib/synforma/store";
import type { Requirement, Workflow } from "@/lib/synforma/types";
import type { CurrentRun, GuideRefs, RecordEvent } from "./shared";
import type { ApprovalsApi } from "./use-approvals";
import type { InterventionsApi } from "./use-interventions";
import type { OverlayApi } from "./use-overlay";

export interface AssistApi {
  assistingStepId: string | null;
  /** Synforma performs one step for the person (commits still ask for approval). */
  assistStep: (stepId: string) => Promise<void>;
}

/** Single-step assist: `runWorkflow` scoped to one step, recorded as an assist on the person's run. */
export function useAssist({
  refs,
  programId,
  workflow,
  requirements,
  context,
  record,
  currentRun,
  requestApproval,
  dismissIntervention,
  setCursor,
  decider,
}: {
  refs: GuideRefs;
  programId: string;
  workflow: Workflow;
  requirements: Requirement[];
  context: Record<string, string>;
  record: RecordEvent;
  currentRun: CurrentRun;
  requestApproval: ApprovalsApi["requestApproval"];
  dismissIntervention: InterventionsApi["dismissIntervention"];
  setCursor: OverlayApi["setCursor"];
  /** Decision model for the assist run; null → lexical rules only. */
  decider: RemoteDecider | null;
}): AssistApi {
  const { driverRef, runIdRef, phaseRef, interventionRef, assistingRef, observerRef } = refs;
  const [assistingStepId, setAssistingStepId] = useState<string | null>(null);

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
      st.addAudit({ actor: "human", action: "assist requested", target: step.title, runId: id, programId });
      driver.paceMs = 300;
      try {
        const result = await runWorkflow({
          driver,
          workflow,
          requirements,
          context,
          actor: "human",
          policy: { commits: st.settings.requireApprovalForCommit ? "ask" : "auto", scope: "all", steps: [stepId] },
          decider: decider ?? undefined,
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
        useSynforma.getState().addAudit({ actor: "synforma", action: "assist completed", target: step.title, detail: `${result.outcome}${result.regroundings ? ` · ${result.regroundings} re-grounding${result.regroundings === 1 ? "" : "s"}` : ""}`, runId: id, programId });
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
    [assistingRef, context, currentRun, decider, dismissIntervention, driverRef, interventionRef, observerRef, phaseRef, programId, record, requestApproval, requirements, runIdRef, setCursor, workflow],
  );

  return { assistingStepId, assistStep };
}
