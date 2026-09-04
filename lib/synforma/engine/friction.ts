import type { FrictionInference, FrictionState, KeyboardWindow, PointerWindow } from "../types";

/**
 * Friction engine v0 — deterministic, explainable rules over semantic context
 * and interaction feature windows. Produces interaction-state hypotheses with
 * confidence, evidence and alternatives. Never an emotion, trait or score of a
 * person.
 */

export const FRICTION_RULE_VERSION = "friction-v0.1";

export interface FrictionContext {
  stepId: string;
  timeInStepMs: number;
  /** The step has a known target control on this screen. */
  targetKnown: boolean;
  /** The pointer has hovered or come close to the target at any point in this step. */
  targetSeen: boolean;
  targetHoverMs: number;
  targetApproaches: number;
  targetWithdrawals: number;
  pointer: PointerWindow[];
  keyboard: KeyboardWindow[];
  /** Validation errors observed on this step. */
  validationErrors: number;
  /** ms since the last validation error, or null. */
  lastErrorAgoMs: number | null;
  alertsVisible: boolean;
  pendingRequirements: number;
  stepCommit: boolean;
  stepJudgment: boolean;
  policyRelevant: boolean;
  backtracks: number;
  idleMs: number;
  sensing: boolean;
}

export const FRICTION_LABEL: Record<FrictionState, string> = {
  FLUENT: "Fluent: progressing normally",
  VISUAL_SEARCH: "Visual search: the relevant control has not been located",
  DECISION_UNCERTAINTY: "Decision uncertainty: the action was found but not committed",
  WORKFLOW_KNOWLEDGE_GAP: "Knowledge gap: the next process step is not evident",
  POLICY_UNCERTAINTY: "Policy uncertainty: unclear which value or rule applies",
  ERROR_RECOVERY: "Error recovery: correcting a failed action",
  WORKFLOW_FRICTION: "Workflow friction: the process itself imposes effort",
  TIME_PRESSURE: "Time pressure: deadline changes the best assistance",
  UNKNOWN: "Unknown: insufficient evidence",
};

export const FRICTION_SHORT: Record<FrictionState, string> = {
  FLUENT: "Fluent",
  VISUAL_SEARCH: "Visual search",
  DECISION_UNCERTAINTY: "Decision uncertainty",
  WORKFLOW_KNOWLEDGE_GAP: "Knowledge gap",
  POLICY_UNCERTAINTY: "Policy uncertainty",
  ERROR_RECOVERY: "Error recovery",
  WORKFLOW_FRICTION: "Workflow friction",
  TIME_PRESSURE: "Time pressure",
  UNKNOWN: "Unknown",
};

function sum<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((a, x) => a + f(x), 0);
}

export function inferFriction(ctx: FrictionContext, now = Date.now()): FrictionInference {
  const scores: Record<FrictionState, number> = {
    FLUENT: 0,
    VISUAL_SEARCH: 0,
    DECISION_UNCERTAINTY: 0,
    WORKFLOW_KNOWLEDGE_GAP: 0,
    POLICY_UNCERTAINTY: 0,
    ERROR_RECOVERY: 0,
    WORKFLOW_FRICTION: 0,
    TIME_PRESSURE: 0,
    UNKNOWN: 0.15,
  };
  const evidence: Record<FrictionState, string[]> = {
    FLUENT: [],
    VISUAL_SEARCH: [],
    DECISION_UNCERTAINTY: [],
    WORKFLOW_KNOWLEDGE_GAP: [],
    POLICY_UNCERTAINTY: [],
    ERROR_RECOVERY: [],
    WORKFLOW_FRICTION: [],
    TIME_PRESSURE: [],
    UNKNOWN: [],
  };

  const recent = ctx.pointer.slice(-5);
  const keys = ctx.keyboard.slice(-5);
  const moving = sum(recent, (w) => w.distancePx);
  const samples = sum(recent, (w) => w.sampleCount);
  const meanEfficiency = recent.length ? sum(recent, (w) => w.pathEfficiency * w.sampleCount) / Math.max(1, samples) : 1;
  const dirChanges = sum(recent, (w) => w.directionChanges);
  const clicks = sum(recent, (w) => w.clicks);
  const keyCount = sum(keys, (w) => w.keyCount);
  const backspaces = sum(keys, (w) => w.backspaceCount);
  const activelyWorking = clicks > 0 || keyCount > 0;
  const secs = Math.round(ctx.timeInStepMs / 1000);

  // Fluent: recent input/clicks, no errors, early in the step.
  if (activelyWorking && !ctx.alertsVisible) {
    scores.FLUENT += 0.6;
    evidence.FLUENT.push(`${clicks} click(s), ${keyCount} key(s) in the last ${recent.length}s without errors`);
  }
  if (ctx.timeInStepMs < 4000) {
    scores.FLUENT += 0.35;
    evidence.FLUENT.push("step entered less than 4s ago");
  }

  // Error recovery: an alert is visible or an error was very recent and the person is correcting.
  if (ctx.alertsVisible || (ctx.lastErrorAgoMs !== null && ctx.lastErrorAgoMs < 15_000)) {
    scores.ERROR_RECOVERY += 0.6 + (backspaces > 0 ? 0.2 : 0) + (keyCount > 0 ? 0.1 : 0);
    evidence.ERROR_RECOVERY.push(ctx.alertsVisible ? "a validation message is visible" : `validation error ${Math.round((ctx.lastErrorAgoMs ?? 0) / 1000)}s ago`);
    if (backspaces > 0) evidence.ERROR_RECOVERY.push(`${backspaces} correction keystroke(s)`);
    scores.FLUENT *= 0.3;
  }

  // Visual search: known target never seen, inefficient exploration, time passing, no typing.
  if (ctx.sensing && ctx.targetKnown && !ctx.targetSeen && ctx.timeInStepMs > 6000 && keyCount === 0) {
    let s = 0.35;
    const reasons: string[] = ["target control not hovered or approached"];
    if (moving > 300 && meanEfficiency < 0.55) {
      s += 0.25;
      reasons.push(`inefficient pointer path (efficiency ${meanEfficiency.toFixed(2)})`);
    }
    if (dirChanges >= 6) {
      s += 0.15;
      reasons.push(`${dirChanges} direction changes`);
    }
    if (ctx.timeInStepMs > 12_000) {
      s += 0.1;
      reasons.push(`${secs}s on this step`);
    }
    if (ctx.alertsVisible || (ctx.lastErrorAgoMs !== null && ctx.lastErrorAgoMs < 15_000)) s *= 0.3;
    scores.VISUAL_SEARCH += s;
    evidence.VISUAL_SEARCH.push(...reasons);
  }

  // Decision uncertainty: target genuinely hovered (or repeatedly approached), but not committed.
  const located = ctx.targetSeen || ctx.targetApproaches >= 2;
  if (ctx.sensing && ctx.targetKnown && located && clicks === 0 && (ctx.stepCommit || ctx.pendingRequirements > 0)) {
    let s = 0.2;
    const reasons: string[] = ["target control was located"];
    if (ctx.targetHoverMs > 1200) {
      s += 0.3;
      reasons.push(`hovered the target for ${(ctx.targetHoverMs / 1000).toFixed(1)}s without acting`);
    }
    if (ctx.targetApproaches >= 2) {
      s += 0.2;
      reasons.push(`approached the target ${ctx.targetApproaches} times`);
    }
    if (ctx.targetWithdrawals >= 1) {
      s += 0.15;
      reasons.push(`withdrew from the target ${ctx.targetWithdrawals} time(s)`);
    }
    if (ctx.timeInStepMs > 8000 && keyCount === 0) {
      s += 0.1;
      reasons.push(`${secs}s without input`);
    }
    if (ctx.targetHoverMs < 600 && ctx.targetApproaches < 2) s *= 0.4;
    if (ctx.alertsVisible) s *= 0.5;
    scores.DECISION_UNCERTAINTY += s;
    evidence.DECISION_UNCERTAINTY.push(...reasons);
    if (ctx.stepJudgment && ctx.policyRelevant) {
      scores.POLICY_UNCERTAINTY += s * 0.8;
      evidence.POLICY_UNCERTAINTY.push("the step needs a judgment call about values the objective constrains");
    }
  }

  // Knowledge gap: long idle without searching, or backtracking.
  if (ctx.timeInStepMs > 12_000 && !activelyWorking && moving < 200 && ctx.idleMs > 6000 && !ctx.targetSeen) {
    scores.WORKFLOW_KNOWLEDGE_GAP += 0.4;
    evidence.WORKFLOW_KNOWLEDGE_GAP.push(`${secs}s on the step with little pointer movement`);
  }
  if (ctx.backtracks > 0) {
    scores.WORKFLOW_KNOWLEDGE_GAP += 0.3;
    evidence.WORKFLOW_KNOWLEDGE_GAP.push(`${ctx.backtracks} backtrack(s) to an earlier step`);
  }

  // Workflow friction: repeated errors on the same step.
  if (ctx.validationErrors >= 2) {
    scores.WORKFLOW_FRICTION += 0.45;
    evidence.WORKFLOW_FRICTION.push(`${ctx.validationErrors} validation errors on this step`);
  }

  // Sensing disabled: only DOM/time evidence is available — lower confidence overall.
  if (!ctx.sensing) {
    scores.UNKNOWN += 0.2;
    evidence.UNKNOWN.push("interaction sensing is off; only navigation and validation signals available");
  }

  const ranked = (Object.entries(scores) as [FrictionState, number][]).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, v]) => a + v, 0) || 1;
  const [state, top] = ranked[0];
  const confidence = Math.max(0.05, Math.min(0.95, top / total + (top > 0.8 ? 0.15 : 0)));
  return {
    state: top < 0.3 ? "UNKNOWN" : state,
    confidence: top < 0.3 ? Math.min(confidence, 0.35) : confidence,
    evidence: (top < 0.3 ? evidence.UNKNOWN.concat(["no rule reached its threshold"]) : evidence[state]).slice(0, 6),
    alternatives: ranked
      .slice(1, 4)
      .filter(([, v]) => v > 0.1)
      .map(([s, v]) => ({ state: s, confidence: Math.round((v / total) * 100) / 100 })),
    ruleVersion: FRICTION_RULE_VERSION,
    stepId: ctx.stepId,
    t: now,
  };
}
