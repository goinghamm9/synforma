import type { IframeDriver } from "../interaction/driver";
import { ground } from "../interaction/grounding";
import { generalizeRoute } from "../interaction/snapshot";
import { similarity } from "../interaction/text";
import { verifyRequirements } from "./runner";
import type { ElementRect, PageModel, Requirement, RunEventType, SemanticAnchor, StruggleSignal, Workflow, WorkflowStep } from "../types";

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
}

export interface ObserverOptions {
  driver: IframeDriver;
  workflow: Workflow;
  requirements: Requirement[];
  hooks: ObserverHooks;
  hesitationThresholdMs?: number;
  pollMs?: number;
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
  private readonly onActivity = () => {
    this.lastActivity = Date.now();
  };

  constructor(private readonly opts: ObserverOptions) {
    this.threshold = opts.hesitationThresholdMs ?? 12_000;
    this.pollMs = opts.pollMs ?? 500;
  }

  get currentStep(): WorkflowStep | null {
    return this.currentIndex >= 0 ? this.opts.workflow.steps[this.currentIndex] ?? null : null;
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
  }

  private detach() {
    if (!this.attachedDoc) return;
    for (const ev of ["input", "change", "click", "keydown", "pointerdown", "scroll"]) this.attachedDoc.removeEventListener(ev, this.onActivity, { capture: true });
    this.attachedDoc = null;
  }

  private tick() {
    if (this.completed) return;
    const { driver, workflow, hooks, requirements } = this.opts;
    const doc = driver.doc;
    if (!doc || doc.readyState === "loading") return;
    this.attach(doc);
    const page = driver.snapshot().page;
    hooks.onPage?.(page);
    const now = Date.now();

    // Completion?
    const onOutcome = workflow.outcomeRoutePattern ? generalizeRoute(page.url) === workflow.outcomeRoutePattern && page.definitions.length >= 2 : false;
    if (onOutcome) {
      const met = verifyRequirements(page, requirements);
      this.completed = true;
      if (this.currentStep) hooks.onEvent("step_completed", { title: this.currentStep.title }, this.currentStep.id, this.currentStep.title);
      hooks.onEvent("outcome_verified", { url: page.url, requirementsMet: met, definitions: page.definitions.slice(0, 24) }, undefined, `${met.length}/${requirements.filter((r) => r.kind === "field").length} requirements verified on the outcome screen`);
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
      }
      this.currentIndex = next;
      this.stepEnteredAt = now;
      this.lastActivity = now;
      this.hesitationFired = 0;
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
    }
    this.lastAlerts = new Set(page.alerts);

    // Live checklist.
    const items = this.updateChecklist(page);
    hooks.onChecklist?.(items);

    // Hesitation: no activity for a while while the step is still incomplete.
    const idle = now - this.lastActivity;
    const pending = step.requirementIds.some((rid) => !this.checklist.get(rid)?.met) || step.commit;
    const factor = Math.pow(2, this.hesitationFired);
    if (pending && idle > this.threshold * factor) {
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
