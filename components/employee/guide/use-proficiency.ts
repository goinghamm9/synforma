"use client";
import { useCallback, useState } from "react";
import { LEVEL_LABEL, initialProficiency, stepOutcomesForRun, updateProficiency } from "@/lib/synforma/engine/proficiency";
import { useSynforma } from "@/lib/synforma/store";
import type { AssistanceLevel, Run, Workflow } from "@/lib/synforma/types";
import type { GuideRefs, RecordEvent } from "./shared";
import type { FadedStep } from "./types";

export interface ProficiencyApi {
  /** Steps whose assistance level faded at the end of the last run. */
  fadedSteps: FadedStep[];
  /** startRun: the previous run's fades no longer apply. */
  clearFaded: () => void;
  /** "Teach me anyway" / "Keep handling this": the person sets a step's assistance level. */
  overrideProficiency: (stepId: string, level: AssistanceLevel) => void;
  /** At the end of a run: what each touched step says about the person's proficiency. */
  applyProficiency: (run: Run, outcome: "completed" | "abandoned") => void;
}

/** Per-step proficiency: updated from the run's recorded events, never estimated. */
export function useProficiency({ refs, programId, workflow, record }: { refs: GuideRefs; programId: string; workflow: Workflow; record: RecordEvent }): ProficiencyApi {
  const { runIdRef } = refs;
  const [fadedSteps, setFadedSteps] = useState<FadedStep[]>([]);

  const clearFaded = useCallback(() => setFadedSteps([]), []);

  const overrideProficiency = useCallback(
    (stepId: string, level: AssistanceLevel) => {
      const st = useSynforma.getState();
      const prev = st.proficiency[`${programId}/${stepId}`] ?? initialProficiency(programId, stepId);
      if (prev.assistanceLevel === level) return;
      st.setProficiency({ ...prev, assistanceLevel: level, updatedAt: Date.now() });
      const step = workflow.steps.find((s) => s.id === stepId);
      record("proficiency_updated", { stepId, previousLevel: prev.assistanceLevel, level, override: true }, stepId, `Assistance level set to ${LEVEL_LABEL[level]} on "${step?.title ?? stepId}" by the person`);
      st.addAudit({ actor: "human", action: "proficiency override", target: step?.title ?? stepId, detail: `${LEVEL_LABEL[prev.assistanceLevel]} → ${LEVEL_LABEL[level]}`, runId: runIdRef.current ?? undefined, programId });
    },
    [programId, record, runIdRef, workflow.steps],
  );

  const applyProficiency = useCallback(
    (run: Run, outcome: "completed" | "abandoned") => {
      const st = useSynforma.getState();
      const events = st.events.filter((e) => e.runId === run.id);
      const touched = new Set(events.map((e) => e.stepId).filter((s): s is string => Boolean(s)));
      const faded: FadedStep[] = [];
      for (const o of stepOutcomesForRun(run, events, workflow)) {
        if (!touched.has(o.stepId)) continue; // never entered: nothing to learn
        if (outcome === "abandoned" && !o.completed) continue; // an abandoned run says nothing about the steps it did not finish
        const prev = useSynforma.getState().proficiency[`${programId}/${o.stepId}`] ?? initialProficiency(programId, o.stepId);
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
    [programId, record, workflow],
  );

  return { fadedSteps, clearFaded, overrideProficiency, applyProficiency };
}
