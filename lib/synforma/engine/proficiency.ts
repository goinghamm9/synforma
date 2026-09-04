import type { AssistanceLevel, ProficiencyState, Run, RunEvent, SkillStatus, Workflow } from "../types";

/**
 * Proficiency and guidance fading.
 *
 * Track assisted vs unassisted runs per step. After repeated unassisted
 * success with a low recent error rate, reduce assistance one level:
 *   do_with_me → guide → explain → observe
 * The person can override in either direction ("Teach me anyway",
 * "Keep handling this"). Learning-science basis: worked examples and guidance
 * fading (see citations sweller1988 / registry notes) — treated as a product
 * hypothesis in this context.
 */

export const LEVEL_ORDER: AssistanceLevel[] = ["do_with_me", "guide", "explain", "observe"];

export function levelIndex(level: AssistanceLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

export function initialProficiency(programId: string, stepId: string): ProficiencyState {
  return { programId, stepId, assistedRuns: 0, unassistedSuccesses: 0, recentErrors: 0, errorHistory: [], assistanceLevel: "guide", updatedAt: Date.now() };
}

export interface RunStepOutcome {
  stepId: string;
  completed: boolean;
  assisted: boolean;
  errors: number;
}

/** Derive per-step outcomes for a finished run from its events. */
export function stepOutcomesForRun(run: Run, events: RunEvent[], workflow: Workflow): RunStepOutcome[] {
  const mine = events.filter((e) => e.runId === run.id);
  return workflow.steps.map((step) => {
    const es = mine.filter((e) => e.stepId === step.id);
    const completed = es.some((e) => e.type === "step_completed");
    const assisted = es.some((e) => e.type === "assistance_shown" || e.type === "assist_requested" || e.type === "assist_completed");
    const errors = es.filter((e) => e.type === "validation_error").length;
    return { stepId: step.id, completed, assisted, errors };
  });
}

/** Apply one run's outcomes to the proficiency state. Pure. */
export function updateProficiency(prev: ProficiencyState, outcome: RunStepOutcome, workflowVersion?: string): { next: ProficiencyState; faded: boolean } {
  const errorHistory = [...prev.errorHistory, outcome.errors > 0].slice(-5);
  const exposures = (prev.exposures ?? 0) + 1;
  const recentErrors = errorHistory.filter(Boolean).length;
  let assistedRuns = prev.assistedRuns;
  let unassistedSuccesses = prev.unassistedSuccesses;
  if (outcome.completed) {
    if (outcome.assisted) assistedRuns += 1;
    else unassistedSuccesses += 1;
  }
  let assistanceLevel = prev.assistanceLevel;
  let faded = false;
  const errorRate = errorHistory.length ? recentErrors / errorHistory.length : 0;
  // Fade: three unassisted successes since the last fade, low error rate.
  if (!outcome.assisted && outcome.completed && unassistedSuccesses >= 3 && errorRate < 0.34) {
    const idx = levelIndex(assistanceLevel);
    if (idx < LEVEL_ORDER.length - 1) {
      assistanceLevel = LEVEL_ORDER[idx + 1];
      faded = true;
      unassistedSuccesses = 0;
    }
  }
  // Regress one level after two error runs in the last five.
  if (recentErrors >= 2 && levelIndex(assistanceLevel) > levelIndex("guide")) assistanceLevel = "guide";
  return {
    next: {
      ...prev,
      assistedRuns,
      unassistedSuccesses,
      recentErrors,
      errorHistory,
      assistanceLevel,
      exposures,
      lastExecutedAt: Date.now(),
      workflowVersion: faded ? (workflowVersion ?? prev.workflowVersion) : (prev.workflowVersion ?? workflowVersion),
      updatedAt: Date.now(),
    },
    faded,
  };
}

/**
 * Skill status. One successful attempt is never mastery; mastery decays with
 * time and is invalidated when the workflow changed since it was reached.
 */
export function skillStatus(p: ProficiencyState | undefined, currentWorkflowVersion: string | undefined, now = Date.now()): { status: SkillStatus; reason: string } {
  if (!p || (p.exposures ?? 0) === 0) return { status: "unknown", reason: "not attempted yet" };
  const mastered = levelIndex(p.assistanceLevel) >= levelIndex("explain");
  if (mastered) {
    if (currentWorkflowVersion && p.workflowVersion && currentWorkflowVersion !== p.workflowVersion) {
      return { status: "stale", reason: `mastered on workflow v${p.workflowVersion}; the workflow is now v${currentWorkflowVersion} — a brief refresher on what changed is likely useful` };
    }
    const days = p.lastExecutedAt ? (now - p.lastExecutedAt) / 86_400_000 : 0;
    if (days > 45) return { status: "stale", reason: `last executed ${Math.round(days)} days ago` };
    return { status: "mastered", reason: `${p.unassistedSuccesses + p.assistedRuns} run(s), level ${p.assistanceLevel}` };
  }
  return { status: "learning", reason: `${p.unassistedSuccesses} unassisted success(es) toward fading` };
}

export const SKILL_LABEL: Record<SkillStatus, string> = { unknown: "Unknown", learning: "Learning", mastered: "Mastered", stale: "Refresher suggested" };

/** Attention is scarce: a per-run budget of interventions. */
export const DEFAULT_INTERVENTION_BUDGET = 3;

export type AssistanceMode = "learning" | "performance" | "recovery";

/** Contextual mode without inferring mental state: explicit time pressure, or a recent failure. */
export function deriveMode(input: { getItDone: boolean; recentFailure: boolean; deadlineSoon?: boolean }): AssistanceMode {
  if (input.recentFailure) return "recovery";
  if (input.getItDone || input.deadlineSoon) return "performance";
  return "learning";
}

/** Teach-after recap computed from events; never invented. */
export function composeRecap(events: RunEvent[], workflow: Workflow, runId: string): { handled: string[]; decided: string[]; approvals: number; skipped: string[]; text: string } {
  const mine = events.filter((e) => e.runId === runId);
  const handled = Array.from(new Set(mine.filter((e) => e.type === "action_executed" && e.data?.ok !== false).map((e) => e.message ?? "").filter((m) => m && !/^Undo/.test(m))));
  const skipped = mine.filter((e) => e.type === "note" && e.data?.skippedJudgment).map((e) => String(e.data?.skippedJudgment));
  const approvals = mine.filter((e) => e.type === "approval_granted").length;
  const decided = skipped.length ? skipped : workflow.steps.filter((s) => s.judgment).map((s) => s.title);
  const text = `Synforma handled ${handled.length} routine action${handled.length === 1 ? "" : "s"}. You made ${decided.length} decision${decided.length === 1 ? "" : "s"} requiring judgment${approvals ? ` and ${approvals} approval${approvals === 1 ? "" : "s"}` : ""}.`;
  return { handled, decided, approvals, skipped, text };
}

/** Interruption multiplier from proficiency: more independent → interventions cost more. */
export function interruptionMultiplier(p: ProficiencyState | undefined): number {
  if (!p) return 1;
  const base = { do_with_me: 0.8, guide: 1, explain: 1.25, observe: 1.6 }[p.assistanceLevel];
  return base + Math.min(0.4, p.unassistedSuccesses * 0.15);
}

export const LEVEL_LABEL: Record<AssistanceLevel, string> = {
  do_with_me: "Do with me",
  guide: "Guide",
  explain: "Explain only",
  observe: "Observe",
};
