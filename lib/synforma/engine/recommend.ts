import type { FrictionState, Hypothesis, Intervention, Program, ProgramMetrics, Run, RunEvent, StepMetrics } from "../types";
import { evaluateIntervention } from "./adoption";
import { FRICTION_SHORT } from "./friction";

/**
 * System-vs-human diagnosis for administrators.
 *
 * Every recommendation is one of a fixed set of classes. The platform should
 * often say that training is not the answer. All evidence is aggregate and
 * derived from stored runs; no individual telemetry is exposed.
 */

export type RecommendationClass =
  | "LEARNING_NEED"
  | "ASSISTANCE_NEED"
  | "AUTOMATION_OPPORTUNITY"
  | "POLICY_PROBLEM"
  | "UI_UX_PROBLEM"
  | "INTEGRATION_PROBLEM"
  | "PROCESS_DESIGN_PROBLEM"
  | "INSUFFICIENT_EVIDENCE";

export const RECOMMENDATION_LABEL: Record<RecommendationClass, string> = {
  LEARNING_NEED: "Learning need",
  ASSISTANCE_NEED: "Assistance need",
  AUTOMATION_OPPORTUNITY: "Automation opportunity",
  POLICY_PROBLEM: "Policy problem",
  UI_UX_PROBLEM: "Interface problem",
  INTEGRATION_PROBLEM: "Integration problem",
  PROCESS_DESIGN_PROBLEM: "Process design problem",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

export interface Recommendation {
  class: RecommendationClass;
  headline: string;
  rationale: string;
  evidence: string[];
  unlikelyToHelp: string[];
  confidence: number;
  stepId?: string;
  stepTitle?: string;
  frictionDistribution: { state: FrictionState; count: number }[];
}

export const MIN_RUNS_FOR_RECOMMENDATION = 3;

export function recommend(program: Program, metrics: ProgramMetrics, runs: Run[], events: RunEvent[], hypotheses: Hypothesis[], interventions: Intervention[]): Recommendation {
  const humanish = runs.filter((r) => r.programId === program.id && r.actor !== "agent" && r.outcome);
  const frictionEvents = events.filter((e) => e.type === "friction_inferred" && humanish.some((r) => r.id === e.runId));
  const dist = new Map<FrictionState, number>();
  for (const e of frictionEvents) {
    const st = (e.data?.state as FrictionState | undefined) ?? "UNKNOWN";
    if (st === "FLUENT" || st === "UNKNOWN") continue;
    dist.set(st, (dist.get(st) ?? 0) + 1);
  }
  const frictionDistribution = Array.from(dist.entries()).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);

  if (humanish.length < MIN_RUNS_FOR_RECOMMENDATION) {
    return {
      class: "INSUFFICIENT_EVIDENCE",
      headline: "Still learning",
      rationale: `${humanish.length} of ${MIN_RUNS_FOR_RECOMMENDATION} human or synthetic runs observed. Synforma does not recommend on thin evidence.`,
      evidence: [`${humanish.length} finished run(s) so far`],
      unlikelyToHelp: [],
      confidence: 0.2,
      frictionDistribution,
    };
  }

  // Highest-friction step.
  const steps: StepMetrics[] = metrics.steps.filter((s) => s.entered >= 2);
  const worst = [...steps].sort((a, b) => (b.friction ?? 0) - (a.friction ?? 0))[0];
  const worstStep = worst ? program.workflow?.steps.find((s) => s.id === worst.stepId) : undefined;
  const stepFriction = worst ? frictionEvents.filter((e) => e.stepId === worst.stepId) : [];
  const stepDist = new Map<FrictionState, number>();
  for (const e of stepFriction) {
    const st = (e.data?.state as FrictionState | undefined) ?? "UNKNOWN";
    if (st === "FLUENT" || st === "UNKNOWN") continue;
    stepDist.set(st, (stepDist.get(st) ?? 0) + 1);
  }
  const dominant = Array.from(stepDist.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (worst && worst.errors > worst.hesitations ? "ERROR_RECOVERY" : worst && worst.hesitations > 0 ? "WORKFLOW_KNOWLEDGE_GAP" : undefined);
  const stepHyps = hypotheses.filter((h) => h.stepId === worst?.stepId);
  const evidence: string[] = [];
  if (worst) {
    evidence.push(`Step "${worst.title}": ${worst.entered} entries, ${worst.completed} completions, ${worst.errors} validation errors, ${worst.hesitations} hesitations, ${worst.backtracks} backtracks`);
    if (dominant) evidence.push(`Dominant observed state on this step: ${FRICTION_SHORT[dominant]} (${stepDist.get(dominant) ?? 0} inference(s))`);
  }
  const effective = interventions
    .filter((i) => i.programId === program.id)
    .map((i) => ({ i, e: evaluateIntervention(i, runs) }))
    .filter((x) => x.e.sufficient && (x.e.lift ?? 0) > 0);
  if (effective.length) evidence.push(`${effective.length} intervention(s) show positive completion lift with sufficient runs`);

  const total = frictionDistribution.reduce((a, b) => a + b.count, 0) || 1;
  const share = dominant ? (stepDist.get(dominant) ?? 0) / Math.max(1, stepFriction.length || total) : 0;
  const confidence = Math.min(0.85, 0.35 + Math.min(0.3, humanish.length * 0.05) + share * 0.3);

  const build = (cls: RecommendationClass, headline: string, rationale: string, unlikely: string[]): Recommendation => ({
    class: cls,
    headline,
    rationale,
    evidence,
    unlikelyToHelp: unlikely,
    confidence,
    stepId: worst?.stepId,
    stepTitle: worst?.title,
    frictionDistribution,
  });

  if (!worst || !dominant) {
    return build("INSUFFICIENT_EVIDENCE", "No dominant friction pattern yet", "Runs complete without a concentrated friction point. Keep observing before intervening.", []);
  }
  switch (dominant) {
    case "DECISION_UNCERTAINTY":
      return build(
        worstStep?.commit ? "ASSISTANCE_NEED" : "POLICY_PROBLEM",
        `The largest friction point is uncertainty about ${worstStep?.commit ? "the final action" : `"${worst.title}"`}, not navigation`,
        worstStep?.commit
          ? "People find the action and pause before committing. A one-line clarification of what the action does resolves this more cheaply than any walkthrough."
          : "People locate the fields but hesitate over which value is correct. Clarify the rule at the decision point; consider simplifying the policy wording.",
        ["Additional navigation training", "Highlighting the control (it is already found)"],
      );
    case "POLICY_UNCERTAINTY":
      return build("POLICY_PROBLEM", `Policy ambiguity at "${worst.title}"`, "Hesitation concentrates on a judgment field constrained by the objective. Publish the exact rule and surface it in context; do not train harder.", ["More training on the interface", "Automating the judgment away"]);
    case "VISUAL_SEARCH":
      return build(
        worstStep?.reveals?.length ? "UI_UX_PROBLEM" : "ASSISTANCE_NEED",
        `People cannot find what "${worst.title}" needs`,
        worstStep?.reveals?.length
          ? `Required fields sit behind "${worstStep.reveals[0]}". The interface hides them; a subtle cue helps now, and the vendor should surface them.`
          : "The relevant control is not being located. A subtle contextual cue is the minimum useful intervention.",
        ["Explaining what the fields mean (they know; they cannot find them)"],
      );
    case "ERROR_RECOVERY":
      return build("UI_UX_PROBLEM", `Validation errors dominate "${worst.title}"`, "Errors recur on the same input. Show the expected format inline and consider changing the control (e.g., a date picker) rather than training people to remember formats.", ["Repeated reminders about formats"]);
    case "WORKFLOW_FRICTION":
      return build("AUTOMATION_OPPORTUNITY", `"${worst.title}" imposes avoidable effort`, "Repeated errors and corrections on derivable inputs. Prefill or automate the routine part and keep the judgment part human.", ["Training on the current process"]);
    case "WORKFLOW_KNOWLEDGE_GAP":
      return build("LEARNING_NEED", `People do not know what comes next at "${worst.title}"`, "Long pauses without searching and backtracking suggest the process step itself is not evident. One next-step cue inside real work, fading with mastery.", ["A full walkthrough"]);
    default:
      return build("INSUFFICIENT_EVIDENCE", "Mixed signals", "No single explanation dominates. Keep observing.", []);
  }
}
