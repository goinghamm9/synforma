import type { CohortMetrics, Program, ProgramMetrics, Run, RunActor, RunEvent, StepMetrics } from "../types";

/**
 * Metrics are computed from stored runs and events only. Nothing here is
 * estimated or invented; when the sample is too small the UI shows
 * "Still learning".
 */

export const MINIMUM_RUNS = 5;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function cohort(runs: Run[]): CohortMetrics {
  const finished = runs.filter((r) => r.outcome);
  const completed = finished.filter((r) => r.outcome === "completed");
  return {
    runs: finished.length,
    completed: completed.length,
    rate: finished.length ? completed.length / finished.length : null,
    medianDurationMs: median(completed.filter((r) => r.endedAt).map((r) => r.endedAt! - r.startedAt)),
  };
}

/**
 * A run counts toward the Intent-to-Outcome Rate only if it completed AND every requirement was verified.
 * The rate is computed over runs by people (human + synthetic, the latter labeled as simulation);
 * agent runs are reported separately so automation never inflates the human number.
 */
export function isIntentToOutcomeSuccess(run: Run, requirementCount: number): boolean {
  return run.outcome === "completed" && requirementCount > 0 && run.requirementsMet.length >= requirementCount;
}

export function computeProgramMetrics(program: Program, runs: Run[], events: RunEvent[]): ProgramMetrics {
  const mine = runs.filter((r) => r.programId === program.id);
  const finished = mine.filter((r) => r.outcome);
  const byActor: Record<RunActor, number> = { agent: 0, human: 0, synthetic: 0 };
  for (const r of mine) byActor[r.actor] += 1;
  const requirementCount = program.parsed?.requirements.filter((r) => r.kind === "field").length ?? 0;
  const completed = finished.filter((r) => r.outcome === "completed");
  const humanOrSynthetic = mine.filter((r) => r.actor !== "agent");
  const peopleFinished = humanOrSynthetic.filter((r) => r.outcome);
  const successes = peopleFinished.filter((r) => isIntentToOutcomeSuccess(r, requirementCount));
  const steps: StepMetrics[] = (program.workflow?.steps ?? []).map((step) => {
    const stepEvents = events.filter((e) => e.stepId === step.id && humanOrSynthetic.some((r) => r.id === e.runId));
    const entered = new Set(stepEvents.filter((e) => e.type === "step_entered").map((e) => e.runId)).size;
    const completedRuns = new Set(stepEvents.filter((e) => e.type === "step_completed").map((e) => e.runId));
    const durations: number[] = [];
    for (const runId of completedRuns) {
      const inRun = stepEvents.filter((e) => e.runId === runId);
      const entry = inRun.find((e) => e.type === "step_entered");
      const done = [...inRun].reverse().find((e) => e.type === "step_completed");
      const run = mine.find((r) => r.id === runId);
      if (entry && done && run?.actor === "human") durations.push(done.t - entry.t);
    }
    const errors = stepEvents.filter((e) => e.type === "validation_error").length;
    const hesitations = stepEvents.filter((e) => e.type === "hesitation").length;
    const backtracks = stepEvents.filter((e) => e.type === "backtrack").length;
    const assistanceShown = stepEvents.filter((e) => e.type === "assistance_shown").length;
    const assistRequested = stepEvents.filter((e) => e.type === "assist_requested").length;
    const abandons = stepEvents.filter((e) => e.type === "run_abandoned" || e.type === "run_failed").length;
    const friction = entered >= 3 ? Math.min(1, (errors * 0.25 + hesitations * 0.2 + backtracks * 0.2 + abandons * 0.4) / entered) : null;
    return { stepId: step.id, title: step.title, entered, completed: completedRuns.size, medianDurationMs: median(durations), errors, hesitations, backtracks, assistanceShown, assistRequested, friction };
  });
  const human = mine.filter((r) => r.actor === "human");
  const regroundings = mine.reduce((acc, r) => acc + (r.regroundings ?? 0), 0);
  return {
    runs: mine.length,
    byActor,
    completed: completed.length,
    intentToOutcomeRate: peopleFinished.length >= MINIMUM_RUNS ? successes.length / peopleFinished.length : null,
    medianDurationMs: median(completed.filter((r) => r.endedAt && r.actor === "human").map((r) => r.endedAt! - r.startedAt)),
    steps,
    control: cohort(human.filter((r) => r.cohort === "control" || r.interventionIds.length === 0)),
    treatment: cohort(human.filter((r) => r.interventionIds.length > 0)),
    agent: cohort(mine.filter((r) => r.actor === "agent")),
    human: cohort(human),
    synthetic: cohort(mine.filter((r) => r.actor === "synthetic")),
    regroundings,
    sufficient: peopleFinished.length >= MINIMUM_RUNS,
    minimumRuns: MINIMUM_RUNS,
  };
}

export function completionByVariant(runs: Run[]): { variant: string; runs: number; completed: number; regroundings: number }[] {
  const map = new Map<string, { runs: number; completed: number; regroundings: number }>();
  for (const r of runs) {
    const key = r.uiVariant ?? "unknown";
    const cur = map.get(key) ?? { runs: 0, completed: 0, regroundings: 0 };
    cur.runs += 1;
    if (r.outcome === "completed") cur.completed += 1;
    cur.regroundings += r.regroundings ?? 0;
    map.set(key, cur);
  }
  return Array.from(map.entries()).map(([variant, v]) => ({ variant, ...v }));
}
