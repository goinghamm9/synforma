"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { useSynforma } from "@/lib/synforma/store";
import type { Action, AssistancePreference, Program, Requirement, Workflow } from "@/lib/synforma/types";
import type { CurrentRun, GuideRefs, RecordEvent } from "./shared";
import type { GetItDoneState } from "./types";
import type { ApprovalsApi } from "./use-approvals";
import type { InterventionsApi } from "./use-interventions";
import type { OverlayApi } from "./use-overlay";

const IDLE_GID: GetItDoneState = { status: "idle", leftForYou: [], handledStepIds: [], stoppedBefore: null, error: null };

/** The commit Synforma prepared and stopped before, waiting for the person's approval. */
interface PreparedCommit {
  commitStepId: string;
  actions: Action[];
  payload: Record<string, string>;
  left: { requirementId: string | null; fieldName: string }[];
  targetName: string;
}

function isGetItDoneShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "S" || e.key === "s" || e.code === "KeyS");
}

export interface GetItDoneApi {
  getItDone: GetItDoneState;
  /** Handle the routine steps from here and stop before the commit. */
  getItDoneNow: () => void;
  /** Re-open the approval for a run that stopped before the commit. */
  reopenApproval: () => void;
  /** After a Get It Done run: what the next run should feel like. */
  chooseNextTime: (preference: "teach_me" | "just_do_it") => void;
  /** Listen for Ctrl/Cmd+Shift+S on the application frame's document (re-attached on every page). */
  attachShortcut: (doc: Document) => void;
  /** startRun: forget the previous run's prepared commit. */
  beginRun: () => void;
  /** finishRun: detach the frame shortcut and drop the prepared commit. */
  endRun: () => void;
}

/**
 * Get It Done: Synforma handles the routine steps, leaves judgment fields to the
 * person, stops before the commit control and commits only after approval.
 */
export function useGetItDone({
  refs,
  program,
  workflow,
  requirements,
  context,
  record,
  currentRun,
  approvals,
  dismissIntervention,
  setCursor,
  setPreferenceState,
}: {
  refs: GuideRefs;
  program: Program;
  workflow: Workflow;
  requirements: Requirement[];
  context: Record<string, string>;
  record: RecordEvent;
  currentRun: CurrentRun;
  approvals: Pick<ApprovalsApi, "requestApproval" | "hasPending">;
  dismissIntervention: InterventionsApi["dismissIntervention"];
  setCursor: OverlayApi["setCursor"];
  setPreferenceState: (preference: AssistancePreference) => void;
}): GetItDoneApi {
  const { driverRef, runIdRef, phaseRef, currentStepRef, interventionRef, assistingRef, observerRef, preferenceRef, getItDoneRef } = refs;
  const { requestApproval, hasPending } = approvals;
  const [getItDone, setGid] = useState<GetItDoneState>(IDLE_GID);
  const gidRef = useRef<PreparedCommit | null>(null);
  const keyDocRef = useRef<Document | null>(null);
  const shortcutRef = useRef<() => void>(() => {});

  const commitNow = useCallback(async () => {
    const driver = driverRef.current;
    const id = runIdRef.current;
    const g = gidRef.current;
    if (!driver || !id || !g || assistingRef.current || phaseRef.current !== "running") return;
    const step = workflow.steps.find((s) => s.id === g.commitStepId);
    if (!step) return;
    assistingRef.current = "get_it_done";
    setGid((prev) => ({ ...prev, status: "committing", error: null }));
    driver.paceMs = 250;
    // Only the actions from the commit control onward: the routine run already did the rest of this step.
    const trimmed: Workflow = { ...workflow, steps: workflow.steps.map((s) => (s.id === step.id ? { ...s, actions: g.actions } : s)) };
    try {
      const result = await runWorkflow({
        driver,
        workflow: trimmed,
        requirements,
        context,
        actor: "human",
        policy: { commits: "auto", scope: "all", steps: [step.id] }, // the person approved a moment ago
        hooks: {
          onEvent: (type, data, sid, message) => {
            if (type === "step_entered" || type === "step_completed" || type === "run_completed") return;
            record(type, { ...(data ?? {}), via: "get_it_done", commit: true }, sid ?? step.id, message);
          },
          requestApproval: async () => "granted",
          onStep: (s, status) => {
            if (status === "completed") record("note", { via: "get_it_done", committed: s.title }, s.id, `Synforma committed "${s.title}" after approval`);
          },
        },
      });
      const run = currentRun();
      if (run && result.regroundings) useSynforma.getState().updateRun(run.id, { regroundings: run.regroundings + result.regroundings });
      if (result.outcome !== "completed") {
        record("note", { via: "get_it_done", commitFailed: result.error ?? result.outcome }, step.id, `Synforma could not commit: ${result.error ?? result.outcome}`);
        toast.error("Synforma could not commit", { description: result.error ?? result.outcome });
        setGid((prev) => ({ ...prev, status: "ready", error: result.error ?? result.outcome }));
      } else {
        useSynforma.getState().addAudit({ actor: "synforma", action: "get it done committed", target: g.targetName, runId: id, programId: program.id });
        gidRef.current = null;
        setGid((prev) => ({ ...prev, status: "idle" }));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      record("note", { via: "get_it_done", commitFailed: message }, step.id, `Synforma could not commit: ${message}`);
      toast.error("Synforma could not commit", { description: message });
      setGid((prev) => ({ ...prev, status: "ready", error: message }));
    } finally {
      assistingRef.current = null;
      driver.paceMs = 300;
      setCursor(null);
      observerRef.current?.touch();
    }
  }, [assistingRef, context, currentRun, driverRef, observerRef, phaseRef, program.id, record, requirements, runIdRef, setCursor, workflow]);

  const openGetItDoneApproval = useCallback(() => {
    const g = gidRef.current;
    const id = runIdRef.current;
    if (!g || !id || phaseRef.current !== "running" || hasPending()) return;
    const leftNames = g.left.map((l) => l.fieldName);
    record("approval_requested", { via: "get_it_done", payload: g.payload, leftForYou: leftNames }, g.commitStepId, `Approval requested: ${g.targetName}`);
    void requestApproval(
      {
        stepId: g.commitStepId,
        title: g.targetName,
        summary: `Synforma prepared the routine fields and stopped before "${g.targetName}". ${leftNames.length ? `Left for you: ${leftNames.join(", ")}.` : "Nothing was left for you."} Approving commits the record in ${program.application.name}.`,
        payload: { ...g.payload },
      },
      {
        leftForYou: leftNames,
        denyLabel: leftNames.length ? "Let me finish first" : "Not yet",
        onDecision: (decision) => {
          if (decision === "granted") {
            record("approval_granted", { via: "get_it_done" }, g.commitStepId, "Approval granted");
            void commitNow();
          } else {
            record("approval_denied", { via: "get_it_done", deferred: true }, g.commitStepId, "Approval deferred: the person will finish first");
          }
        },
      },
    );
  }, [commitNow, hasPending, phaseRef, program.application.name, record, requestApproval, runIdRef]);

  const getItDoneNow = useCallback(async () => {
    const driver = driverRef.current;
    const id = runIdRef.current;
    if (!driver || !id || phaseRef.current !== "running" || assistingRef.current || gidRef.current) return;
    const st = useSynforma.getState();
    const run = currentRun();
    if (!run) return;
    const fromIndex = currentStepRef.current ? currentStepRef.current.index : 0;
    const remaining = workflow.steps.filter((s) => s.index >= fromIndex);
    if (!remaining.length) return;
    const commitStep = remaining.find((s) => s.commit) ?? null;
    getItDoneRef.current = true;
    st.updateRun(id, { getItDone: true });
    record("note", { getItDone: true, fromStepId: remaining[0].id, steps: remaining.map((s) => s.id), preference: preferenceRef.current }, remaining[0].id, `Get It Done: Synforma handles the routine steps from "${remaining[0].title}" and stops before the commit`);
    st.addAudit({ actor: "human", action: "get it done", detail: `${remaining.length} step(s) from "${remaining[0].title}"`, runId: id, programId: program.id });
    if (interventionRef.current) dismissIntervention("resolved");
    assistingRef.current = "get_it_done";
    setGid({ status: "running", leftForYou: [], handledStepIds: [], stoppedBefore: null, error: null });
    driver.paceMs = 250;
    const payload: Record<string, string> = {};
    const left: { requirementId: string | null; fieldName: string }[] = [];
    const handled: string[] = [];
    const stopped: { label: string | null } = { label: null };
    try {
      const result = await runWorkflow({
        driver,
        workflow,
        requirements,
        context,
        actor: "human",
        policy: { commits: "ask", scope: "routine", steps: remaining.map((s) => s.id) },
        hooks: {
          onEvent: (type, data, sid, message) => {
            if (type === "step_entered" || type === "step_completed" || type === "run_completed") return;
            if (type === "note" && data?.skippedJudgment) {
              left.push({ requirementId: typeof data.requirementId === "string" ? data.requirementId : null, fieldName: String(data.skippedJudgment) });
              setGid((prev) => ({ ...prev, leftForYou: [...left] }));
            }
            if (type === "note" && typeof data?.stoppedBeforeCommit === "string") stopped.label = data.stoppedBeforeCommit;
            if (type === "action_executed" && data?.ok) {
              const a = data.action as Action | undefined;
              if (a && (a.kind === "type" || a.kind === "select" || a.kind === "check") && a.targetName) payload[a.targetName] = a.value ?? "";
            }
            record(type, { ...(data ?? {}), via: "get_it_done" }, sid, message);
          },
          onStep: (step, status) => {
            if (status === "entered") record("assist_requested", { via: "get_it_done", mode: step.mode, judgment: step.judgment, commit: step.commit }, step.id, `Synforma is handling "${step.title}"`);
            if (status === "completed") {
              record("assist_completed", { via: "get_it_done", outcome: "completed" }, step.id, step.commit ? `Synforma prepared "${step.title}" and stopped before the commit` : `Synforma handled "${step.title}"`);
              if (!handled.includes(step.id)) handled.push(step.id);
              setGid((prev) => ({ ...prev, handledStepIds: [...handled] }));
            }
            if (status === "failed") record("assist_completed", { via: "get_it_done", outcome: "failed" }, step.id, `Synforma could not finish "${step.title}"`);
          },
          requestApproval: async () => "denied", // never reached: routineOnly stops before the commit
        },
      });
      const fresh = currentRun();
      if (fresh && result.regroundings) useSynforma.getState().updateRun(fresh.id, { regroundings: fresh.regroundings + result.regroundings });
      if (result.outcome !== "completed") {
        record("note", { via: "get_it_done", failed: result.error ?? result.outcome, stepId: result.failedStepId ?? null }, result.failedStepId, `Get It Done stopped: ${result.error ?? result.outcome}`);
        toast.error("Synforma could not finish the routine steps", { description: result.error ?? result.outcome });
        setGid((prev) => ({ ...prev, status: "idle", error: result.error ?? result.outcome }));
        return;
      }
      if (commitStep && stopped.label) {
        const label = stopped.label;
        const idx = commitStep.actions.findIndex((a) => a.label === label);
        const lastClick = commitStep.actions.map((a, i) => (a.kind === "click" ? i : -1)).filter((i) => i >= 0).pop() ?? commitStep.actions.length - 1;
        const actions = commitStep.actions.slice(idx >= 0 ? idx : lastClick);
        const targetName = actions[0]?.targetName ?? commitStep.anchor.elementName ?? commitStep.title;
        gidRef.current = { commitStepId: commitStep.id, actions, payload, left, targetName };
        useSynforma.getState().addAudit({ actor: "synforma", action: "get it done stopped before commit", target: targetName, detail: left.length ? `left for the person: ${left.map((l) => l.fieldName).join(", ")}` : undefined, runId: id, programId: program.id });
        setGid((prev) => ({ ...prev, status: "ready", stoppedBefore: targetName }));
        assistingRef.current = null;
        openGetItDoneApproval();
      } else {
        setGid((prev) => ({ ...prev, status: "idle" }));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      record("note", { via: "get_it_done", failed: message }, currentStepRef.current?.id, `Get It Done failed: ${message}`);
      toast.error("Get It Done failed", { description: message });
      setGid((prev) => ({ ...prev, status: "idle", error: message }));
    } finally {
      assistingRef.current = null;
      driver.paceMs = 300;
      setCursor(null);
      observerRef.current?.touch();
    }
  }, [assistingRef, context, currentRun, currentStepRef, dismissIntervention, driverRef, getItDoneRef, interventionRef, observerRef, openGetItDoneApproval, phaseRef, preferenceRef, program.id, record, requirements, runIdRef, setCursor, workflow]);

  const getItDoneNowSync = useCallback(() => {
    void getItDoneNow();
  }, [getItDoneNow]);

  const reopenApproval = useCallback(() => {
    if (!gidRef.current || phaseRef.current !== "running") return;
    openGetItDoneApproval();
  }, [openGetItDoneApproval, phaseRef]);

  const chooseNextTime = useCallback(
    (next: "teach_me" | "just_do_it") => {
      const st = useSynforma.getState();
      preferenceRef.current = next;
      setPreferenceState(next);
      st.setSettings({ assistancePreference: next });
      record("note", { learnNextTime: next === "teach_me", preference: next }, undefined, next === "teach_me" ? "Next run: teach me (the person wants to learn this)" : "Next run: just do it (Synforma keeps handling the routine)");
      st.addAudit({ actor: "human", action: "next run preference", detail: next.replace(/_/g, " "), runId: runIdRef.current ?? undefined, programId: program.id });
    },
    [preferenceRef, program.id, record, runIdRef, setPreferenceState],
  );

  // ─────────────── Ctrl/Cmd+Shift+S anywhere on the page (the panel or the application frame) ───────────────

  const onFrameKey = useCallback((e: KeyboardEvent) => {
    if (!isGetItDoneShortcut(e)) return;
    e.preventDefault();
    shortcutRef.current();
  }, []);

  const detachShortcut = useCallback(() => {
    const doc = keyDocRef.current;
    if (doc) doc.removeEventListener("keydown", onFrameKey, true);
    keyDocRef.current = null;
  }, [onFrameKey]);

  const attachShortcut = useCallback(
    (doc: Document) => {
      if (doc === keyDocRef.current) return;
      detachShortcut();
      keyDocRef.current = doc;
      doc.addEventListener("keydown", onFrameKey, true);
    },
    [detachShortcut, onFrameKey],
  );

  useEffect(() => {
    shortcutRef.current = () => {
      if (phaseRef.current !== "running") return;
      void getItDoneNow();
    };
  }, [getItDoneNow, phaseRef]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isGetItDoneShortcut(e)) return;
      e.preventDefault();
      shortcutRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => detachShortcut(), [detachShortcut]);

  const beginRun = useCallback(() => {
    gidRef.current = null;
    setGid(IDLE_GID);
  }, []);

  const endRun = useCallback(() => {
    detachShortcut();
    gidRef.current = null;
    setGid((prev) => ({ ...prev, status: "idle", error: null }));
  }, [detachShortcut]);

  return { getItDone, getItDoneNow: getItDoneNowSync, reopenApproval, chooseNextTime, attachShortcut, beginRun, endRun };
}
