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
  PageModel,
  Requirement,
  RunActor,
  RunEventType,
  RunOutcome,
  SemanticElement,
  Workflow,
  WorkflowStep,
} from "../types";

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
      hooks.onEvent("action_regrounded", { from: action.targetName, to: r.regroundedTo }, step.id, `Re-grounded "${action.targetName}" → ${r.regroundedTo}`);
    }
    return r;
  };

  for (const step of steps) {
    hooks.onEvent("step_entered", { title: step.title, mode: step.mode }, step.id, step.title);
    hooks.onStep?.(step, "entered");
    let page: PageModel = driver.snapshot().page;

    for (const raw of step.actions) {
      let action: Action = { ...raw };
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
      let r = await perform(action, step);
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
  hooks.onEvent("outcome_verified", { url: outcomeUrl, onOutcomeScreen: onOutcome, requirementsMet, definitions: finalPage.definitions.slice(0, 24) }, undefined, `Outcome screen ${onOutcome ? "reached" : "not recognized"}; ${requirementsMet.length}/${requirements.length} requirements verified`);
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
