import { roleCompatible } from "../interaction/grounding";
import type { SemanticElement, SynformaSettings } from "../types";
import { DecisionResponseSchema, DecisionStatusSchema, type ChoiceQuestion, type DecisionRequest, type DecisionResponse, type DecisionStatus } from "./protocol";
import { ACCEPT_PROBABILITY, type Decider, type FieldChoice, type FieldChoiceInput } from "./types";

export { ACCEPT_PROBABILITY } from "./types";
export type { Decider, FieldChoice, FieldChoiceInput } from "./types";
export type { DecisionStatus } from "./protocol";

/**
 * Browser-side decider: asks the server route small typed questions and turns
 * the calibrated answers into something the runner can act on. The decision
 * model (Jev) runs only on the server (app/api/decide); the browser never holds
 * a credential. Three rules keep a live run fast and predictable:
 *
 *  - Every call has a deadline (REMOTE_DECISION_DEADLINE_MS); a call that has
 *    not answered by then is abandoned and the lexical rules keep their say,
 *    with the reason recorded in `lastError` for the audit.
 *  - After MAX_FAILURES consecutive failures the decider stops calling for the
 *    rest of the run: a dead route costs one deadline per question, not many.
 *  - A choice below ACCEPT_PROBABILITY is reported but never acted on.
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

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function describeField(f: SemanticElement): string {
  const parts: string[] = [f.role];
  if (f.options?.length) parts.push(`options: ${f.options.slice(0, MAX_OPTIONS).map((o) => trim(o, 40)).join(", ")}${f.options.length > MAX_OPTIONS ? ", …" : ""}`);
  if (f.description) parts.push(`help: ${trim(f.description, 120)}`);
  if (f.region) parts.push(`section: ${trim(f.region, 60)}`);
  if (f.required) parts.push("required");
  return `"${trim(f.name, 80)}" (${parts.join("; ")})`;
}

/** Candidates a decision may land on: enabled fields whose role could be the expected control's. */
export function eligibleCandidates(input: FieldChoiceInput): SemanticElement[] {
  return input.candidates.filter((f) => !f.disabled && f.visible !== false && roleCompatible(input.expected.role, f.role)).slice(0, MAX_CANDIDATES);
}

/**
 * The question the runner asks: the screen's fields as labelled options plus
 * "none of these", and a state that says what the automation is looking for.
 * Only field names, roles, options, help text and the requirement's wording
 * travel; never a person's typed text.
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
    `Screen "${trim(screen.heading || "untitled", 80)}" at ${trim(screen.url, 80)} of a business application. An automation learned this form before a vendor update; since then controls may have been renamed, reordered or moved to other screens.`,
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

  async chooseField(input: FieldChoiceInput): Promise<FieldChoice | null> {
    const candidates = eligibleCandidates(input);
    if (!candidates.length) {
      this.lastError = "no field of a compatible role on this screen";
      return null;
    }
    const { state, question, labels } = buildFieldQuestion(input, candidates);
    const t0 = Date.now();
    const res = await this.decide({ state, questions: { field: question } });
    if (!res) return null;
    const a = res.answers.field;
    if (!a || a.type !== "choice") {
      this.lastError = "no answer to the field question";
      return null;
    }
    const probability = a.probabilities[a.choice] ?? 0;
    const latencyMs = res.latencyMs || Date.now() - t0;
    if (a.choice === NONE_LABEL) return { key: null, name: null, probability, confidence: a.confidence, latencyMs };
    const el = labels.get(a.choice);
    if (!el) {
      this.lastError = "the answer named an unknown option";
      return null;
    }
    return { key: el.key, name: el.name, probability, confidence: a.confidence, latencyMs };
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
