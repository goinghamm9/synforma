import type { Planner } from "../planner/types";
import { EVIDENCE_WEIGHT, TECHNIQUES, TECHNIQUE_BY_ID } from "../science/techniques";
import type {
  BarrierType,
  Hypothesis,
  Intervention,
  InterventionScore,
  InterventionTechnique,
  Program,
  Run,
  RunEvent,
  StruggleSignal,
  WorkflowStep,
} from "../types";
import { shortId } from "@/lib/utils";

/**
 * Autonomous Adoption Engine
 *
 *   Observe → Diagnose → Intervene → Experiment → Learn
 *
 * Struggle signals from human runs are diagnosed into a barrier hypothesis
 * (with alternatives and confidence), a technique is selected from the
 * registry by an explainable score, content is composed by the planner and
 * the intervention is tested against a control cohort. No administrator
 * touches anything.
 */

export interface ScoringContext {
  step: WorkflowStep;
  hypothesis: Pick<Hypothesis, "barrier" | "confidence" | "alternatives">;
  /** Interventions already created for this step (for repetition penalty). */
  existing: Intervention[];
  /** Completed human runs with cohort info, for previous success. */
  runs: Run[];
}

export function scoreTechnique(t: InterventionTechnique, ctx: ScoringContext): InterventionScore {
  const explanation: string[] = [];
  const { hypothesis, step } = ctx;
  let barrierFit = 0;
  if (t.barriers.includes(hypothesis.barrier)) {
    barrierFit = hypothesis.confidence;
    explanation.push(`Addresses the primary hypothesis (${hypothesis.barrier.replace("_", ": ")}) at ${Math.round(hypothesis.confidence * 100)}% confidence`);
  } else {
    const alt = hypothesis.alternatives.find((a) => t.barriers.includes(a.barrier));
    if (alt) {
      barrierFit = alt.confidence * 0.6;
      explanation.push(`Addresses an alternative hypothesis (${alt.barrier.replace("_", ": ")})`);
    } else explanation.push("Does not address the current hypothesis");
  }

  let contextFit = 0.6;
  if (step.judgment && t.mode === "act") {
    contextFit = 0;
    explanation.push("Excluded: the step needs human judgment, so Act is not allowed");
  } else if (step.judgment && t.mode === "assist") {
    contextFit = 0.4;
    explanation.push("Assist can prepare non-judgment fields only");
  } else if (!step.judgment && t.mode !== "guide") {
    contextFit = 0.9;
    explanation.push("No judgment content: automation is appropriate");
  }
  if (t.id === "contextual_pointer" && (step.reveals?.length ?? 0) > 0) {
    contextFit = Math.min(1, contextFit + 0.3);
    explanation.push("Hidden fields on this step make a pointer especially relevant");
  }
  if (t.id === "format_example" && !/date|format|number|email/i.test(step.actions.map((a) => a.targetName).join(" "))) {
    contextFit *= 0.5;
  }
  if (step.commit && t.id === "act_on_behalf") {
    contextFit = Math.min(contextFit, 0.5);
    explanation.push("Commit step: acting requires approval anyway");
  }

  const evidenceWeight = EVIDENCE_WEIGHT[t.evidence];
  explanation.push(`Evidence class: ${t.evidence}`);

  // Previous success for this technique on this step: treatment completion vs control.
  const relevant = ctx.existing.filter((i) => i.techniqueId === t.id);
  let previousSuccess = 0.5;
  if (relevant.length) {
    const ids = new Set(relevant.map((i) => i.id));
    const treated = ctx.runs.filter((r) => r.actor === "human" && r.outcome && r.interventionIds.some((id) => ids.has(id)));
    const control = ctx.runs.filter((r) => r.actor === "human" && r.outcome && r.cohort === "control");
    if (treated.length >= 3 && control.length >= 3) {
      const tr = treated.filter((r) => r.outcome === "completed").length / treated.length;
      const cr = control.filter((r) => r.outcome === "completed").length / control.length;
      previousSuccess = Math.max(0, Math.min(1, 0.5 + (tr - cr)));
      explanation.push(`Observed: ${Math.round(tr * 100)}% completion with it vs ${Math.round(cr * 100)}% without (${treated.length}/${control.length} runs)`);
    } else explanation.push("Not enough runs yet to measure this technique here");
  } else explanation.push("Not tried on this step yet (neutral prior)");

  const repetitionPenalty = Math.min(0.3, relevant.length * 0.15);
  if (repetitionPenalty) explanation.push(`Repetition penalty: used ${relevant.length}× on this step`);
  const burdenPenalty = t.burden * 0.4;

  const total = 0.35 * barrierFit + 0.2 * contextFit + 0.15 * evidenceWeight + 0.3 * previousSuccess - repetitionPenalty - burdenPenalty;
  return { barrierFit, contextFit, evidenceWeight, previousSuccess, repetitionPenalty, burdenPenalty, total: Math.round(total * 1000) / 1000, explanation };
}

export function rankTechniques(ctx: ScoringContext): { technique: InterventionTechnique; score: InterventionScore }[] {
  return TECHNIQUES.map((technique) => ({ technique, score: scoreTechnique(technique, ctx) }))
    .filter((x) => x.score.contextFit > 0)
    .sort((a, b) => b.score.total - a.score.total);
}

/** Deterministic cohort assignment from the run id (so it is reproducible and auditable). */
export function assignCohort(runId: string, treatmentShare: number): "control" | "treatment" {
  let h = 0;
  for (let i = 0; i < runId.length; i++) h = (h * 31 + runId.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 < treatmentShare ? "treatment" : "control";
}

export interface AdoptionDeps {
  planner: Planner;
  program: Program;
  getSignalsForStep: (stepId: string) => StruggleSignal[];
  getInterventionsForStep: (stepId: string) => Intervention[];
  getRuns: () => Run[];
  saveHypothesis: (h: Hypothesis) => void;
  saveIntervention: (i: Intervention) => void;
}

/**
 * React to a new struggle signal: diagnose, select, compose, and return the
 * intervention to show (or null when the signal is not yet actionable).
 */
export async function reactToSignal(signal: StruggleSignal, deps: AdoptionDeps): Promise<Intervention | null> {
  const { program, planner } = deps;
  const workflow = program.workflow;
  const parsed = program.parsed;
  if (!workflow || !parsed) return null;
  const step = workflow.steps.find((s) => s.id === signal.stepId);
  if (!step) return null;
  const signals = deps.getSignalsForStep(step.id);
  const diagnosis = await planner.diagnose({ step, workflow, requirements: parsed.requirements, signals });
  const hypothesis: Hypothesis = { ...diagnosis, id: shortId("hyp"), programId: program.id, createdAt: Date.now() };
  deps.saveHypothesis(hypothesis);

  const existing = deps.getInterventionsForStep(step.id);
  // Re-use an intervention under test for the same barrier rather than piling up variants.
  const reuse = existing.find((i) => i.status !== "retired" && TECHNIQUE_BY_ID[i.techniqueId]?.barriers.includes(hypothesis.barrier));
  if (reuse) return reuse;

  const ranked = rankTechniques({ step, hypothesis, existing, runs: deps.getRuns() });
  const top = ranked[0];
  if (!top) return null;
  const content = await planner.composeAssistance({ step, workflow, requirements: parsed.requirements, hypothesis: diagnosis, technique: top.technique, policyConstraints: parsed.policyConstraints });
  const intervention: Intervention = {
    id: shortId("int"),
    programId: program.id,
    stepId: step.id,
    hypothesisId: hypothesis.id,
    techniqueId: top.technique.id,
    content,
    scoring: top.score,
    status: "testing",
    createdAt: Date.now(),
    experiment: { treatmentShare: 0.5, minRunsPerArm: 3 },
    generatedBy: planner.kind,
  };
  deps.saveIntervention(intervention);
  return intervention;
}

/** Learn: descriptive comparison of completion with vs without each intervention. */
export function evaluateIntervention(i: Intervention, runs: Run[]): { treated: number; treatedCompleted: number; control: number; controlCompleted: number; lift: number | null; sufficient: boolean } {
  const human = runs.filter((r) => r.programId === i.programId && r.actor === "human" && r.outcome);
  const treated = human.filter((r) => r.interventionIds.includes(i.id));
  const control = human.filter((r) => !r.interventionIds.includes(i.id) && r.startedAt >= i.createdAt - 1);
  const tc = treated.filter((r) => r.outcome === "completed").length;
  const cc = control.filter((r) => r.outcome === "completed").length;
  const sufficient = treated.length >= i.experiment.minRunsPerArm && control.length >= i.experiment.minRunsPerArm;
  const lift = sufficient ? tc / treated.length - cc / control.length : null;
  return { treated: treated.length, treatedCompleted: tc, control: control.length, controlCompleted: cc, lift, sufficient };
}

export function barrierFromSignals(signals: StruggleSignal[]): BarrierType | null {
  if (!signals.length) return null;
  const counts = new Map<string, number>();
  for (const s of signals) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  if ((counts.get("validation_error") ?? 0) > 0) return "capability_skill";
  if ((counts.get("wrong_screen") ?? 0) > 0) return "opportunity_visibility";
  if ((counts.get("backtrack") ?? 0) > 0) return "capability_knowledge";
  return "capability_knowledge";
}

export function stepEventsSummary(events: RunEvent[], stepId: string) {
  const mine = events.filter((e) => e.stepId === stepId);
  return {
    errors: mine.filter((e) => e.type === "validation_error").length,
    hesitations: mine.filter((e) => e.type === "hesitation").length,
    backtracks: mine.filter((e) => e.type === "backtrack").length,
  };
}
