import type { IframeDriver } from "../interaction/driver";
import { ground } from "../interaction/grounding";
import { generalizeRoute } from "../interaction/snapshot";
import { similarity } from "../interaction/text";
import { resolveValue } from "../planner/heuristic";
import { FULL_CAPABILITIES, type RunCapabilities } from "../planner/types";
import type {
  Action,
  ActionResult,
  ApprovalRequest,
  AutonomyContract,
  Claim,
  LedgerEntry,
  PageModel,
  PlannerKind,
  Requirement,
  RunActor,
  RunEventType,
  RunOutcome,
  SemanticElement,
  Workflow,
  WorkflowStep,
} from "../types";
import { fieldValue, makeLedgerEntry } from "./ledger";
import { classifyAction, policyFor, stepTrust } from "./trust";

/**
 * Runner — executes a workflow in Act mode (whole workflow) or Assist mode
 * (a single step), through the Universal Interaction Layer.
 *
 * Trust properties:
 *  - commit steps always request approval before the committing action
 *  - every action is reported (audit)
 *  - semantic re-grounding is reported (self-healing)
 */

export interface RunnerHooks {
  onEvent: (type: RunEventType, data?: Record<string, unknown>, stepId?: string, message?: string) => void;
  requestApproval: (req: Omit<ApprovalRequest, "id" | "runId" | "requestedAt">) => Promise<"granted" | "denied">;
  onStep?: (step: WorkflowStep, status: "entered" | "completed" | "failed") => void;
  /** Provenance + rollback ledger entry for every executed action. */
  onLedger?: (entry: LedgerEntry) => void;
}

export interface RunnerOptions {
  driver: IframeDriver;
  workflow: Workflow;
  requirements: Requirement[];
  context: Record<string, string>;
  actor: RunActor;
  hooks: RunnerHooks;
  capabilities?: RunCapabilities;
  requireApprovalForCommit?: boolean;
  signal?: AbortSignal;
  /** Only run these steps (Assist mode). */
  onlySteps?: string[];
  /** Get It Done: fill routine (non-judgment) inputs, leave judgment fields to the person, stop before commit. */
  routineOnly?: boolean;
  /** Trust layer: the workflow's Autonomy Contract and current claims. Conflicting claims stop autonomous steps. */
  contract?: AutonomyContract;
  claims?: Claim[];
  /** For the ledger. */
  runId?: string;
  programId?: string;
  intent?: string;
  decidedBy?: PlannerKind | "rule";
}

export interface RunnerResult {
  outcome: RunOutcome;
  requirementsMet: string[];
  regroundings: number;
  failedStepId?: string;
  error?: string;
  outcomeUrl?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runWorkflow(opts: RunnerOptions): Promise<RunnerResult> {
  const { driver, workflow, requirements, context, hooks } = opts;
  const caps = opts.capabilities ?? FULL_CAPABILITIES;
  const requireApproval = opts.requireApprovalForCommit ?? true;
  let regroundings = 0;
  const collected: Record<string, string> = {};
  const steps = opts.onlySteps ? workflow.steps.filter((s) => opts.onlySteps!.includes(s.id)) : workflow.steps;

  const perform = async (action: Action, step: WorkflowStep): Promise<ActionResult> => {
    if (opts.signal?.aborted) throw new Error("aborted");
    const r = await driver.perform(action);
    hooks.onEvent("action_executed", { action: { ...action, target: undefined }, ok: r.ok, durationMs: Math.round(r.durationMs), regrounded: Boolean(r.regrounded), regroundedTo: r.regroundedTo ?? null, error: r.error ?? null }, step.id, `${action.label}${r.ok ? "" : ` — ${r.error}`}`);
    if (r.regrounded) {
      regroundings += 1;
      hooks.onEvent(
        "action_regrounded",
        { from: action.targetName, to: r.regroundedTo, change: { type: "ui_element_changed", screen: step.route ?? null, affectedStep: step.id, detectedAt: Date.now(), risk: step.commit ? "medium" : "low" } },
        step.id,
        `Re-grounded "${action.targetName}" → ${r.regroundedTo}`,
      );
    }
    return r;
  };

  for (const step of steps) {
    hooks.onEvent("step_entered", { title: step.title, mode: step.mode }, step.id, step.title);
    hooks.onStep?.(step, "entered");
    let page: PageModel = driver.snapshot().page;

    // Trust decision for this step (Autonomy Contract + evidence). Conflicting sources stop autonomy.
    if (opts.claims || opts.contract) {
      const trust = stepTrust(step, workflow, opts.contract, opts.claims ?? []);
      hooks.onEvent("trust_decision", { decision: trust.decision, risk: trust.risk, reasons: trust.reasons, actionClass: trust.actionClass }, step.id, `Trust: ${trust.decision} (${trust.actionClass})`);
      if (trust.decision === "stop") {
        hooks.onEvent("run_abandoned", { reason: "conflicting sources", details: trust.reasons }, step.id, trust.reasons[0]);
        hooks.onStep?.(step, "failed");
        return { outcome: "abandoned", requirementsMet: [], regroundings, failedStepId: step.id, error: trust.reasons[0] };
      }
      if (trust.decision === "guide" && opts.actor === "agent" && !opts.onlySteps) {
        const cls = trust.actionClass;
        if (policyFor(opts.contract, cls) === "never") {
          hooks.onEvent("run_abandoned", { reason: "contract forbids autonomy", actionClass: cls }, step.id, `The Autonomy Contract never lets Synforma perform ${cls} actions`);
          hooks.onStep?.(step, "failed");
          return { outcome: "abandoned", requirementsMet: [], regroundings, failedStepId: step.id, error: "Autonomy Contract: never" };
        }
      }
    }

    for (const raw of step.actions) {
      let action: Action = { ...raw };
      if (opts.routineOnly && isRequirementAction(action)) {
        const rid = requirementIdOfAction(action);
        const req = requirements.find((r) => r.id === rid);
        if (req?.judgment) {
          hooks.onEvent("note", { skippedJudgment: action.targetName, requirementId: rid }, step.id, `Left "${action.targetName}" for you (needs judgment)`);
          continue;
        }
      }
      if (opts.routineOnly && step.commit && isCommitAction(action, step)) {
        hooks.onEvent("note", { stoppedBeforeCommit: action.label }, step.id, `Stopped before "${action.targetName}" — your approval is needed to commit`);
        hooks.onStep?.(step, "completed");
        return { outcome: "completed", requirementsMet: [], regroundings };
      }
      // Substitute the concrete entry URL for pattern routes.
      if (action.kind === "navigate" && action.url) {
        const pattern = generalizeRoute(action.url);
        if (pattern !== action.url && context.entryUrl && generalizeRoute(context.entryUrl) === pattern) action = { ...action, url: context.entryUrl, label: `${action.label} (${context.entryUrl})` };
        else if (pattern !== action.url && context.entryUrl && step.index === 0) action = { ...action, url: context.entryUrl, label: `${action.label} (${context.entryUrl})` };
      }
      if (action.kind === "expand" && !caps.expand) {
        hooks.onEvent("hesitation", { simulated: true, reason: `did not find "${action.targetName}"` }, step.id, `Could not see "${action.targetName}"`);
        continue;
      }
      // Resolve templated values against the live field.
      if (action.kind === "type" || action.kind === "select" || action.kind === "check") {
        const field = findField(page, action, caps);
        if (!field) {
          if (!caps.expand || !caps.synonyms) {
            hooks.onEvent("hesitation", { simulated: true, reason: `field "${action.targetName}" not visible` }, step.id, `Could not find "${action.targetName}"`);
            if (isRequirementAction(action)) {
              // A less capable user gives up on hidden requirement fields.
              hooks.onEvent("action_failed", { action: action.label, reason: "not visible" }, step.id, `Skipped "${action.targetName}"`);
              continue;
            }
          }
        }
        const isOptional = field ? !field.required : false;
        if (isOptional && !caps.fillOptional && !isRequirementAction(action)) continue;
        if (isOptional && !caps.fillOptional && isRequirementAction(action) && Math.random() < 0.5) {
          hooks.onEvent("note", { skipped: action.targetName, simulated: true }, step.id, `Skipped optional-looking field "${action.targetName}"`);
          continue;
        }
        const value = resolveValue(action, requirements, context, field ?? undefined);
        action = { ...action, value, target: field?.key ?? action.target };
        collected[action.targetName ?? action.target ?? action.label] = value;
      }
      if (step.commit && isCommitAction(action, step)) {
        if (requireApproval) {
          hooks.onEvent("approval_requested", { payload: collected }, step.id, `Approval requested: ${action.label}`);
          const decision = await hooks.requestApproval({ stepId: step.id, title: action.label, summary: `Synforma is about to ${action.label.toLowerCase()} with the values shown.`, payload: { ...collected } });
          if (decision === "denied") {
            hooks.onEvent("approval_denied", {}, step.id, "Approval denied");
            hooks.onEvent("run_abandoned", { reason: "approval denied" }, step.id);
            return { outcome: "abandoned", requirementsMet: [], regroundings, failedStepId: step.id, error: "Approval denied" };
          }
          hooks.onEvent("approval_granted", {}, step.id, "Approval granted");
        }
      }
      // A menu item can only be reached through its menu: if none is open, open the popup buttons first.
      if (action.kind === "click" && action.targetRole === "menuitem" && !page.actions.some((a) => a.role === "menuitem")) {
        for (const popup of page.actions.filter((a) => a.role === "button" && a.popup && !a.commit)) {
          const opened = await perform({ kind: "click", target: popup.key, targetName: popup.name, targetRole: "button", targetCommit: false, label: `Open menu ${popup.name}` }, step);
          if (opened.page?.actions.some((a) => a.role === "menuitem")) {
            page = opened.page;
            break;
          }
        }
      }
      const beforeVal = fieldValue(page, action.target);
      let r = await perform(action, step);
      if (hooks.onLedger && opts.runId && opts.programId) {
        const afterPage = r.page ?? driver.snapshot().page;
        const targetKey = r.regroundedTo ?? action.target;
        const afterVal = fieldValue(afterPage, targetKey);
        const reqId = requirementIdOfAction(raw);
        hooks.onLedger(
          makeLedgerEntry({
            runId: opts.runId,
            programId: opts.programId,
            stepId: step.id,
            requestedBy: opts.actor,
            intent: opts.intent ?? workflow.title,
            reliedOn: reqId ? [`requirement:${reqId}`] : [],
            decidedBy: opts.decidedBy ?? "rule",
            actionClass: classifyAction(action, step),
            action,
            before: beforeVal !== undefined && targetKey ? { key: targetKey, value: beforeVal } : undefined,
            after: afterVal !== undefined && targetKey ? { key: targetKey, value: afterVal } : undefined,
            approval: step.commit && isCommitAction(action, step) ? (requireApproval ? "granted" : "not_required") : "not_required",
            result: r.ok ? "ok" : "failed",
            regrounded: r.regrounded,
          }),
        );
      }
      if (!r.ok && !caps.synonyms) {
        hooks.onEvent("hesitation", { simulated: true, reason: r.error }, step.id, r.error);
      }
      if (!r.ok) {
        // One retry after settling (menus, transitions).
        await driver.waitForSettle(600);
        driver.snapshot();
        r = await perform(action, step);
      }
      if (!r.ok) {
        hooks.onEvent("action_failed", { action: action.label, error: r.error }, step.id, r.error);
        if (isEssential(action, step)) {
          hooks.onEvent("run_failed", { stepId: step.id, error: r.error }, step.id);
          hooks.onStep?.(step, "failed");
          return { outcome: "failed", requirementsMet: [], regroundings, failedStepId: step.id, error: r.error };
        }
        continue;
      }
      page = r.page ?? driver.snapshot().page;

      // Validation feedback after a click that did not move us on.
      if (action.kind === "click" && page.alerts.length && !step.commit) {
        hooks.onEvent("validation_error", { alerts: page.alerts }, step.id, page.alerts.join(" / "));
        if (caps.fixValidation) {
          const fixed = await repairValidation(page, step, requirements, context, perform);
          if (fixed) {
            page = driver.snapshot().page;
            const again = await perform(action, step);
            page = again.page ?? page;
          }
        } else {
          hooks.onEvent("run_abandoned", { reason: "validation", alerts: page.alerts, simulated: true }, step.id);
          hooks.onStep?.(step, "failed");
          return { outcome: "abandoned", requirementsMet: [], regroundings, failedStepId: step.id, error: page.alerts[0] };
        }
      }
      await sleep(40);
    }
    hooks.onEvent("step_completed", { title: step.title }, step.id, step.title);
    hooks.onStep?.(step, "completed");
  }

  if (opts.onlySteps) {
    return { outcome: "completed", requirementsMet: [], regroundings };
  }

  // Outcome verification on the resulting screen.
  await driver.waitForSettle(2000);
  const finalPage = driver.snapshot().page;
  const requirementsMet = verifyRequirements(finalPage, requirements);
  const outcomeUrl = finalPage.url;
  const onOutcome = workflow.outcomeRoutePattern ? generalizeRoute(finalPage.url) === workflow.outcomeRoutePattern : finalPage.definitions.length >= 3;
  hooks.onEvent("outcome_verified", { url: outcomeUrl, onOutcomeScreen: onOutcome, requirementsMet, labels: finalPage.definitions.slice(0, 24).map((d) => d.label) }, undefined, `Outcome screen ${onOutcome ? "reached" : "not recognized"}; ${requirementsMet.length}/${requirements.length} requirements verified`);
  if (!onOutcome) {
    hooks.onEvent("run_failed", { reason: "outcome screen not reached", url: outcomeUrl });
    return { outcome: "failed", requirementsMet, regroundings, error: "Outcome screen not reached", outcomeUrl };
  }
  hooks.onEvent("run_completed", { requirementsMet, outcomeUrl });
  return { outcome: "completed", requirementsMet, regroundings, outcomeUrl };
}

function isRequirementAction(a: Action): boolean {
  return Boolean(a.value && a.value.startsWith("{{req:"));
}

export function requirementIdOfAction(a: Action): string | null {
  const m = /^\{\{req:(\w+)(?::date)?\}\}$/.exec(a.value ?? "");
  return m ? m[1] : null;
}

function isCommitAction(a: Action, step: WorkflowStep): boolean {
  if (a.kind !== "click") return false;
  const last = [...step.actions].reverse().find((x) => x.kind === "click");
  return last === a || (a.targetName ?? "") === (step.anchor.elementName ?? "");
}

function isEssential(a: Action, step: WorkflowStep): boolean {
  if (a.kind === "navigate") return true;
  if (a.kind === "click" && (step.commit || /next|continue|proceed|→/i.test(a.label))) return true;
  if (a.kind === "click" && step.actions.filter((x) => x.kind === "click").length <= 2) return true;
  return false;
}

function findField(page: PageModel, action: Action, caps: RunCapabilities): SemanticElement | null {
  if (action.target) {
    const exact = page.fields.find((f) => f.key === action.target);
    if (exact) return exact;
  }
  if (!action.targetName) return null;
  if (!caps.synonyms) {
    const plain = page.fields.find((f) => f.name.toLowerCase() === action.targetName!.toLowerCase());
    return plain ?? null;
  }
  const hit = ground({ name: action.targetName, role: action.targetRole, kind: "field", hints: action.value && !action.value.startsWith("{{") ? [action.value] : undefined }, page);
  return hit?.element ?? null;
}

async function repairValidation(
  page: PageModel,
  step: WorkflowStep,
  requirements: Requirement[],
  context: Record<string, string>,
  perform: (a: Action, s: WorkflowStep) => Promise<ActionResult>,
): Promise<boolean> {
  let fixedAny = false;
  const invalid = page.fields.filter((f) => f.invalid);
  for (const f of invalid) {
    let value = "";
    const alertText = page.alerts.join(" ");
    if (/yyyy-mm-dd|date/i.test(alertText) || /date/i.test(f.name)) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      value = d.toISOString().slice(0, 10);
    } else if (f.options?.length) {
      value = f.options.find((o) => !/^(select|choose|--|unknown)/i.test(o)) ?? "";
    } else if (f.inputType === "number") value = context.amount ?? "48000";
    else value = resolveValue({ kind: "type", value: `{{field:${f.key}}}`, label: "" }, requirements, context, f);
    if (!value) continue;
    const r = await perform({ kind: f.role === "combobox" ? "select" : "type", target: f.key, targetName: f.name, targetRole: f.role, value, label: `Repair ${f.name}` }, step);
    fixedAny = fixedAny || r.ok;
  }
  return fixedAny;
}

/** Check each requirement against the labels/values shown on the outcome screen. */
export function verifyRequirements(page: PageModel, requirements: Requirement[]): string[] {
  const met: string[] = [];
  for (const r of requirements) {
    if (r.kind !== "field") continue;
    const hint = r.expectation?.fieldHint ?? r.text;
    let best: { label: string; value: string; score: number } | null = null;
    for (const d of page.definitions) {
      const s = similarity(hint, d.label) + (r.expectation?.acceptedValues?.some((v) => d.value.toLowerCase().includes(v.toLowerCase())) ? 0.4 : 0);
      if (!best || s > best.score) best = { ...d, score: s };
    }
    if (!best || best.score < 0.25) continue;
    const value = best.value.trim();
    if (!value || /^(—|-|none|n\/a|unknown)$/i.test(value) && !(r.expectation?.acceptedValues ?? []).some((v) => v.toLowerCase() === value.toLowerCase())) continue;
    const rejected = (r.expectation?.rejectedValues ?? []).map((x) => x.toLowerCase());
    if (rejected.includes(value.toLowerCase())) continue;
    const accepted = r.expectation?.acceptedValues ?? [];
    if (accepted.length && !accepted.some((v) => value.toLowerCase().includes(v.toLowerCase()))) {
      // Accepted values may describe a related field (e.g. competitors "None identified"); allow non-empty values for list-like requirements.
      if (!/competitor|alternative/i.test(r.text)) continue;
    }
    if (r.expectation?.withinDays) {
      const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(value) ?? /(\d{4}-\d{2}-\d{2})/.exec(page.definitions.find((d) => /date/i.test(d.label) && similarity(hint, d.label) > 0.2)?.value ?? "");
      if (!dateMatch) continue;
      const days = (new Date(dateMatch[1]).getTime() - Date.now()) / 86_400_000;
      if (days > r.expectation.withinDays || days < -1) continue;
    }
    met.push(r.id);
  }
  return met;
}
