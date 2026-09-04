import type { IframeDriver } from "../interaction/driver";
import { generalizeRoute, pageStateLabel } from "../interaction/snapshot";
import type { ElementRole, ParsedObjective, PlannerKind, SemanticAnchor, Workflow, WorkflowStep } from "../types";
import type { DiscoveredState } from "./explorer";
import { requirementFieldScore } from "../planner/heuristic";

/**
 * Shadow mode / demonstration capture — build the system by watching experts.
 *
 * An experienced person performs the workflow once. Synforma records the
 * semantic trace (what was clicked, which fields changed, on which screen),
 * reconstructs a workflow, marks where it differs from what it planned, and
 * asks a few questions instead of guessing. Values typed are never recorded:
 * only that a field changed.
 */

export interface TraceEvent {
  t: number;
  kind: "click" | "change" | "navigate";
  key?: string;
  name?: string;
  role?: ElementRole;
  commit?: boolean;
  route: string;
  stateLabel: string;
  fingerprint: string;
  heading: string;
  stepHeading?: string;
  region?: string;
}

export class DemonstrationRecorder {
  private events: TraceEvent[] = [];
  private attached: Document | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRoute = "";
  private lastClick: { key: string; t: number } | null = null;
  private readonly onClick = (e: Event) => this.record("click", e.target as Element | null);
  private readonly onChange = (e: Event) => this.record("change", e.target as Element | null);
  /** Some menu triggers cancel the click event on pointerdown (Radix, others): capture the press itself. */
  private readonly onPointerDown = (e: Event) => {
    const target = (e.target as Element | null)?.closest("[aria-haspopup],[role='menuitem'],[role='tab']") ?? null;
    if (target) this.record("click", target);
  };

  constructor(private readonly driver: IframeDriver, private readonly onEvent?: (e: TraceEvent) => void) {}

  start() {
    this.events = [];
    this.timer = setInterval(() => this.tick(), 400);
    this.tick();
  }

  stop(): TraceEvent[] {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.detach();
    return this.events;
  }

  private tick() {
    const doc = this.driver.doc;
    if (!doc) return;
    if (this.attached !== doc) {
      this.detach();
      this.attached = doc;
      doc.addEventListener("click", this.onClick, { capture: true, passive: true });
      doc.addEventListener("change", this.onChange, { capture: true, passive: true });
      doc.addEventListener("pointerdown", this.onPointerDown, { capture: true, passive: true });
    }
    const route = this.driver.currentUrl();
    if (route !== this.lastRoute) {
      this.lastRoute = route;
      const page = this.driver.snapshot().page;
      this.push({ t: Date.now(), kind: "navigate", route: generalizeRoute(route), stateLabel: pageStateLabel(page), fingerprint: page.fingerprint, heading: page.heading, stepHeading: page.headings.find((h) => /step \d/i.test(h)) });
    }
  }

  private detach() {
    if (!this.attached) return;
    this.attached.removeEventListener("click", this.onClick, { capture: true });
    this.attached.removeEventListener("change", this.onChange, { capture: true });
    this.attached.removeEventListener("pointerdown", this.onPointerDown, { capture: true });
    this.attached = null;
  }

  private record(kind: "click" | "change", target: Element | null) {
    if (!target) return;
    const snap = this.driver.snapshot();
    const interactive = target.closest("a[href],button,input,select,textarea,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='combobox'],[role='option'],summary") ?? target;
    let key: string | undefined;
    for (const [k, el] of snap.elements) {
      if (el === interactive) {
        key = k;
        break;
      }
    }
    if (!key) return;
    const model = snap.page.elements.find((e) => e.key === key);
    if (!model) return;
    // Clicks on text inputs are focus, not actions; changes are what matter for fields.
    if (kind === "click" && ["textbox", "textarea", "combobox"].includes(model.role)) return;
    if (kind === "click" && (model.role === "checkbox" || model.role === "radio" || model.role === "switch")) return; // the change event records it
    if (kind === "click") {
      const now = Date.now();
      if (this.lastClick && this.lastClick.key === key && now - this.lastClick.t < 600) return; // pointerdown + click on the same control
      this.lastClick = { key, t: now };
    }
    const page = snap.page;
    this.push({
      t: Date.now(),
      kind,
      key,
      name: model.name,
      role: model.role,
      commit: model.commit,
      route: generalizeRoute(page.url),
      stateLabel: pageStateLabel(page),
      fingerprint: page.fingerprint,
      heading: page.heading,
      stepHeading: page.headings.find((h) => /step \d/i.test(h)),
      region: model.region,
    });
  }

  private push(e: TraceEvent) {
    this.events.push(e);
    this.onEvent?.(e);
  }
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  about: string;
  kind: "optional_action" | "commit_approval" | "judgment_field" | "deviation";
  options: string[];
}

export interface Reconstruction {
  workflow: Workflow;
  questions: ClarificationQuestion[];
  deviations: string[];
  summary: string;
}

const NEXT_RE = /^(next|continue|proceed)\b/i;

/**
 * Turn a demonstration trace into a workflow: one step per screen state the
 * person acted on, actions from clicks and field changes, commit detection
 * from the observed control classification, and questions where intent is
 * ambiguous.
 */
export function reconstructWorkflow(trace: TraceEvent[], opts: { objective?: ParsedObjective; states?: DiscoveredState[]; planned?: Workflow; startUrl: string; planner: PlannerKind; previousVersion?: string }): Reconstruction {
  const groups: { label: string; route: string; heading: string; stepHeading?: string; events: TraceEvent[] }[] = [];
  for (const e of trace) {
    const last = groups[groups.length - 1];
    const sameState = last && last.route === e.route && (last.stepHeading ?? "") === (e.stepHeading ?? "");
    if (!sameState) groups.push({ label: e.stateLabel, route: e.route, heading: e.heading, stepHeading: e.stepHeading, events: [] });
    if (e.kind !== "navigate") groups[groups.length - 1].events.push(e);
  }
  const acted = groups.filter((g) => g.events.length);
  const steps: WorkflowStep[] = [];
  const questions: ClarificationQuestion[] = [];
  const deviations: string[] = [];
  const requirements = opts.objective?.requirements.filter((r) => r.kind === "field") ?? [];
  const plannedNames = new Set((opts.planned?.steps ?? []).flatMap((s) => s.actions.map((a) => a.targetName ?? "")));

  acted.forEach((g, i) => {
    const actions: WorkflowStep["actions"] = [];
    const requirementIds: string[] = [];
    let commit = false;
    let judgment = false;
    const reveals: string[] = [];
    for (const e of g.events) {
      if (e.kind === "change" && e.key) {
        const field = opts.states?.flatMap((s) => s.page.fields).find((f) => f.key === e.key);
        let value = `{{field:${e.key}}}`;
        let req: string | undefined;
        if (field && requirements.length) {
          const best = requirements.map((r) => ({ r, s: requirementFieldScore(r, field) })).sort((a, b) => b.s - a.s)[0];
          if (best && best.s >= 0.3) {
            req = best.r.id;
            value = `{{req:${best.r.id}}}`;
            if (!requirementIds.includes(req)) requirementIds.push(req);
            if (best.r.judgment) judgment = true;
          }
        }
        const kind = e.role === "combobox" || e.role === "radio" ? "select" : e.role === "checkbox" || e.role === "switch" ? "check" : "type";
        actions.push({ kind, target: e.key, targetName: e.name, targetRole: e.role, targetRegion: e.region, value, label: req ? `${e.name} ← requirement ${req.replace("r", "")}` : `Fill ${e.name}` });
      } else if (e.kind === "click" && e.key) {
        const isNext = NEXT_RE.test(e.name ?? "");
        if (e.role === "tab" || (e.role === "button" && !isNext && !e.commit && /advanced|additional|more|details|show/i.test(e.name ?? ""))) {
          actions.push({ kind: "expand", target: e.key, targetName: e.name, targetRole: e.role, label: `Expand ${e.name}` });
          if (e.name) reveals.push(e.name);
          continue;
        }
        actions.push({ kind: "click", target: e.key, targetName: e.name, targetRole: e.role, targetCommit: Boolean(e.commit), targetRegion: e.region, label: e.commit ? `Click ${e.name}` : `${e.name}` });
        if (e.commit) commit = true;
        if (e.name && !plannedNames.has(e.name) && opts.planned) {
          deviations.push(`Clicked "${e.name}" on ${g.label}, which the planned workflow did not include.`);
          if (!isNext && !e.commit) {
            questions.push({ id: `q${questions.length + 1}`, question: `You clicked "${e.name}" on ${g.heading || g.label}. Was that required for the outcome, or just convenient?`, about: e.name, kind: "optional_action", options: ["Required", "Convenient", "Not needed"] });
          }
        }
      }
    }
    if (!actions.length) return;
    const title = g.stepHeading ? g.stepHeading.replace(/^step \d+ of \d+\s*[·:-]?\s*/i, "") || g.stepHeading : g.heading || g.label;
    const anchor: SemanticAnchor = { routePattern: g.route, heading: g.stepHeading ?? g.heading, elementName: actions[0]?.targetName, role: actions[0]?.targetRole };
    steps.push({
      id: `d${i + 1}`,
      index: steps.length,
      title,
      description: `Demonstrated: ${actions.map((a) => a.label).join(", ")}.`,
      route: g.route,
      actions,
      requirementIds,
      mode: judgment ? "guide" : commit ? "act" : requirementIds.length ? "assist" : "act",
      modeRationale: judgment ? "The demonstration touched fields that need human judgment." : commit ? "The commit is approval-gated." : "Derived from the demonstration; values can be prepared from context.",
      commit,
      judgment,
      anchor,
      reveals,
    });
    if (commit) {
      questions.push({ id: `q${questions.length + 1}`, question: `"${actions.find((a) => a.targetCommit)?.targetName ?? "The final action"}" commits the record. Should Synforma always ask for approval before it?`, about: "commit", kind: "commit_approval", options: ["Always ask", "Ask above a threshold", "Never automate"] });
    }
  });

  const judgmentFields = steps.flatMap((s) => s.actions.filter((a) => a.value?.startsWith("{{req:") && requirements.find((r) => `{{req:${r.id}}}` === a.value)?.judgment).map((a) => a.targetName ?? ""));
  if (judgmentFields.length) {
    questions.push({ id: `q${questions.length + 1}`, question: `Which of these needed your judgment rather than a default: ${judgmentFields.join(", ")}?`, about: judgmentFields.join(", "), kind: "judgment_field", options: ["All of them", "Some of them", "None"] });
  }

  const version = bumpVersion(opts.previousVersion ?? opts.planned?.version ?? "1.0");
  const workflow: Workflow = {
    id: `wf_${Date.now().toString(36)}`,
    title: opts.planned?.title ?? opts.objective?.title ?? "Demonstrated workflow",
    startUrl: opts.startUrl,
    steps,
    successCriteria: opts.planned?.successCriteria ?? requirements.map((r) => r.text),
    outcomeRoutePattern: opts.planned?.outcomeRoutePattern,
    confidence: Math.min(0.9, 0.5 + steps.length * 0.05),
    version,
    origin: "demonstration",
    changelog: [...(opts.planned?.changelog ?? []), { version, at: Date.now(), reason: "Reconstructed from an expert demonstration", source: "demonstration" }],
    governance: { status: "discovered" },
  };
  const summary = `${steps.length} step(s) reconstructed from ${trace.filter((e) => e.kind !== "navigate").length} observed action(s)${opts.planned ? `; ${deviations.length} deviation(s) from the planned workflow` : ""}; ${questions.slice(0, 3).length} question(s) to confirm.`;
  return { workflow, questions: questions.slice(0, 3), deviations, summary };
}

export function bumpVersion(v: string): string {
  const [major, minor] = v.split(".").map((n) => Number(n) || 0);
  return `${major}.${minor + 1}`;
}
