import type { DecisionAnswer, DecisionQuestion } from "../protocol";

/**
 * Provider abstraction for the server-side decision model (TypeSafe's Jev).
 *
 * A provider turns (state, questions) into one answer per question. It knows
 * nothing about Synforma's questions: the browser decider decides what to
 * ask, protocol.ts decides what is acceptable, and the route validates.
 * Two transports exist (Cloudflare Workers AI and TypeSafe's own API); both
 * return the shape of TypeSafe's SDK, normalised here.
 *
 * Server only. Never import from client components.
 */

export interface DecideInput {
  state: string;
  questions: Record<string, DecisionQuestion>;
  /** Abort when the route's deadline passes. */
  signal?: AbortSignal;
}

export interface DecideOutput {
  answers: Record<string, DecisionAnswer>;
  /** The model the host reports it ran ("jev-1.13"); falls back to the configured id. */
  model: string;
  /** Which request form the host accepted, for diagnostics. */
  route?: string;
}

export interface DecisionProvider {
  /** Model family shown in the UI. Never a secret. */
  readonly name: "jev";
  /** Configured model id ("typesafe/jev", "jev-latest"). */
  readonly model: string;
  /** Transport: "cloudflare" (Workers AI) or "typesafe" (api.typesafe.ai). */
  readonly via: "cloudflare" | "typesafe";
  decide(input: DecideInput): Promise<DecideOutput>;
}

export type DecisionErrorKind = "transport" | "auth" | "billing" | "route" | "output" | "aborted";

/** Raised by providers. Messages never contain a credential. */
export class DecisionProviderError extends Error {
  constructor(
    message: string,
    readonly kind: DecisionErrorKind = "transport",
  ) {
    super(message);
    this.name = "DecisionProviderError";
  }
}

/** Remove a secret from any string that might reach a log or a response body. */
export function redact(text: string, secret: string | undefined): string {
  if (!secret || secret.length < 6) return text;
  return text.split(secret).join("[redacted]");
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Find the answers map in a host's reply. TypeSafe's API returns `{ model, answers, usage }` at the top level;
 * Cloudflare wraps a model's output in `result` (and some catalog routes in `result.output`).
 */
export function extractAnswers(json: unknown): { answers: Record<string, unknown>; model?: string } | null {
  const candidates: unknown[] = [json];
  if (isRecord(json)) {
    candidates.push(json.result);
    if (isRecord(json.result)) candidates.push(json.result.output, json.result.response);
    candidates.push(json.output, json.response);
  }
  for (const c of candidates) {
    if (isRecord(c) && isRecord(c.answers)) return { answers: c.answers, model: typeof c.model === "string" ? c.model : undefined };
  }
  return null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Confidence as a number in [0, 1]; some hosts label it ("high", "medium", "low"). */
function asConfidence(v: unknown, fallback: number): number {
  const n = asNumber(v);
  if (n !== null) return clamp01(n);
  if (typeof v === "string") {
    const word = v.toLowerCase();
    if (/^(very )?high$/.test(word)) return 0.9;
    if (/^(medium|moderate)$/.test(word)) return 0.6;
    if (/^(very )?low$/.test(word)) return 0.3;
  }
  return clamp01(fallback);
}

/**
 * One raw answer into the protocol's shape. Tolerant of the field names seen
 * across hosts (`choice` / `answer` / `value`, `probabilities` / `distribution`,
 * a lone `probability`), strict about meaning: a choice must be one of the
 * question's own labels, probabilities must be numbers in [0, 1].
 */
export function normalizeAnswer(raw: unknown, question: DecisionQuestion): DecisionAnswer | null {
  if (question.type === "noul") {
    const r = isRecord(raw) ? raw : { noul: raw };
    const v = r.noul ?? r.probability ?? r.p ?? r.answer ?? r.value;
    if (typeof v === "boolean") return { type: "noul", noul: v ? 1 : 0 };
    const n = asNumber(v);
    return n === null ? null : { type: "noul", noul: clamp01(n) };
  }
  if (!isRecord(raw)) return null;
  const labels = Object.keys(question.criteria);
  const chosen = raw.choice ?? raw.answer ?? raw.value ?? raw.label ?? raw.option;
  if (typeof chosen !== "string" || !labels.includes(chosen)) return null;
  const dist = isRecord(raw.probabilities) ? raw.probabilities : isRecord(raw.distribution) ? raw.distribution : isRecord(raw.probs) ? raw.probs : null;
  const probabilities: Record<string, number> = {};
  if (dist) {
    for (const [label, p] of Object.entries(dist)) {
      const n = asNumber(p);
      if (n !== null && labels.includes(label)) probabilities[label] = clamp01(n);
    }
  }
  if (!(chosen in probabilities)) {
    const lone = asNumber(raw.probability ?? raw.p);
    if (lone !== null) probabilities[chosen] = clamp01(lone);
  }
  if (!(chosen in probabilities)) return null;
  const confidence = asConfidence(raw.confidence, probabilities[chosen]);
  return { type: "choice", choice: chosen, confidence, probabilities };
}

/** Every question answered, or an "output" error naming the first one that was not. */
export function normalizeAnswers(raw: Record<string, unknown>, questions: Record<string, DecisionQuestion>): Record<string, DecisionAnswer> {
  const out: Record<string, DecisionAnswer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = normalizeAnswer(raw[name], q);
    if (!a) throw new DecisionProviderError(`the reply has no usable answer for question "${name}"`, "output");
    out[name] = a;
  }
  return out;
}

/** Cloudflare's `errors: [{ code, message }]` (or a bare message) as one line. */
export function hostErrors(json: unknown): string {
  if (!isRecord(json)) return "";
  const list = Array.isArray(json.errors) ? json.errors : [];
  const messages = list.map((e) => (isRecord(e) ? [e.code, e.message].filter(Boolean).join(" ") : String(e))).filter(Boolean);
  if (messages.length) return messages.join("; ");
  if (typeof json.error === "string") return json.error;
  if (isRecord(json.error) && typeof json.error.message === "string") return json.error.message;
  if (typeof json.message === "string") return json.message;
  return "";
}

export function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}
