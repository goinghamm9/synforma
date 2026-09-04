import type { IframeDriver } from "../interaction/driver";
import { ground } from "../interaction/grounding";
import { generalizeRoute } from "../interaction/snapshot";
import { KeyboardAggregator, PointerAggregator } from "../interaction/telemetry";
import { similarity } from "../interaction/text";
import { inferFriction } from "./friction";
import { verifyRequirements } from "./runner";
import type {
  ElementRect,
  FrictionInference,
  KeyboardWindow,
  PageModel,
  PointerWindow,
  Requirement,
  RunEventType,
  SemanticAnchor,
  StruggleSignal,
  Workflow,
  WorkflowStep,
} from "../types";

/**
 * Human observer — Guide mode.
 *
 * Watches a person working in the target application through the same
 * semantic layer the agent uses. It infers which workflow step they are on,
 * keeps a live requirement checklist, and raises struggle signals
 * (hesitation, validation errors, backtracking, wrong screen) for the
 * adoption engine. It records; it never blocks.
 */

export interface ChecklistItem {
  requirementId: string;
  met: boolean;
  fieldName?: string;
  value?: string;
}

export interface ObserverHooks {
  onEvent: (type: RunEventType, data?: Record<string, unknown>, stepId?: string, message?: string) => void;
  onStepChange: (step: WorkflowStep | null, index: number, page: PageModel) => void;
  onSignal: (signal: Omit<StruggleSignal, "id" | "runId">) => void;
  onComplete: (result: { requirementsMet: string[]; outcomeUrl: string }) => void;
  onChecklist?: (items: ChecklistItem[]) => void;
  onPage?: (page: PageModel) => void;
  /** Every friction inference (including FLUENT / UNKNOWN), for transparency UIs. */
  onFriction?: (inference: FrictionInference) => void;
}

export interface ObserverOptions {
  driver: IframeDriver;
  workflow: Workflow;
  requirements: Requirement[];
  hooks: ObserverHooks;
  hesitationThresholdMs?: number;
  pollMs?: number;
  /** Pointer / keyboard-metadata sensing (default true). Never raw text; never on sensitive fields. */
  sensing?: boolean;
  /** Policy constraints from the program (for POLICY_UNCERTAINTY). */
  policyConstraints?: string[];
}

export function anchorMatchesPage(anchor: SemanticAnchor, page: PageModel): boolean {
  if (anchor.routePattern && generalizeRoute(page.url) !== anchor.routePattern) return false;
  if (anchor.heading) {
    const target = anchor.heading;
    const ok = page.headings.some((h) => h === target || similarity(h, target) > 0.75) || similarity(page.heading, target) > 0.75;
    if (!ok) return false;
  }
  return true;
}

export class HumanObserver {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();
  private attachedDoc: Document | null = null;
  private currentIndex = -1;
  private stepEnteredAt = 0;
  private lastAlerts = new Set<string>();
  private hesitationFired = 0;
  private offWorkflowSince: number | null = null;
  private completed = false;
  private checklist = new Map<string, ChecklistItem>();
  private readonly threshold: number;
  private readonly pollMs: number;
  private pointer: PointerAggregator | null = null;
  private keyboard: KeyboardAggregator | null = null;
  private pointerWindows: PointerWindow[] = [];
  private keyboardWindows: KeyboardWindow[] = [];
  private targetKey: string | null = null;
  private targetRect: ElementRect | null = null;
  private targetSeen = false;
  private targetHoverMs = 0;
  private targetApproaches = 0;
  private targetWithdrawals = 0;
  private errorsOnStep = 0;
  private lastErrorAt: number | null = null;
  private backtracksOnStep = 0;
  private lastFrictionAt = 0;
  private lastFriction: FrictionInference | null = null;
  private lastPage: PageModel | null = null;
  private signaledStates = new Map<string, number>();
  private readonly onActivity = () => {
    this.lastActivity = Date.now();
  };

  constructor(private readonly opts: ObserverOptions) {
    this.threshold = opts.hesitationThresholdMs ?? 12_000;
    this.pollMs = opts.pollMs ?? 500;
    this.sensingOn = opts.sensing ?? true;
  }

  get currentStep(): WorkflowStep | null {
    return this.currentIndex >= 0 ? this.opts.workflow.steps[this.currentIndex] ?? null : null;
  }

  get latestFriction(): FrictionInference | null {
    return this.lastFriction;
  }

  /** Pause or resume interaction sensing (visible to the person). */
  setSensing(on: boolean) {
    if (on === this.sensingOn) return;
    this.sensingOn = on;
    if (!on) this.stopTelemetry();
    else if (this.attachedDoc) this.startTelemetry(this.attachedDoc);
  }
  private sensingOn = true;

  private startTelemetry(doc: Document) {
    if (!this.sensingOn || this.pointer) return;
    this.pointer = new PointerAggregator({
      doc,
      getElements: () => this.opts.driver.snapshot().elements,
      getName: (key) => this.lastPage?.elements.find((e) => e.key === key)?.name ?? key,
      getTarget: () => (this.targetKey && this.targetRect ? { key: this.targetKey, rect: this.targetRect } : null),
      onWindow: (w) => {
        this.pointerWindows = [...this.pointerWindows.slice(-9), w];
        if (w.targetSeen) this.targetSeen = true;
        this.targetHoverMs = w.targetHoverMs;
        this.targetApproaches = w.targetApproaches;
        this.targetWithdrawals = w.targetWithdrawals;
        if (w.sampleCount > 0 || w.clicks > 0) this.opts.hooks.onEvent("pointer_window", { ...w, hoverTargets: w.hoverTargets.slice(0, 3) }, this.currentStep?.id);
      },
    });
    this.keyboard = new KeyboardAggregator({
      doc,
      onWindow: (w) => {
        this.keyboardWindows = [...this.keyboardWindows.slice(-9), w];
        this.opts.hooks.onEvent("keyboard_window", { ...w }, this.currentStep?.id);
      },
    });
    this.pointer.start();
    this.keyboard.start();
  }

  private stopTelemetry() {
    this.pointer?.stop();
    this.keyboard?.stop();
    this.pointer = null;
    this.keyboard = null;
  }

  start() {
    if (this.timer) return;
    this.lastActivity = Date.now();
    this.timer = setInterval(() => this.tick(), this.pollMs);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.detach();
  }

  /** Mark activity from outside (e.g. the overlay was interacted with). */
  touch() {
    this.lastActivity = Date.now();
  }

  private attach(doc: Document) {
    if (this.attachedDoc === doc) return;
    this.detach();
    this.attachedDoc = doc;
    for (const ev of ["input", "change", "click", "keydown", "pointerdown", "scroll"]) doc.addEventListener(ev, this.onActivity, { capture: true, passive: true });
    this.startTelemetry(doc);
  }

  private detach() {
    if (!this.attachedDoc) return;
    for (const ev of ["input", "change", "click", "keydown", "pointerdown", "scroll"]) this.attachedDoc.removeEventListener(ev, this.onActivity, { capture: true });
    this.stopTelemetry();
    this.attachedDoc = null;
  }

  /** Resolve the current step's target control on the page (for hover / approach attribution). */
  private updateTarget(step: WorkflowStep | null, page: PageModel) {
    if (!step) {
      this.targetKey = null;
      this.targetRect = null;
      return;
    }
    // Prefer the first unmet requirement field, then the step's anchor element.
    let key: string | null = null;
    for (const a of step.actions) {
      const m = /^\{\{req:(\w+)(?::date)?\}\}$/.exec(a.value ?? "");
      if (!m) continue;
      if (this.checklist.get(m[1])?.met) continue;
      const hit = ground({ key: a.target, name: a.targetName, role: a.targetRole, kind: "field" }, page, 0.5);
      if (hit) {
        key = hit.element.key;
        break;
      }
    }
    // An unmet requirement whose field is hidden: the target is the control that reveals it.
    if (!key && step.reveals?.length) {
      const unmetHidden = step.actions.some((a) => {
        const m = /^\{\{req:(\w+)(?::date)?\}\}$/.exec(a.value ?? "");
        return m && !this.checklist.get(m[1])?.met && !ground({ key: a.target, name: a.targetName, role: a.targetRole, kind: "field" }, page, 0.5);
      });
      if (unmetHidden) {
        for (const name of step.reveals) {
          const hit = ground({ name, kind: "action" }, page, 0.45);
          if (hit && hit.element.expanded !== true) {
            key = hit.element.key;
            break;
          }
        }
      }
    }
    if (!key) {
      const hit = resolveAnchorRect(this.opts.driver, step.anchor, page);
      key = hit?.key ?? null;
    }
    if (key !== this.targetKey) {
      this.targetKey = key;
      this.targetSeen = false;
      this.targetHoverMs = 0;
      this.targetApproaches = 0;
      this.targetWithdrawals = 0;
      this.pointer?.resetTarget();
    }
    this.targetRect = key ? this.opts.driver.rectFor(key) : null;
  }

  private inferAndSignal(step: WorkflowStep, page: PageModel, now: number) {
    if (now - this.lastFrictionAt < 1500) return;
    this.lastFrictionAt = now;
    const pendingRequirements = step.requirementIds.filter((rid) => !this.checklist.get(rid)?.met).length;
    const inference = inferFriction(
      {
        stepId: step.id,
        timeInStepMs: now - this.stepEnteredAt,
        targetKnown: Boolean(this.targetKey),
        targetSeen: this.targetSeen,
        targetHoverMs: this.targetHoverMs,
        targetApproaches: this.targetApproaches,
        targetWithdrawals: this.targetWithdrawals,
        pointer: this.pointerWindows,
        keyboard: this.keyboardWindows,
        validationErrors: this.errorsOnStep,
        lastErrorAgoMs: this.lastErrorAt ? now - this.lastErrorAt : null,
        alertsVisible: page.alerts.length > 0,
        pendingRequirements,
        stepCommit: step.commit,
        stepJudgment: step.judgment,
        policyRelevant: Boolean(this.opts.policyConstraints?.length) || step.requirementIds.some((rid) => Boolean(this.opts.requirements.find((r) => r.id === rid)?.expectation?.acceptedValues?.length)),
        backtracks: this.backtracksOnStep,
        idleMs: now - this.lastActivity,
        sensing: this.sensingOn && Boolean(this.pointer),
      },
      now,
    );
    this.lastFriction = inference;
    this.opts.hooks.onFriction?.(inference);
    this.opts.hooks.onEvent("friction_inferred", { state: inference.state, confidence: inference.confidence, evidence: inference.evidence, alternatives: inference.alternatives, ruleVersion: inference.ruleVersion, targetKey: this.targetKey }, step.id, `${inference.state} (${Math.round(inference.confidence * 100)}%)`);
    // Raise a struggle signal for actionable states, at most once per state per step unless confidence grows.
    const actionable: Partial<Record<string, StruggleSignal["type"]>> = {
      VISUAL_SEARCH: "visual_search",
      DECISION_UNCERTAINTY: "decision_uncertainty",
      POLICY_UNCERTAINTY: "decision_uncertainty",
      ERROR_RECOVERY: "error_recovery",
      WORKFLOW_KNOWLEDGE_GAP: "hesitation",
      WORKFLOW_FRICTION: "hesitation",
    };
    const type = actionable[inference.state];
    if (!type || inference.confidence < 0.45) return;
    const k = `${step.id}:${inference.state}`;
    const prev = this.signaledStates.get(k) ?? 0;
    if (inference.confidence <= prev + 0.1) return;
    this.signaledStates.set(k, inference.confidence);
    this.opts.hooks.onSignal({ stepId: step.id, type, magnitude: inference.confidence, t: now, detail: inference.evidence[0], frictionState: inference.state, frictionConfidence: inference.confidence, evidence: inference.evidence });
  }

  private tick() {
    if (this.completed) return;
    const { driver, workflow, hooks, requirements } = this.opts;
    const doc = driver.doc;
    if (!doc || doc.readyState === "loading") return;
    this.attach(doc);
    const page = driver.snapshot().page;
    this.lastPage = page;
    hooks.onPage?.(page);
    const now = Date.now();

    // Completion?
    const onOutcome = workflow.outcomeRoutePattern ? generalizeRoute(page.url) === workflow.outcomeRoutePattern && page.definitions.length >= 2 : false;
    if (onOutcome) {
      const met = verifyRequirements(page, requirements);
      this.completed = true;
      if (this.currentStep) hooks.onEvent("step_completed", { title: this.currentStep.title }, this.currentStep.id, this.currentStep.title);
      hooks.onEvent("outcome_verified", { url: page.url, requirementsMet: met, labels: page.definitions.slice(0, 24).map((d) => d.label) }, undefined, `${met.length}/${requirements.filter((r) => r.kind === "field").length} requirements verified on the outcome screen`);
      hooks.onComplete({ requirementsMet: met, outcomeUrl: page.url });
      this.stop();
      return;
    }

    // Which step is the person on?
    const matches = workflow.steps.map((s, i) => ({ s, i })).filter(({ s }) => anchorMatchesPage(s.anchor, page));
    let next = -1;
    if (matches.length) {
      const forward = matches.filter(({ i }) => i >= this.currentIndex);
      next = forward.length ? forward[0].i : matches[matches.length - 1].i;
      // Prefer the later of two same-route entry steps once the form is reachable only via the second.
      if (forward.length > 1 && forward[0].i === this.currentIndex) next = this.currentIndex;
    }

    if (next === -1) {
      if (this.offWorkflowSince === null) this.offWorkflowSince = now;
      else if (now - this.offWorkflowSince > 8000 && this.currentIndex >= 0) {
        const step = this.currentStep!;
        hooks.onEvent("wrong_screen", { url: page.url }, step.id, `Left the workflow: ${page.heading || page.url}`);
        hooks.onSignal({ stepId: step.id, type: "wrong_screen", magnitude: 0.6, t: now, detail: page.url });
        this.offWorkflowSince = now + 60_000; // do not repeat for a while
      }
      return;
    }
    this.offWorkflowSince = null;

    if (next !== this.currentIndex) {
      const prev = this.currentStep;
      if (prev && next > this.currentIndex) hooks.onEvent("step_completed", { title: prev.title, durationMs: now - this.stepEnteredAt }, prev.id, prev.title);
      if (prev && next < this.currentIndex) {
        hooks.onEvent("backtrack", { from: prev.title, to: workflow.steps[next].title }, prev.id, `Went back to ${workflow.steps[next].title}`);
        hooks.onSignal({ stepId: prev.id, type: "backtrack", magnitude: 0.5, t: now });
        this.backtracksOnStep += 1;
      } else this.backtracksOnStep = 0;
      this.currentIndex = next;
      this.stepEnteredAt = now;
      this.lastActivity = now;
      this.hesitationFired = 0;
      this.errorsOnStep = 0;
      this.lastErrorAt = null;
      this.pointerWindows = [];
      this.keyboardWindows = [];
      this.lastAlerts = new Set(page.alerts);
      const step = workflow.steps[next];
      hooks.onEvent("step_entered", { title: step.title, mode: step.mode }, step.id, step.title);
      hooks.onStepChange(step, next, page);
    }

    const step = this.currentStep;
    if (!step) return;

    // Validation errors that just appeared.
    const newAlerts = page.alerts.filter((a) => !this.lastAlerts.has(a));
    if (newAlerts.length) {
      hooks.onEvent("validation_error", { alerts: newAlerts }, step.id, newAlerts.join(" / "));
      hooks.onSignal({ stepId: step.id, type: "validation_error", magnitude: 0.7, t: now, detail: newAlerts[0] });
      this.errorsOnStep += 1;
      this.lastErrorAt = now;
    }
    this.lastAlerts = new Set(page.alerts);

    // Live checklist.
    const items = this.updateChecklist(page);
    hooks.onChecklist?.(items);

    // Target for pointer attribution, then friction inference.
    this.updateTarget(step, page);
    this.inferAndSignal(step, page, now);

    // Hesitation (time-only fallback): used when sensing is off or the friction engine stays UNKNOWN.
    const idle = now - this.lastActivity;
    const pending = step.requirementIds.some((rid) => !this.checklist.get(rid)?.met) || step.commit;
    const factor = Math.pow(2, this.hesitationFired);
    const frictionSilent = !this.lastFriction || this.lastFriction.state === "UNKNOWN" || this.lastFriction.state === "FLUENT";
    if (pending && idle > this.threshold * factor && (frictionSilent || !this.sensingOn)) {
      this.hesitationFired += 1;
      hooks.onEvent("hesitation", { idleMs: idle }, step.id, `No activity for ${Math.round(idle / 1000)}s on ${step.title}`);
      hooks.onSignal({ stepId: step.id, type: "hesitation", magnitude: Math.min(1, idle / (this.threshold * 3)), t: now, detail: `${Math.round(idle / 1000)}s idle` });
      this.lastActivity = now;
    }
  }

  private updateChecklist(page: PageModel): ChecklistItem[] {
    const { workflow, requirements } = this.opts;
    for (const step of workflow.steps) {
      for (const a of step.actions) {
        const m = /^\{\{req:(\w+)(:date)?\}\}$/.exec(a.value ?? "");
        if (!m) continue;
        const rid = m[1];
        const isDateCompanion = Boolean(m[2]);
        const r = requirements.find((x) => x.id === rid);
        if (!r) continue;
        const hit = ground({ key: a.target, name: a.targetName, role: a.targetRole, kind: "field" }, page, 0.5);
        if (!hit) continue;
        const f = hit.element;
        const value = f.role === "checkbox" ? (f.checked ? f.name : "") : (f.value ?? "");
        const placeholder = /^(select|choose|--|unknown)/i.test(value) || !value.trim();
        const rejected = (r.expectation?.rejectedValues ?? []).map((x) => x.toLowerCase());
        const accepted = r.expectation?.acceptedValues ?? [];
        let met = !placeholder && !rejected.includes(value.toLowerCase());
        if (met && accepted.length && f.role !== "checkbox" && !/competitor|alternative/i.test(r.text)) met = accepted.some((v) => value.toLowerCase().includes(v.toLowerCase()));
        if (met && r.expectation?.withinDays && /\d{4}-\d{2}-\d{2}/.test(value)) {
          const days = (new Date(value).getTime() - Date.now()) / 86_400_000;
          met = days <= r.expectation.withinDays && days >= -1;
        }
        const existing = this.checklist.get(rid);
        // Checkbox groups: any checked option satisfies; do not un-meet because a sibling is unchecked.
        if (f.role === "checkbox" && !met && existing?.met) continue;
        // Date companion: only the date part decides the within-N-days check; the text part decides presence.
        if (isDateCompanion) {
          if (existing?.met || met) this.checklist.set(rid, { requirementId: rid, met: Boolean(existing?.met) && met, fieldName: f.name, value });
          continue;
        }
        if (r.expectation?.withinDays && existing?.fieldName && /date/i.test(existing.fieldName)) {
          this.checklist.set(rid, { requirementId: rid, met: met && existing.met, fieldName: existing.fieldName, value: existing.value });
          continue;
        }
        this.checklist.set(rid, { requirementId: rid, met, fieldName: f.name, value });
      }
    }
    return requirements.filter((r) => r.kind === "field").map((r) => this.checklist.get(r.id) ?? { requirementId: r.id, met: false });
  }
}

/** Live rectangle (iframe viewport coordinates) for an anchor, re-resolved semantically. */
export function resolveAnchorRect(driver: IframeDriver, anchor: SemanticAnchor | undefined, page: PageModel): { rect: ElementRect; key: string; name: string } | null {
  if (!anchor) return null;
  if (anchor.elementKey) {
    const r = driver.rectFor(anchor.elementKey);
    const el = page.elements.find((e) => e.key === anchor.elementKey);
    if (r && el) return { rect: r, key: el.key, name: el.name };
  }
  if (anchor.elementName) {
    const hit = ground({ name: anchor.elementName, role: anchor.role, kind: "any" }, page, 0.45);
    if (hit) {
      const r = driver.rectFor(hit.element.key);
      if (r) return { rect: r, key: hit.element.key, name: hit.element.name };
    }
  }
  return null;
}
