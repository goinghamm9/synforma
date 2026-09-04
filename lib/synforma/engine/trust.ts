import type { Action, ActionClass, AutonomyContract, AutonomyPolicy, AutonomyRule, Claim, TrustDecision, Workflow, WorkflowStep } from "../types";

/**
 * Trust + Autonomy engine.
 *
 * "I think I'm right, therefore I'll act" is not a policy. Every candidate
 * action is classified by reversibility and consequence, checked against the
 * workflow's Autonomy Contract, and scored on model confidence, source
 * confidence, reversibility, consequence, external visibility, the person's
 * history and whether sources conflict. Conflicting sources stop autonomy.
 *
 * Principle: autonomy grows with reversibility × confidence ÷ consequence.
 */

export const ACTION_CLASS_LABEL: Record<ActionClass, string> = {
  A_read: "Read / navigate",
  B_reversible_write: "Reversible write (draft fields, disclosures)",
  C_consequential_write: "Consequential write (create / submit a record)",
  D_external_or_destructive: "External or destructive (send, delete, pay, approve)",
};

const DESTRUCTIVE_RE = /^(delete|remove|send|pay|approve|publish|transfer|terminate|archive|wipe|reset)\b/i;

export function classifyAction(action: Action, step: WorkflowStep): ActionClass {
  if (action.kind === "navigate" || action.kind === "wait") return "A_read";
  if (action.kind === "type" || action.kind === "select" || action.kind === "check" || action.kind === "expand") return "B_reversible_write";
  // clicks
  const name = action.targetName ?? action.label;
  if (DESTRUCTIVE_RE.test(name)) return "D_external_or_destructive";
  if (step.commit && action.targetCommit) return "C_consequential_write";
  if (action.targetCommit) return "C_consequential_write";
  return action.targetRole === "menuitem" || action.targetRole === "link" || action.targetRole === "tab" || action.targetRole === "button" ? "A_read" : "B_reversible_write";
}

/** Reversibility 0..1 and consequence 0..1 by class. */
export const CLASS_PROFILE: Record<ActionClass, { reversibility: number; consequence: number; externalVisibility: number }> = {
  A_read: { reversibility: 1, consequence: 0.02, externalVisibility: 0 },
  B_reversible_write: { reversibility: 0.95, consequence: 0.1, externalVisibility: 0 },
  C_consequential_write: { reversibility: 0.4, consequence: 0.55, externalVisibility: 0.2 },
  D_external_or_destructive: { reversibility: 0.05, consequence: 0.9, externalVisibility: 0.9 },
};

/** The default contract for a discovered workflow: reversible work is automatic; commits ask; destructive never runs alone. */
export function defaultContract(workflow: Workflow): AutonomyContract {
  const rules: AutonomyRule[] = [
    { actionClass: "A_read", label: ACTION_CLASS_LABEL.A_read, human: true, synforma: "auto", rationale: "Reading and navigating changes nothing." },
    { actionClass: "B_reversible_write", label: ACTION_CLASS_LABEL.B_reversible_write, human: true, synforma: "auto", rationale: "Draft inputs are reversible until a commit; every fill is recorded in the ledger with its previous value." },
    { actionClass: "C_consequential_write", label: ACTION_CLASS_LABEL.C_consequential_write, human: true, synforma: "ask", rationale: "Creating or submitting a record is consequential: preview and approval every time." },
    { actionClass: "D_external_or_destructive", label: ACTION_CLASS_LABEL.D_external_or_destructive, human: true, synforma: "never", rationale: "Sending, deleting, paying or approving is never automated in this workflow." },
  ];
  return { workflowId: workflow.id, version: 1, rules, generatedAt: Date.now() };
}

export function policyFor(contract: AutonomyContract | undefined, cls: ActionClass): AutonomyPolicy {
  return contract?.rules.find((r) => r.actionClass === cls)?.synforma ?? (cls === "A_read" || cls === "B_reversible_write" ? "auto" : cls === "C_consequential_write" ? "ask" : "never");
}

export interface TrustInput {
  modelConfidence: number;
  sourceConfidence: number;
  reversibility: number;
  consequence: number;
  externalVisibility: number;
  conflictingSources: boolean;
  /** 0..1 — how often this person completed this step unassisted. */
  userHistory?: number;
  exceptionProbability?: number;
  policy: AutonomyPolicy;
  judgment: boolean;
}

export interface TrustResult {
  decision: TrustDecision;
  risk: number;
  reasons: string[];
}

/** LOW risk + HIGH confidence → act · MEDIUM risk → prepare + ask · HIGH risk → guide · LOW confidence → ask · CONFLICT → stop. */
export function decideTrust(i: TrustInput): TrustResult {
  const reasons: string[] = [];
  if (i.conflictingSources) return { decision: "stop", risk: 1, reasons: ["Sources conflict about what should happen. Synforma does not guess; a person must resolve the conflict."] };
  if (i.policy === "never") return { decision: "guide", risk: 1, reasons: ["The Autonomy Contract never lets Synforma perform this class of action."] };
  if (i.judgment) return { decision: "guide", risk: 0.6, reasons: ["This step needs human judgment."] };
  const risk = Math.min(1, 0.55 * i.consequence + 0.25 * (1 - i.reversibility) + 0.2 * i.externalVisibility + 0.3 * (i.exceptionProbability ?? 0));
  const confidence = Math.min(i.modelConfidence, i.sourceConfidence);
  reasons.push(`risk ${risk.toFixed(2)} (consequence ${i.consequence}, reversibility ${i.reversibility})`, `confidence ${confidence.toFixed(2)} (model ${i.modelConfidence.toFixed(2)}, sources ${i.sourceConfidence.toFixed(2)})`);
  if (confidence < 0.5) return { decision: "ask", risk, reasons: [...reasons, "Confidence too low to act; ask or escalate."] };
  if (i.policy === "ask" || risk >= 0.45) return { decision: risk >= 0.8 ? "guide" : "prepare_ask", risk, reasons: [...reasons, risk >= 0.8 ? "High risk: a person performs it, Synforma verifies." : "Medium risk: prepare, preview, ask."] };
  return { decision: "act", risk, reasons: [...reasons, "Low risk and high confidence: act, with every action in the ledger."] };
}

/** Per-step trust decision for the runner and the UI. */
export function stepTrust(step: WorkflowStep, workflow: Workflow, contract: AutonomyContract | undefined, claims: Claim[], userHistory?: number): TrustResult & { actionClass: ActionClass } {
  const actions = step.actions.length ? step.actions : [{ kind: "wait", label: "noop" } as Action];
  const classes = actions.map((a) => classifyAction(a, step));
  const worst = (["D_external_or_destructive", "C_consequential_write", "B_reversible_write", "A_read"] as ActionClass[]).find((c) => classes.includes(c)) ?? "A_read";
  const profile = CLASS_PROFILE[worst];
  const stepClaims = claims.filter((c) => c.status !== "retired" && (step.requirementIds.some((rid) => c.subject === `requirement:${rid}` || c.object === `requirement:${rid}`)));
  const conflicting = stepClaims.some((c) => c.status === "contested");
  const sourceConfidence = stepClaims.length ? Math.min(...stepClaims.map((c) => c.confidence)) : 0.8;
  const result = decideTrust({
    modelConfidence: workflow.confidence,
    sourceConfidence,
    reversibility: profile.reversibility,
    consequence: profile.consequence,
    externalVisibility: profile.externalVisibility,
    conflictingSources: conflicting,
    userHistory,
    policy: policyFor(contract, worst),
    judgment: step.judgment,
  });
  return { ...result, actionClass: worst };
}
