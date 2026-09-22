import type { IframeDriver } from "../interaction/driver";
import { ground, roleCompatible, type GroundingCandidate } from "../interaction/grounding";
import { ACCEPT_PROBABILITY, type Decider } from "../decisions/types";
import { generalizeRoute } from "../interaction/snapshot";
import { similarity } from "../interaction/text";
import { anchorMatches, CONSENT_RE, resolveValue } from "../planner/heuristic";
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

/**
 * What a run is allowed to do. One object instead of a pile of flags.
 *
 *  commits  "ask"   → every commit control waits for hooks.requestApproval (default)
 *           "auto"  → commits proceed without asking (simulations; a commit the person approved a moment ago)
 *  scope    "all"     → every action of every selected step
 *           "routine" → routine actions only: judgment requirements are left for the person and the run
 *                       stops in front of the commit control ("Get It Done")
 *  steps    limit the run to these step ids (single-step assist, resuming after a stop); omit for the whole workflow
 *  trust    the Autonomy Contract and evidence that gate autonomy; omit for simulations and single-step assists,
 *           which are never blocked by a contested claim
 */
export interface RunPolicy {
  commits: "ask" | "auto";
  scope: "all" | "routine";
  steps?: string[];
  trust?: { contract?: AutonomyContract; claims: Claim[] };
}

export const DEFAULT_POLICY: RunPolicy = { commits: "ask", scope: "all" };

/** Who and what a ledger entry is attributed to. Without it, no ledger entries are written. */
export interface LedgerProvenance {
  runId: string;
  programId: string;
  intent?: string;
  decidedBy?: PlannerKind | "rule";
}

export interface RunnerOptions {
  driver: IframeDriver;
  workflow: Workflow;
  requirements: Requirement[];
  context: Record<string, string>;
  actor: RunActor;
  hooks: RunnerHooks;
  policy?: Partial<RunPolicy>;
  capabilities?: RunCapabilities;
  signal?: AbortSignal;
  ledger?: LedgerProvenance;
  /** A decision model consulted when the lexical rules are unsure which field is which; omitted → rules only. */
  decider?: Decider;
}

export interface RunnerResult {
  outcome: RunOutcome;
  requirementsMet: string[];
  regroundings: number;
  /** Decision-model questions asked during the run, and how many answers the runner acted on. */
  decisions: { asked: number; accepted: number };
  failedStepId?: string;
  error?: string;
  outcomeUrl?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runWorkflow(opts: RunnerOptions): Promise<RunnerResult> {
  const { driver, workflow, requirements, context, hooks } = opts;
  const caps = opts.capabilities ?? FULL_CAPABILITIES;
  const policy: RunPolicy = { ...DEFAULT_POLICY, ...(opts.policy ?? {}) };
  const requireApproval = policy.commits === "ask";
  const routineOnly = policy.scope === "routine";
  let regroundings = 0;
  const decisions = { asked: 0, accepted: 0 };
  const collected: Record<string, string> = {};
  const steps = policy.steps ? workflow.steps.filter((s) => policy.steps!.includes(s.id)) : workflow.steps;

  const perform = async (action: Action, step: WorkflowStep): Promise<ActionResult> => {
    if (opts.signal?.aborted) throw new Error("aborted");
    const r = await driver.perform(action);
    hooks.onEvent("action_executed", { action: { ...action, target: undefined }, ok: r.ok, durationMs: Math.round(r.durationMs), regrounded: Boolean(r.regrounded), regroundedTo: r.regroundedTo ?? null, regroundedToName: r.regroundedToName ?? null, error: r.error ?? null }, step.id, `${action.label}${r.ok ? "" : ` — ${r.error}`}`);
    if (r.regrounded) {
      regroundings += 1;
      hooks.onEvent(
        "action_regrounded",
        { from: action.targetName, to: r.regroundedTo, toName: r.regroundedToName ?? null, change: { type: "ui_element_changed", screen: step.route ?? null, affectedStep: step.id, detectedAt: Date.now(), risk: step.commit ? "medium" : "low" } },
        step.id,
        `Re-grounded "${action.targetName}" → "${r.regroundedToName ?? r.regroundedTo}"`,
      );
    }
    return r;
  };

  /**
   * The decision model's turn: the lexical rules found no field they recognise, so the screen's fields are put to the
   * model as labelled options plus "none of these". A confident choice is a re-grounding decided by the model and is
   * reported as such; "none" or a weak choice leaves the rules' verdict ("not here") in place. Every question and answer
   * is an event, so the audit shows what was asked and what was done with it.
   */
  const decideField = async (page: PageModel, action: Action, step: WorkflowStep, via?: string): Promise<SemanticElement | null> => {
    const decider = opts.decider;
    if (!decider || !action.targetName) return null;
    const candidates = page.fields.filter((f) => !f.disabled && roleCompatible(action.targetRole, f.role));
    if (!candidates.length) return null;
    const expected = action.targetName;
    const requirement = requirements.find((r) => r.id === requirementIdOfAction(action))?.text;
    const value = action.value && !action.value.startsWith("{{") ? action.value : undefined;
    decisions.asked += 1;
    const choice = await decider.chooseField({ expected: { name: expected, role: action.targetRole, region: action.targetRegion, value, requirement }, screen: { heading: page.heading, url: page.url }, candidates });
    const by = decider.name;
    if (!choice) {
      hooks.onEvent("decision", { by, question: "field", expected, unavailable: true, reason: decider.lastError, screen: step.route ?? null }, step.id, `${by} gave no answer about "${expected}"${decider.lastError ? ` (${decider.lastError})` : ""}; lexical rules only`);
      return null;
    }
    const p = Math.round(choice.probability * 100) / 100;
    const base = { by, question: "field", expected, choice: choice.name, key: choice.key, probability: choice.probability, confidence: choice.confidence, latencyMs: choice.latencyMs, screen: step.route ?? null, via: via ?? null };
    const field = choice.key ? (page.fields.find((f) => f.key === choice.key) ?? null) : null;
    if (!field || choice.probability < ACCEPT_PROBABILITY) {
      hooks.onEvent("decision", { ...base, accepted: false }, step.id, field ? `${by}: "${expected}" might be "${field.name}" (p ${p}), below the ${ACCEPT_PROBABILITY} acceptance threshold; not used` : `${by}: "${expected}" is not on this screen (p ${p})`);
      return null;
    }
    decisions.accepted += 1;
    regroundings += 1;
    hooks.onEvent("decision", { ...base, accepted: true }, step.id, `${by}: "${expected}" is now "${field.name}" (p ${p})`);
    hooks.onEvent(
      "action_regrounded",
      { from: expected, to: field.key, toName: field.name, decidedBy: by, probability: choice.probability, change: { type: via ? "ui_element_moved" : "ui_element_changed", screen: step.route ?? null, affectedStep: step.id, detectedAt: Date.now(), risk: step.commit ? "medium" : "low", decidedBy: by, probability: choice.probability, ...(via ? { via } : {}) } },
      step.id,
      `Re-grounded "${expected}" → "${field.name}"${via ? ` behind "${via}"` : ""} (decided by ${by}, p ${p})`,
    );
    return field;
  };

  // Fills whose field was not on the planned screen: a vendor update may have moved it to a later screen of the same
  // form (a tab on the review step). They are retried at the start of each later step on that route.
  const carried: { action: Action; route?: string }[] = [];

  for (const step of steps) {
    hooks.onEvent("step_entered", { title: step.title, mode: step.mode }, step.id, step.title);
    hooks.onStep?.(step, "entered");
    let page: PageModel = driver.snapshot().page;
    const carriedHere = carried.filter((c) => c.route === step.route).map((c) => c.action);
    if (carriedHere.length) carried.splice(0, carried.length, ...carried.filter((c) => c.route !== step.route));

    // Trust decision for this step (Autonomy Contract + evidence). Conflicting sources stop autonomy.
    if (policy.trust) {
      const trust = stepTrust(step, workflow, policy.trust.contract, policy.trust.claims);
      hooks.onEvent("trust_decision", { decision: trust.decision, risk: trust.risk, reasons: trust.reasons, actionClass: trust.actionClass }, step.id, `Trust: ${trust.decision} (${trust.actionClass})`);
      if (trust.decision === "stop") {
        hooks.onEvent("run_abandoned", { reason: "conflicting sources", details: trust.reasons }, step.id, trust.reasons[0]);
        hooks.onStep?.(step, "failed");
        return { outcome: "abandoned", requirementsMet: [], regroundings, decisions, failedStepId: step.id, error: trust.reasons[0] };
      }
      if (trust.decision === "guide" && opts.actor === "agent" && !policy.steps) {
        const cls = trust.actionClass;
        if (policyFor(policy.trust.contract, cls) === "never") {
          hooks.onEvent("run_abandoned", { reason: "contract forbids autonomy", actionClass: cls }, step.id, `The Autonomy Contract never lets Synforma perform ${cls} actions`);
          hooks.onStep?.(step, "failed");
          return { outcome: "abandoned", requirementsMet: [], regroundings, decisions, failedStepId: step.id, error: "Autonomy Contract: never" };
        }
      }
    }

    for (const raw of [...carriedHere, ...step.actions]) {
      let action: Action = { ...raw };
      if (routineOnly && isRequirementAction(action)) {
        const rid = requirementIdOfAction(action);
        const req = requirements.find((r) => r.id === rid);
        if (req?.judgment) {
          hooks.onEvent("note", { skippedJudgment: action.targetName, requirementId: rid }, step.id, `Left "${action.targetName}" for you (needs judgment)`);
          continue;
        }
      }
      if (routineOnly && step.commit && isCommitAction(action, step)) {
        hooks.onEvent("note", { stoppedBeforeCommit: action.label }, step.id, `Stopped before "${action.targetName}" — your approval is needed to commit`);
        hooks.onStep?.(step, "completed");
        return { outcome: "completed", requirementsMet: [], regroundings, decisions };
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
      let decided = false;
      if (action.kind === "type" || action.kind === "select" || action.kind === "check") {
        let field = findField(page, action, caps, requirements);
        if (!field && caps.synonyms) {
          field = await decideField(page, action, step);
          decided = Boolean(field);
        }
        if (!field && caps.expand && caps.synonyms) {
          // A vendor update may have moved the field behind a tab or a disclosure: open the one whose name matches the field or the step.
          const byName = revealCandidate(page, [action.targetName ?? "", step.title]);
          // Try the best-named opener first, then the few remaining closed tabs (tabs are reversible and never commit).
          const openers = [byName, ...page.actions.filter((a) => a.role === "tab" && a.expanded !== true && !a.disabled && a.key !== byName?.key)].filter((a): a is SemanticElement => Boolean(a)).slice(0, 5);
          for (const opener of openers) {
            const opened = await perform({ kind: "click", target: opener.key, targetName: opener.name, targetRole: opener.role, targetCommit: false, label: `Open ${opener.role === "tab" ? "tab" : "section"} ${opener.name}` }, step);
            if (!opened.ok || !opened.page) continue;
            page = opened.page;
            field = findField(page, action, caps, requirements);
            if (field) {
              hooks.onEvent("action_regrounded", { from: action.targetName, to: field.key, toName: field.name, change: { type: "ui_element_moved", screen: step.route ?? null, affectedStep: step.id, detectedAt: Date.now(), risk: "low", via: opener.name } }, step.id, `Found "${action.targetName}" behind "${opener.name}"`);
              break;
            }
            field = await decideField(page, action, step, opener.name);
            if (field) {
              decided = true;
              break;
            }
          }
        }
        if (!field && caps.expand && caps.synonyms && steps.some((x) => x.index > step.index && x.route === step.route)) {
          // Not on this screen and the form continues: look for it on the next screens before giving up.
          carried.push({ action: raw, route: step.route });
          hooks.onEvent("note", { deferred: action.targetName, reason: "not on this screen" }, step.id, `"${action.targetName}" is not on this screen; Synforma will look for it on the next screens of this form`);
          continue;
        }
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
            return { outcome: "abandoned", requirementsMet: [], regroundings, decisions, failedStepId: step.id, error: "Approval denied" };
          }
          hooks.onEvent("approval_granted", {}, step.id, "Approval granted");
        }
      }
      // A shorter wizard: the screen already holds the commit control and no forward control, so this "Next" has nothing to do.
      if (action.kind === "click" && WIZARD_NAV_RE.test(action.targetName ?? "") && !page.actions.some((a) => WIZARD_NAV_RE.test(a.name) && !a.disabled) && page.actions.some((a) => a.commit && !a.disabled && a.role === "button")) {
        hooks.onEvent("note", { skippedNavigation: action.targetName, reason: "commit control already on screen" }, step.id, `"${action.targetName}" is no longer needed here: the commit control is already on this screen`);
        continue;
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
      if (hooks.onLedger && opts.ledger) {
        const afterPage = r.page ?? driver.snapshot().page;
        const targetKey = r.regroundedTo ?? action.target;
        const afterVal = fieldValue(afterPage, targetKey);
        const reqId = requirementIdOfAction(raw);
        hooks.onLedger(
          makeLedgerEntry({
            runId: opts.ledger.runId,
            programId: opts.ledger.programId,
            stepId: step.id,
            requestedBy: opts.actor,
            intent: opts.ledger.intent ?? workflow.title,
            reliedOn: reqId ? [`requirement:${reqId}`] : [],
            decidedBy: opts.ledger.decidedBy ?? "rule",
            actionClass: classifyAction(action, step),
            action,
            before: beforeVal !== undefined && targetKey ? { key: targetKey, value: beforeVal } : undefined,
            after: afterVal !== undefined && targetKey ? { key: targetKey, value: afterVal } : undefined,
            approval: step.commit && isCommitAction(action, step) ? (requireApproval ? "granted" : "not_required") : "not_required",
            result: r.ok ? "ok" : "failed",
            regrounded: Boolean(r.regrounded) || decided,
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
      if (!r.ok && action.targetRole === "menuitem" && driver.snapshot().page.actions.some((a) => a.role === "menuitem")) {
        // Leave no menu open behind a failure: it would hide the rest of the screen from the next action.
        await perform({ kind: "press", value: "Escape", label: "Close menu" }, step);
      }
      if (!r.ok && action.kind === "click" && WIZARD_NAV_RE.test(action.targetName ?? "") && page.actions.some((a) => a.commit && !a.disabled)) {
        // The wizard got shorter: this screen already holds the commit control, so the missing "Next" is not needed.
        hooks.onEvent("note", { skippedNavigation: action.targetName, reason: "commit control already on screen" }, step.id, `"${action.targetName}" is no longer needed here: the commit control is already on this screen`);
        continue;
      }
      if (!r.ok) {
        hooks.onEvent("action_failed", { action: action.label, error: r.error }, step.id, r.error);
        if (isEssential(action, step)) {
          hooks.onEvent("run_failed", { stepId: step.id, error: r.error }, step.id);
          hooks.onStep?.(step, "failed");
          return { outcome: "failed", requirementsMet: [], regroundings, decisions, failedStepId: step.id, error: r.error };
        }
        continue;
      }
      page = r.page ?? driver.snapshot().page;

      // Validation after the commit itself (an unticked acknowledgement, a field the review step still wants): repair once and commit again.
      if (action.kind === "click" && page.alerts.length && step.commit && isCommitAction(action, step) && caps.fixValidation) {
        hooks.onEvent("validation_error", { alerts: page.alerts, atCommit: true }, step.id, page.alerts.join(" / "));
        let fixed = false;
        for (const cb of page.fields.filter((f) => f.role === "checkbox" && !f.checked && (f.invalid || CONSENT_RE.test(f.name)))) {
          const c = await perform({ kind: "check", target: cb.key, targetName: cb.name, targetRole: "checkbox", value: "true", label: `Confirm "${cb.name}"` }, step);
          fixed = fixed || c.ok;
        }
        page = driver.snapshot().page;
        fixed = (await repairValidation(page, step, requirements, context, perform)) || fixed;
        if (fixed) {
          const again = await perform(action, step);
          page = again.page ?? driver.snapshot().page;
        }
      }
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
          return { outcome: "abandoned", requirementsMet: [], regroundings, decisions, failedStepId: step.id, error: page.alerts[0] };
        }
      }
      await sleep(40);
    }
    // A form that jumped back to an earlier screen (a late validation) leaves the next step on the wrong screen: move forward until the step's own screen is back.
    // Only a screen that belongs to a known step before the target (a jump back, or a step the policy skipped) is moved through; a screen that matches no known step is a renamed heading and is left alone.
    if (!step.commit && step.anchor?.heading) {
      for (let i = 0; i < 6; i++) {
        const now = driver.snapshot().page;
        const nextStep = steps[steps.indexOf(step) + 1];
        const target = nextStep?.anchor?.heading;
        if (!target || anchorMatches({ heading: target }, now.url, now.heading, now.headings, now.dialogs)) break;
        // A known screen before the target (this step's own, an earlier one, or one the policy skipped) is moved through.
        const onKnownEarlierScreen = workflow.steps.some((s) => s.route === step.route && s.anchor?.heading && (!nextStep || s.index < nextStep.index) && anchorMatches({ heading: s.anchor.heading }, now.url, now.heading, now.headings, now.dialogs));
        if (!onKnownEarlierScreen) break;
        const fwd = now.actions.find((a) => a.role === "button" && WIZARD_NAV_RE.test(a.name) && !a.disabled);
        if (!fwd) break;
        const r = await perform({ kind: "click", target: fwd.key, targetName: fwd.name, targetRole: "button", targetCommit: false, label: `Move forward (${fwd.name})` }, step);
        if (!r.ok) break;
        if (r.page?.alerts.length) {
          const fixed = await repairValidation(r.page, step, requirements, context, perform);
          if (!fixed) break;
        }
      }
    }
    hooks.onEvent("step_completed", { title: step.title }, step.id, step.title);
    hooks.onStep?.(step, "completed");
  }

  if (policy.steps) {
    return { outcome: "completed", requirementsMet: [], regroundings, decisions };
  }

  // Outcome verification on the resulting screen.
  await driver.waitForSettle(2000);
  const finalPage = driver.snapshot().page;
  const requirementsMet = verifyRequirements(finalPage, requirements);
  const outcomeUrl = finalPage.url;
  const commitRoute = [...steps].reverse().find((s) => s.commit)?.route ?? null;
  const finalRoute = generalizeRoute(finalPage.url);
  const leftTheForm = commitRoute ? finalRoute !== commitRoute : true;
  const successText = [...finalPage.alerts, finalPage.heading, ...finalPage.headings].join(" ");
  const onOutcome =
    (workflow.outcomeRoutePattern ? finalRoute === workflow.outcomeRoutePattern : false) ||
    (leftTheForm && finalPage.definitions.length >= 3) ||
    (leftTheForm && /\b(created|issued|submitted|saved|sent|approved|completed|success)/i.test(successText));
  hooks.onEvent("outcome_verified", { url: outcomeUrl, onOutcomeScreen: onOutcome, requirementsMet, labels: finalPage.definitions.slice(0, 24).map((d) => d.label) }, undefined, `Outcome screen ${onOutcome ? "reached" : "not recognized"}; ${requirementsMet.length}/${requirements.length} requirements verified`);
  if (!onOutcome) {
    hooks.onEvent("run_failed", { reason: "outcome screen not reached", url: outcomeUrl });
    return { outcome: "failed", requirementsMet, regroundings, decisions, error: "Outcome screen not reached", outcomeUrl };
  }
  hooks.onEvent("run_completed", { requirementsMet, outcomeUrl, decisions });
  return { outcome: "completed", requirementsMet, regroundings, decisions, outcomeUrl };
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

const WIZARD_NAV_RE = /^(next|continue|proceed)\b/i;

/** A closed tab or collapsed section whose name matches one of the hints; used to find a field a vendor update moved. */
function revealCandidate(page: PageModel, hints: string[]): SemanticElement | null {
  const openers = page.actions.filter((a) => !a.commit && !a.disabled && ((a.role === "tab" && a.expanded !== true) || (a.role === "button" && a.expanded === false)));
  let best: { el: SemanticElement; score: number } | null = null;
  for (const el of openers) {
    for (const hint of hints) {
      if (!hint) continue;
      const score = similarity(el.name, hint);
      if (score > 0.45 && (!best || score > best.score)) best = { el, score };
    }
  }
  return best?.el ?? null;
}

function findField(page: PageModel, action: Action, caps: RunCapabilities, requirements: Requirement[] = []): SemanticElement | null {
  if (action.target) {
    const exact = page.fields.find((f) => f.key === action.target);
    if (exact) return exact;
  }
  if (!action.targetName) return null;
  if (!caps.synonyms) {
    const plain = page.fields.find((f) => f.name.toLowerCase() === action.targetName!.toLowerCase());
    return plain ?? null;
  }
  // The requirement's own wording is evidence too: a renamed field keeps options or help text that still say what it holds.
  const reqText = requirements.find((r) => r.id === requirementIdOfAction(action))?.text;
  const hints = [...(action.value && !action.value.startsWith("{{") ? [action.value] : []), ...(reqText ? [reqText] : [])];
  const hit = ground({ name: action.targetName, role: action.targetRole, kind: "field", hints: hints.length ? hints : undefined }, page);
  if (!hit || !recognisablyTheSameField(hit)) return null;
  return hit.element;
}

/**
 * A field the vendor renamed still resembles its old self: a similar name, the same acronym, or options, help text
 * and requirement wording that overlap. A candidate that only shares a generic word with the old name (and a
 * role) is another field; treating it as "not here" lets the fill defer to a later screen instead of landing wrong.
 */
function recognisablyTheSameField(hit: GroundingCandidate): boolean {
  return hit.reasons.some((reason) => {
    if (reason === "exact semantic key" || reason === "same name" || reason === "acronym of the old name" || reason === "hint overlap" || reason === "description/options overlap") return true;
    const similar = /^name similar \((\d+)%\)/.exec(reason);
    return Boolean(similar && Number(similar[1]) >= 50);
  });
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
    if (f.role === "checkbox" || f.role === "switch") {
      const c = await perform({ kind: "check", target: f.key, targetName: f.name, targetRole: f.role, value: "true", label: `Confirm "${f.name}"` }, step);
      fixedAny = fixedAny || c.ok;
      continue;
    }
    let value = "";
    const alertText = page.alerts.join(" ");
    if (/already exists|already taken|already in use|must be unique|is taken|duplicate name/i.test(alertText) && f.value) {
      // A name the application already has: keep the person's wording, add a counter in the name's own style
      // (snake_case keeps underscores, spaced names get a space, a single word gets the digits appended).
      const m = /^(.*?)(?:[_ -]?(\d+))?$/.exec(f.value);
      const base = m ? m[1] : f.value;
      const n = m && m[2] ? Number(m[2]) + 1 : 2;
      const separator = /_/.test(base) ? "_" : /\s/.test(base) ? " " : "";
      value = `${base}${separator}${n}`;
    } else if (/yyyy-mm-dd|date/i.test(alertText) || /date/i.test(f.name)) {
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
    if (r.expectation?.atMostDays) {
      // A capped duration must state a number of days at or under the cap; "Indefinite" or a bare label does not count.
      const daysMatch = /(\d+)\s*days?\b/i.exec(value);
      if (!daysMatch || Number(daysMatch[1]) > r.expectation.atMostDays) continue;
    }
    met.push(r.id);
  }
  return met;
}
