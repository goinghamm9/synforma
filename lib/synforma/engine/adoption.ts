import type { Planner } from "../planner/types";
import { DO_NOTHING_ID, EVIDENCE_WEIGHT, TECHNIQUES, TECHNIQUE_BY_ID } from "../science/techniques";
import type {
  AssistancePreference,
  BarrierType,
  FrictionState,
  Hypothesis,
  Intervention,
  InterventionScore,
  InterventionTechnique,
  ProficiencyState,
  Program,
  Run,
  RunEvent,
  StruggleSignal,
  WorkflowStep,
} from "../types";
import { DEFAULT_INTERVENTION_BUDGET, interruptionMultiplier, type AssistanceMode } from "./proficiency";
import { shortId } from "@/lib/utils";

/** Observable friction state → COM-B-inspired barrier used by the technique registry. */
export const FRICTION_TO_BARRIER: Record<FrictionState, BarrierType | null> = {
  FLUENT: null,
  VISUAL_SEARCH: "opportunity_visibility",
  DECISION_UNCERTAINTY: "motivation_uncertainty",
  WORKFLOW_KNOWLEDGE_GAP: "capability_knowledge",
  POLICY_UNCERTAINTY: "motivation_uncertainty",
  ERROR_RECOVERY: "capability_skill",
  WORKFLOW_FRICTION: "opportunity_friction",
  TIME_PRESSURE: "opportunity_friction",
  UNKNOWN: null,
};

/** Techniques that fit each friction state best (ordered). Used as a context-fit boost. */
const FRICTION_PREFERRED: Partial<Record<FrictionState, string[]>> = {
  VISUAL_SEARCH: ["contextual_pointer", "if_then_cue"],
  DECISION_UNCERTAINTY: ["clarify_consequence", "policy_clarification"],
  POLICY_UNCERTAINTY: ["policy_clarification", "clarify_consequence"],
  ERROR_RECOVERY: ["format_example", "prefill_assist"],
  WORKFLOW_KNOWLEDGE_GAP: ["inline_explanation", "if_then_cue", "requirement_checklist"],
  WORKFLOW_FRICTION: ["prefill_assist", "act_on_behalf", "recommend_redesign"],
  TIME_PRESSURE: ["prefill_assist", "act_on_behalf"],
};

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
  hypothesis: Pick<Hypothesis, "barrier" | "confidence" | "alternatives"> & { frictionState?: FrictionState };
  /** Interventions already created for this step (for repetition penalty). */
  existing: Intervention[];
  /** Completed human runs with cohort info, for previous success. */
  runs: Run[];
  /** The person's assistance preference for this run. */
  preference?: AssistancePreference;
  /** "Get It Done" active: instruction costs more, assistance/automation preferred. */
  getItDone?: boolean;
  /** Proficiency on this step (fading). */
  proficiency?: ProficiencyState;
  /** Interventions already shown in this run (frequency cap). */
  shownThisRun?: number;
  /** ms since the last intervention was shown in this run. */
  sinceLastShownMs?: number;
  /** Interventions allowed per run (attention budget). */
  budget?: number;
  /** learning | performance | recovery. */
  mode?: AssistanceMode;
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

  // Friction-state fit: the observable state prefers specific minimal interventions.
  const preferred = ctx.hypothesis.frictionState ? FRICTION_PREFERRED[ctx.hypothesis.frictionState] ?? [] : [];
  const prefIdx = preferred.indexOf(t.id);
  if (prefIdx >= 0) {
    contextFit = Math.min(1, contextFit + (prefIdx === 0 ? 0.35 : 0.15));
    explanation.push(`Minimal intervention for ${ctx.hypothesis.frictionState}`);
  } else if (ctx.hypothesis.frictionState === "DECISION_UNCERTAINTY" && t.id === "contextual_pointer") {
    contextFit *= 0.3;
    explanation.push("The control was already found: a highlight would not help");
  }

  // Person's preference and time pressure.
  const pref = ctx.preference ?? "work_with_me";
  if (pref === "teach_me" && t.mode === "guide") {
    contextFit = Math.min(1, contextFit + 0.15);
    explanation.push("Preference: teach me");
  }
  if (pref === "just_do_it" && t.mode !== "guide") {
    contextFit = Math.min(1, contextFit + 0.2);
    explanation.push("Preference: just do it");
  }
  if (pref === "stay_out" && t.mode === "guide") contextFit *= 0.6;
  if (ctx.getItDone || ctx.mode === "performance") {
    if (t.mode === "guide" && t.id !== "clarify_consequence" && t.id !== "policy_clarification") {
      contextFit *= 0.5;
      explanation.push("Performance mode: instruction deferred");
    } else if (t.mode !== "guide") {
      contextFit = Math.min(1, contextFit + 0.25);
      explanation.push("Performance mode: assistance preferred");
    }
  }
  if (ctx.mode === "recovery" && (t.id === "format_example" || t.id === "prefill_assist" || t.id === "inline_explanation")) {
    contextFit = Math.min(1, contextFit + 0.2);
    explanation.push("Recovery mode after a failure: concrete help preferred");
  }

  const repetitionPenalty = Math.min(0.3, relevant.length * 0.15) + (ctx.shownThisRun && ctx.sinceLastShownMs !== undefined && ctx.sinceLastShownMs < 20_000 ? 0.25 : 0);
  if (relevant.length) explanation.push(`Repetition penalty: used ${relevant.length}× on this step`);
  if (ctx.shownThisRun && ctx.sinceLastShownMs !== undefined && ctx.sinceLastShownMs < 20_000) explanation.push("Frequency cap: help was shown less than 20s ago");
  const interruption = interruptionMultiplier(ctx.proficiency) * (pref === "stay_out" ? 1.5 : pref === "teach_me" ? 0.7 : 1);
  const burdenPenalty = Math.round(t.burden * 0.4 * interruption * 1000) / 1000;
  if (interruption > 1.05) explanation.push(`Interruption cost ×${interruption.toFixed(2)} (proficiency / preference)`);
  const uncertaintyPenalty = (1 - hypothesis.confidence) * 0.25;

  const total = 0.35 * barrierFit + 0.2 * contextFit + 0.15 * evidenceWeight + 0.3 * previousSuccess - repetitionPenalty - burdenPenalty - uncertaintyPenalty;
  return { barrierFit, contextFit, evidenceWeight, previousSuccess, repetitionPenalty, burdenPenalty, total: Math.round(total * 1000) / 1000, explanation };
}

/** Score of the always-present DO_NOTHING candidate. It often wins, by design. */
export function scoreDoNothing(ctx: ScoringContext): InterventionScore {
  const explanation: string[] = [];
  let total = 0.3;
  const st = ctx.hypothesis.frictionState;
  if (st === "FLUENT" || st === "UNKNOWN" || !st) {
    total += 0.45;
    explanation.push(st ? `Observed state is ${st}: no evidence of friction` : "No friction state available");
  }
  const unc = 1 - ctx.hypothesis.confidence;
  total += unc * 0.35;
  explanation.push(`Uncertainty ${Math.round(unc * 100)}% favors staying quiet`);
  const mult = interruptionMultiplier(ctx.proficiency);
  if (mult > 1) {
    total += (mult - 1) * 0.5;
    explanation.push(`Proficiency: ${ctx.proficiency?.unassistedSuccesses ?? 0} unassisted success(es), level ${ctx.proficiency?.assistanceLevel}`);
  }
  if (ctx.preference === "stay_out") {
    total += 0.3;
    explanation.push("Preference: stay out of the way");
  }
  if (ctx.shownThisRun && ctx.sinceLastShownMs !== undefined && ctx.sinceLastShownMs < 20_000) {
    total += 0.25;
    explanation.push("Help was shown less than 20s ago");
  }
  if (ctx.step.commit && st === "DECISION_UNCERTAINTY") {
    total -= 0.15;
    explanation.push("Hesitation before a commit is worth a one-line clarification");
  }
  const budget = ctx.budget ?? DEFAULT_INTERVENTION_BUDGET;
  if ((ctx.shownThisRun ?? 0) >= budget) {
    total += 0.6;
    explanation.push(`Intervention budget spent (${ctx.shownThisRun}/${budget} this run)`);
  }
  return { barrierFit: 0, contextFit: 1, evidenceWeight: EVIDENCE_WEIGHT.theoretical, previousSuccess: 0.5, repetitionPenalty: 0, burdenPenalty: 0, total: Math.round(total * 1000) / 1000, explanation };
}

export function rankTechniques(ctx: ScoringContext): { technique: InterventionTechnique; score: InterventionScore }[] {
  const ranked = TECHNIQUES.filter((t) => t.id !== DO_NOTHING_ID)
    .map((technique) => ({ technique, score: scoreTechnique(technique, ctx) }))
    .filter((x) => x.score.contextFit > 0);
  ranked.push({ technique: TECHNIQUE_BY_ID[DO_NOTHING_ID], score: scoreDoNothing(ctx) });
  return ranked.sort((a, b) => b.score.total - a.score.total);
}

export interface Decision {
  selected: string;
  candidates: { techniqueId: string; total: number }[];
  hypothesis: Hypothesis;
  intervention: Intervention | null;
  reason: string;
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
  /** Run-level context for the decision policy. */
  preference?: AssistancePreference;
  getItDone?: boolean;
  proficiency?: ProficiencyState;
  shownThisRun?: number;
  sinceLastShownMs?: number;
  budget?: number;
  mode?: AssistanceMode;
}

/**
 * React to a new struggle signal: diagnose, select, compose, and return the
 * intervention to show (or null when the signal is not yet actionable).
 */
export async function reactToSignal(signal: StruggleSignal, deps: AdoptionDeps): Promise<Intervention | null> {
  const d = await decide(signal, deps);
  return d?.intervention ?? null;
}

/**
 * Full decision: diagnose → score every candidate including DO_NOTHING → select.
 * Returns the decision record so the UI can show "why nothing appeared" too.
 */
export async function decide(signal: StruggleSignal, deps: AdoptionDeps): Promise<Decision | null> {
  const { program, planner } = deps;
  const workflow = program.workflow;
  const parsed = program.parsed;
  if (!workflow || !parsed) return null;
  const step = workflow.steps.find((s) => s.id === signal.stepId);
  if (!step) return null;
  const signals = deps.getSignalsForStep(step.id);
  const diagnosis = await planner.diagnose({ step, workflow, requirements: parsed.requirements, signals });
  // When the signal came from the friction engine, its observable state and barrier mapping take precedence.
  if (signal.frictionState) {
    const mapped = FRICTION_TO_BARRIER[signal.frictionState];
    if (mapped) {
      diagnosis.barrier = mapped;
      diagnosis.confidence = Math.max(diagnosis.confidence, signal.frictionConfidence ?? diagnosis.confidence);
      if (signal.evidence?.length) diagnosis.evidence = [...signal.evidence, ...diagnosis.evidence].slice(0, 6);
    }
  }
  const hypothesis: Hypothesis = { ...diagnosis, frictionState: signal.frictionState, id: shortId("hyp"), programId: program.id, createdAt: Date.now() };
  deps.saveHypothesis(hypothesis);

  const existing = deps.getInterventionsForStep(step.id);
  const ctx: ScoringContext = {
    step,
    hypothesis,
    existing,
    runs: deps.getRuns(),
    preference: deps.preference,
    getItDone: deps.getItDone,
    proficiency: deps.proficiency,
    shownThisRun: deps.shownThisRun,
    sinceLastShownMs: deps.sinceLastShownMs,
    budget: deps.budget,
    mode: deps.mode,
  };
  const ranked = rankTechniques(ctx);
  const candidates = ranked.map((r) => ({ techniqueId: r.technique.id, total: r.score.total }));
  const top = ranked[0];
  if (!top || top.technique.id === DO_NOTHING_ID) {
    return { selected: DO_NOTHING_ID, candidates, hypothesis, intervention: null, reason: top ? top.score.explanation.join("; ") : "no candidates" };
  }
  // Re-use an intervention under test with the same technique on this step rather than piling up variants.
  const reuse = existing.find((i) => i.status !== "retired" && i.techniqueId === top.technique.id);
  if (reuse) return { selected: reuse.techniqueId, candidates, hypothesis, intervention: reuse, reason: "re-using the intervention under test on this step" };
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
  return { selected: intervention.techniqueId, candidates, hypothesis, intervention, reason: top.score.explanation.join("; ") };
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
