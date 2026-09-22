import { roleCompatible } from "../interaction/grounding";
import type { SemanticElement, SynformaSettings } from "../types";
import { DecisionResponseSchema, DecisionStatusSchema, type ChoiceQuestion, type DecisionAnswer, type DecisionQuestion, type DecisionRequest, type DecisionResponse, type DecisionStatus } from "./protocol";
import {
  ACCEPT_PROBABILITY,
  type CommitAssessment,
  type CommitAssessmentInput,
  type ControlChoice,
  type ControlChoiceInput,
  type Decider,
  type FieldChoice,
  type FieldChoiceInput,
  type JudgmentAssessment,
  type JudgmentAssessmentInput,
  type MappingChoice,
  type MappingChoiceInput,
} from "./types";

export { ACCEPT_PROBABILITY, COMMIT_PROBABILITY, JUDGMENT_PROBABILITY } from "./types";
export type { CommitAssessment, CommitAssessmentInput, ControlChoice, ControlChoiceInput, Decider, FieldChoice, FieldChoiceInput, JudgmentAssessment, JudgmentAssessmentInput, MappingChoice, MappingChoiceInput } from "./types";
export type { DecisionStatus } from "./protocol";

/**
 * Browser-side decider: asks the server route small typed questions and turns
 * the calibrated answers into something the engine can act on. The decision
 * model (Jev) runs only on the server (app/api/decide); the browser never holds
 * a credential. Three rules keep a live run fast and predictable:
 *
 *  - Every call has a deadline (REMOTE_DECISION_DEADLINE_MS); a call that has
 *    not answered by then is abandoned and the lexical rules keep their say,
 *    with the reason recorded in `lastError` for the audit.
 *  - After MAX_FAILURES consecutive failures the decider stops calling for the
 *    rest of the run: a dead route costs one deadline per question, not many.
 *  - A choice below ACCEPT_PROBABILITY is reported but never acted on.
 *
 * Four questions exist. The runner asks which field (or which control) on the
 * screen is the one the plan knew; discovery asks which of a menu's items would
 * commit data; planning asks where a requirement goes and whether it needs a
 * person's judgment. Only names, roles, options, help text, headings, routes
 * and the objective's wording travel; never a person's typed text.
 */

let cachedStatus: DecisionStatus | null = null;

/** Ask the server whether a decision model is configured. Never exposes a credential. */
export async function fetchDecisionStatus(): Promise<DecisionStatus> {
  if (cachedStatus) return cachedStatus;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/decide/status`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    cachedStatus = DecisionStatusSchema.parse(await res.json());
  } catch {
    cachedStatus = { configured: false, provider: "none" };
  }
  return cachedStatus;
}

/** Longest wait for one decision. A decision takes milliseconds; the route's own deadline is 6 s. */
export const REMOTE_DECISION_DEADLINE_MS = 4_000;
/** Consecutive failures after which the decider goes quiet for the rest of the run. */
export const MAX_FAILURES = 3;
export const NONE_LABEL = "none_of_these";
const MAX_CANDIDATES = 30;
const MAX_OPTIONS = 12;
/** Questions per call (the route accepts up to eight). */
const MAX_QUESTIONS = 8;

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function describeField(f: SemanticElement): string {
  const parts: string[] = [f.role];
  if (f.inputType && f.inputType !== "text") parts.push(f.inputType);
  if (f.options?.length) parts.push(`options: ${f.options.slice(0, MAX_OPTIONS).map((o) => trim(o, 40)).join(", ")}${f.options.length > MAX_OPTIONS ? ", …" : ""}`);
  if (f.description) parts.push(`help: ${trim(f.description, 120)}`);
  if (f.region) parts.push(`section: ${trim(f.region, 60)}`);
  if (f.required) parts.push("required");
  return `"${trim(f.name, 80)}" (${parts.join("; ")})`;
}

function describeControl(c: SemanticElement): string {
  const parts: string[] = [c.role === "menuitem" ? "menu item" : c.role];
  if (c.popup) parts.push("opens a menu");
  if (c.role === "tab") parts.push(c.expanded ? "selected tab" : "tab, not selected");
  else if (c.expanded === false) parts.push("collapsed section");
  if (c.href) parts.push(`link to ${trim(c.href.split("?")[0], 60)}`);
  if (c.commit) parts.push("commits data by its wording");
  if (c.inDialog) parts.push("in a dialog");
  if (c.region) parts.push(`section: ${trim(c.region, 60)}`);
  return `"${trim(c.name, 80)}" (${parts.join("; ")})`;
}

const intro = (screen: { heading: string; url: string }, what: string) =>
  `Screen "${trim(screen.heading || "untitled", 80)}" at ${trim(screen.url, 80)} of a business application. An automation learned this ${what} before a vendor update; since then controls may have been renamed, reordered, moved into menus or moved to other screens.`;

/** Candidates a field decision may land on: enabled fields whose role could be the expected control's. */
export function eligibleCandidates(input: FieldChoiceInput): SemanticElement[] {
  return input.candidates.filter((f) => !f.disabled && f.visible !== false && roleCompatible(input.expected.role, f.role)).slice(0, MAX_CANDIDATES);
}

/** Candidates a control decision may land on: enabled controls of a compatible role, on the plan's side of the commit line. */
export function eligibleControls(input: ControlChoiceInput): SemanticElement[] {
  const wantCommit = Boolean(input.expected.commit);
  return input.candidates.filter((c) => !c.disabled && c.visible !== false && roleCompatible(input.expected.role, c.role) && (wantCommit ? Boolean(c.commit) : !c.commit)).slice(0, MAX_CANDIDATES);
}

/**
 * The field question: the screen's fields as labelled options plus "none of these", and a state that says what the
 * automation is looking for.
 */
export function buildFieldQuestion(input: FieldChoiceInput, candidates: SemanticElement[]): { state: string; question: ChoiceQuestion; labels: Map<string, SemanticElement> } {
  const { expected, screen } = input;
  const labels = new Map<string, SemanticElement>();
  const criteria: Record<string, string> = {};
  candidates.forEach((f, i) => {
    const label = `f${i + 1}`;
    labels.set(label, f);
    criteria[label] = describeField(f);
  });
  criteria[NONE_LABEL] = "No field on this screen is that field";
  const lines = [
    intro(screen, "form"),
    `It is looking for the field it knew as "${trim(expected.name, 80)}"${expected.role ? ` (${expected.role})` : ""}${expected.region ? ` under "${trim(expected.region, 60)}"` : ""}${expected.value ? `, to set it to "${trim(expected.value, 60)}"` : ""}.`,
    ...(expected.requirement ? [`The objective requirement behind that field: "${trim(expected.requirement, 200)}".`] : []),
    "Fields on the screen now:",
    ...candidates.map((f, i) => `f${i + 1}: ${describeField(f)}`),
  ];
  const question: ChoiceQuestion = {
    type: "choice",
    instructions: `Which field on the screen now is the same field the automation knew as "${trim(expected.name, 80)}"? Choose ${NONE_LABEL} when no field on this screen holds that value (it may be on a later screen of the form).`,
    criteria,
  };
  return { state: lines.join("\n"), question, labels };
}

/** The control question: the screen's controls of the right kind as labelled options plus "none of these". */
export function buildControlQuestion(input: ControlChoiceInput, candidates: SemanticElement[]): { state: string; question: ChoiceQuestion; labels: Map<string, SemanticElement> } {
  const { expected, screen } = input;
  const labels = new Map<string, SemanticElement>();
  const criteria: Record<string, string> = {};
  candidates.forEach((c, i) => {
    const label = `c${i + 1}`;
    labels.set(label, c);
    criteria[label] = describeControl(c);
  });
  criteria[NONE_LABEL] = "No control on this screen does that";
  const lines = [
    intro(screen, "workflow"),
    `It is about to: ${trim(expected.label, 120)}${expected.purpose ? ` (step "${trim(expected.purpose, 80)}")` : ""}. The control it knew as "${trim(expected.name, 80)}"${expected.role ? ` (${expected.role === "menuitem" ? "menu item" : expected.role})` : ""}${expected.region ? ` under "${trim(expected.region, 60)}"` : ""} ${expected.commit ? "commits data (creates, submits or deletes)" : "does not commit data"}.`,
    "Controls on the screen now:",
    ...candidates.map((c, i) => `c${i + 1}: ${describeControl(c)}`),
  ];
  const question: ChoiceQuestion = {
    type: "choice",
    instructions: `Which control on the screen now is the one the automation knew as "${trim(expected.name, 80)}"? Choose ${NONE_LABEL} when no control here does that.`,
    criteria,
  };
  return { state: lines.join("\n"), question, labels };
}

/** One yes / no question per control: would activating it commit data? At most MAX_QUESTIONS controls per call. */
export function buildCommitQuestions(input: CommitAssessmentInput, controls: SemanticElement[]): { state: string; questions: Record<string, DecisionQuestion>; labels: Map<string, SemanticElement> } {
  const labels = new Map<string, SemanticElement>();
  const questions: Record<string, DecisionQuestion> = {};
  const lines = [
    `Screen "${trim(input.screen.heading || "untitled", 80)}" at ${trim(input.screen.url, 80)} of a business application. ${input.context ? trim(input.context, 160) : "Controls on the screen"}; an automation must know which ones would change data before it tries any of them:`,
  ];
  controls.slice(0, MAX_QUESTIONS).forEach((c, i) => {
    const label = `c${i + 1}`;
    labels.set(label, c);
    lines.push(`${label}: ${describeControl(c)}`);
    questions[label] = {
      type: "noul",
      instructions: `Activating ${label} ("${trim(c.name, 80)}") immediately creates, changes, sends, archives or deletes business data (a commit that takes effect without a further form, wizard or confirmation step), rather than navigating, opening a form, a wizard or a dialog, revealing more of the screen, filtering, or editing something not yet saved.`,
    };
  });
  return { state: lines.join("\n"), questions, labels };
}

/** The mapping question: the discovered fields most like the requirement as labelled options plus "none of these". */
export function buildMappingQuestion(input: MappingChoiceInput, candidates: MappingChoiceInput["candidates"]): { state: string; question: ChoiceQuestion; labels: Map<string, SemanticElement> } {
  const labels = new Map<string, SemanticElement>();
  const criteria: Record<string, string> = {};
  candidates.forEach((c, i) => {
    const label = `f${i + 1}`;
    labels.set(label, c.field);
    criteria[label] = `${describeField(c.field)} [${trim(c.screen, 60)}]`;
  });
  criteria[NONE_LABEL] = "No discovered field holds this requirement's value";
  const lines = [
    `An objective for ${input.appName ? trim(input.appName, 60) : "a business application"} requires: "${trim(input.requirement.text, 240)}".${input.objective ? ` The full objective: "${trim(input.objective, 600)}".` : ""}`,
    "Fields discovered in the application (the screen in brackets):",
    ...candidates.map((c, i) => `f${i + 1}: ${describeField(c.field)} [${trim(c.screen, 60)}]`),
  ];
  const question: ChoiceQuestion = {
    type: "choice",
    instructions: `Which field is where this requirement's value is entered or chosen? Choose ${NONE_LABEL} when no field holds it.`,
    criteria,
  };
  return { state: lines.join("\n"), question, labels };
}

/** One yes / no question per requirement: does satisfying it need a person's judgment? At most MAX_QUESTIONS per call. */
export function buildJudgmentQuestions(input: JudgmentAssessmentInput, requirements: JudgmentAssessmentInput["requirements"]): { state: string; questions: Record<string, DecisionQuestion>; labels: Map<string, string> } {
  const labels = new Map<string, string>();
  const questions: Record<string, DecisionQuestion> = {};
  const lines = [`Requirements from an objective for ${input.appName ? trim(input.appName, 60) : "a business application"}.${input.objective ? ` The objective: "${trim(input.objective, 600)}".` : ""}`];
  requirements.slice(0, MAX_QUESTIONS).forEach((r, i) => {
    const label = `q${i + 1}`;
    labels.set(label, r.id);
    lines.push(`${label}: "${trim(r.text, 240)}"`);
    questions[label] = {
      type: "noul",
      instructions: `Satisfying ${label} needs a person's own judgment or knowledge (who decides, what is funded, an approval, a relationship, a risk call), rather than a value that follows from the record, the work context or a default.`,
    };
  });
  return { state: lines.join("\n"), questions, labels };
}

export class RemoteDecider implements Decider {
  readonly name = "Jev";
  lastError: string | null = null;
  /** Consecutive failures; at MAX_FAILURES the decider stops calling until reset(). */
  failures = 0;
  asked = 0;
  answered = 0;

  constructor(
    private readonly endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/decide`,
    private readonly deadlineMs = REMOTE_DECISION_DEADLINE_MS,
  ) {}

  get silenced(): boolean {
    return this.failures >= MAX_FAILURES;
  }

  reset() {
    this.failures = 0;
    this.lastError = null;
  }

  private fail(reason: string) {
    this.failures += 1;
    this.lastError = reason;
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse | null> {
    if (this.silenced) {
      this.lastError = `not consulted after ${MAX_FAILURES} failures (${this.lastError ?? "unavailable"})`;
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deadlineMs);
    this.asked += 1;
    try {
      const res = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal: controller.signal });
      if (!res.ok) {
        let detail = "";
        try {
          const j = (await res.json()) as { error?: unknown };
          detail = typeof j?.error === "string" ? j.error : "";
        } catch {
          detail = "";
        }
        this.fail(`Decision API ${res.status}${detail ? `: ${detail}` : ""}`);
        return null;
      }
      const parsed = DecisionResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        this.fail("Decision API returned an unexpected shape");
        return null;
      }
      this.failures = 0;
      this.lastError = null;
      this.answered += 1;
      return parsed.data;
    } catch (e) {
      const seconds = this.deadlineMs < 1000 ? (this.deadlineMs / 1000).toFixed(1) : String(Math.round(this.deadlineMs / 1000));
      this.fail(controller.signal.aborted ? `no answer within ${seconds} s` : e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** A choice answer back to the element it names; null (with the reason) when it names nothing usable. */
  private interpret(answer: DecisionAnswer | undefined, labels: Map<string, SemanticElement>, latencyMs: number, what: string): FieldChoice | null {
    if (!answer || answer.type !== "choice") {
      this.lastError = `no answer to the ${what} question`;
      return null;
    }
    const probability = answer.probabilities[answer.choice] ?? 0;
    if (answer.choice === NONE_LABEL) return { key: null, name: null, probability, confidence: answer.confidence, latencyMs };
    const el = labels.get(answer.choice);
    if (!el) {
      this.lastError = "the answer named an unknown option";
      return null;
    }
    return { key: el.key, name: el.name, probability, confidence: answer.confidence, latencyMs };
  }

  async chooseField(input: FieldChoiceInput): Promise<FieldChoice | null> {
    const candidates = eligibleCandidates(input);
    if (!candidates.length) {
      this.lastError = "no field of a compatible role on this screen";
      return null;
    }
    const { state, question, labels } = buildFieldQuestion(input, candidates);
    const t0 = Date.now();
    const res = await this.decide({ state, questions: { field: question } });
    return res ? this.interpret(res.answers.field, labels, res.latencyMs || Date.now() - t0, "field") : null;
  }

  async chooseControl(input: ControlChoiceInput): Promise<ControlChoice | null> {
    const candidates = eligibleControls(input);
    if (!candidates.length) {
      this.lastError = "no control of a compatible kind on this screen";
      return null;
    }
    const { state, question, labels } = buildControlQuestion(input, candidates);
    const t0 = Date.now();
    const res = await this.decide({ state, questions: { control: question } });
    return res ? this.interpret(res.answers.control, labels, res.latencyMs || Date.now() - t0, "control") : null;
  }

  async assessCommits(input: CommitAssessmentInput): Promise<CommitAssessment[] | null> {
    const out: CommitAssessment[] = [];
    for (let i = 0; i < input.controls.length; i += MAX_QUESTIONS) {
      const batch = input.controls.slice(i, i + MAX_QUESTIONS);
      const { state, questions, labels } = buildCommitQuestions(input, batch);
      const res = await this.decide({ state, questions });
      if (!res) return out.length ? out : null;
      for (const [label, el] of labels) {
        const a = res.answers[label];
        if (a?.type === "noul") out.push({ key: el.key, name: el.name, commit: a.noul });
      }
    }
    return out;
  }

  async chooseMapping(input: MappingChoiceInput): Promise<MappingChoice | null> {
    const candidates = input.candidates.slice(0, MAX_CANDIDATES);
    if (!candidates.length) {
      this.lastError = "no discovered field to choose from";
      return null;
    }
    const { state, question, labels } = buildMappingQuestion(input, candidates);
    const t0 = Date.now();
    const res = await this.decide({ state, questions: { mapping: question } });
    return res ? this.interpret(res.answers.mapping, labels, res.latencyMs || Date.now() - t0, "mapping") : null;
  }

  async assessJudgment(input: JudgmentAssessmentInput): Promise<JudgmentAssessment[] | null> {
    const out: JudgmentAssessment[] = [];
    for (let i = 0; i < input.requirements.length; i += MAX_QUESTIONS) {
      const batch = input.requirements.slice(i, i + MAX_QUESTIONS);
      const { state, questions, labels } = buildJudgmentQuestions(input, batch);
      const res = await this.decide({ state, questions });
      if (!res) return out.length ? out : null;
      for (const [label, id] of labels) {
        const a = res.answers[label];
        if (a?.type === "noul") out.push({ id, judgment: a.noul });
      }
    }
    return out;
  }
}

/** The decider a run should use: null when the person turned decisions off or the server has no credentials. */
export function createDecider(status: DecisionStatus | null | undefined, preference: SynformaSettings["decisionPreference"]): RemoteDecider | null {
  if (preference === "off" || !status?.configured) return null;
  return new RemoteDecider();
}

export function decisionViaLabel(via: string | undefined): string {
  return via === "cloudflare" ? "Cloudflare Workers AI" : via === "typesafe" ? "TypeSafe API" : via ?? "";
}

/** Honest label for prose and badges ("Jev · Cloudflare Workers AI · typesafe/jev"). */
export function deciderLabel(status: DecisionStatus | null | undefined): string {
  if (!status?.configured) return "No decision model";
  const via = decisionViaLabel(status.via);
  return ["Jev", via, status.model].filter(Boolean).join(" · ");
}

/** Whether a decision is worth acting on. */
export function acceptable(choice: FieldChoice | null): choice is FieldChoice & { key: string } {
  return Boolean(choice && choice.key && choice.probability >= ACCEPT_PROBABILITY);
}
