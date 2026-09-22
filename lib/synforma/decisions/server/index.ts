import type { DecisionStatus } from "../protocol";
import { DEFAULT_CLOUDFLARE_JEV_MODEL, JevCloudflareProvider } from "./jev-cloudflare";
import { DEFAULT_TYPESAFE_MODEL, JevTypeSafeProvider } from "./jev-typesafe";
import { DecisionProviderError, type DecisionProvider } from "./provider";

export type { DecisionProvider, DecideInput, DecideOutput } from "./provider";
export { DecisionProviderError, redact } from "./provider";

/**
 * Decision-provider registry. Server only.
 *
 * Jev (TypeSafe's System One model) can be reached two ways; the first
 * configured wins, DECISION_PROVIDER=typesafe|cloudflare pins one:
 *   - TYPESAFE_API_KEY                            → TypeSafe's API (jev-latest)
 *   - CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN → Cloudflare Workers AI (typesafe/jev)
 * JEV_MODEL overrides the model id on either route. Credentials are read here
 * only, never logged, never returned to the client (see /api/decide/status).
 */

const cache = new Map<string, DecisionProvider>();

function cached(id: string, make: () => DecisionProvider): DecisionProvider {
  let p = cache.get(id);
  if (!p) {
    p = make();
    cache.clear();
    cache.set(id, p);
  }
  return p;
}

export function getDecisionProvider(): DecisionProvider | null {
  const preferred = (process.env.DECISION_PROVIDER ?? "").trim().toLowerCase();
  const model = (process.env.JEV_MODEL ?? "").trim();
  const candidates: (() => DecisionProvider)[] = [];

  const typesafeKey = (process.env.TYPESAFE_API_KEY ?? "").trim();
  if (typesafeKey && (!preferred || preferred === "typesafe")) {
    const base = (process.env.TYPESAFE_BASE_URL ?? "").trim() || undefined;
    const id = model || DEFAULT_TYPESAFE_MODEL;
    candidates.push(() => cached(`typesafe:${id}:${base ?? ""}:${typesafeKey.length}:${typesafeKey.slice(-4)}`, () => new JevTypeSafeProvider(typesafeKey, id, fetch, base)));
  }

  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (accountId && token && (!preferred || preferred === "cloudflare")) {
    const id = model || DEFAULT_CLOUDFLARE_JEV_MODEL;
    candidates.push(() => cached(`cloudflare:${id}:${accountId}:${token.length}:${token.slice(-4)}`, () => new JevCloudflareProvider(accountId, token, id)));
  }

  return candidates.length ? candidates[0]() : null;
}

/** What the status endpoint may reveal. Never includes a credential. */
export function describeDecisionProvider(): DecisionStatus {
  const p = getDecisionProvider();
  return p ? { configured: true, provider: p.name, model: p.model, via: p.via } : { configured: false, provider: "none" };
}

/**
 * A fixed question with a known good answer, so an operator can see the
 * credentials, the route and the reply shape work before a demo. The state
 * describes a vendor rename the engine meets in the CRM replica.
 */
export const PROBE_QUESTION = {
  state:
    'Screen "New opportunity · Qualification" of a sales application. An automation learned this form before a vendor update; controls may have been renamed. ' +
    'It is looking for the field it knew as "Funding stage" (combobox; options: Requested, Approved, Allocated). ' +
    'Fields on the screen now: f1: "Budget confirmation" (combobox; options: Requested, Approved, Allocated). f2: "Decision-maker" (combobox; options: Helen Marsh, Sam Lee). f3: "Decision timeline" (combobox; options: This quarter, Next quarter).',
  questions: {
    field: {
      type: "choice" as const,
      instructions: 'Which field on the screen now is the same field the automation knew as "Funding stage"? Choose none_of_these when no field on this screen holds that value.',
      criteria: { f1: '"Budget confirmation" (combobox; options: Requested, Approved, Allocated)', f2: '"Decision-maker" (combobox)', f3: '"Decision timeline" (combobox)', none_of_these: "No field on this screen is that field" },
    },
  },
  expected: "f1",
};

export async function probeDecisionProvider(signal: AbortSignal): Promise<NonNullable<DecisionStatus["probe"]>> {
  const p = getDecisionProvider();
  if (!p) return { ok: false, detail: "no decision provider configured" };
  const t0 = Date.now();
  try {
    const out = await p.decide({ state: PROBE_QUESTION.state, questions: PROBE_QUESTION.questions, signal });
    const a = out.answers.field;
    const latencyMs = Date.now() - t0;
    if (a.type !== "choice") return { ok: false, latencyMs, detail: "unexpected answer type", route: out.route, model: out.model };
    const p1 = a.probabilities[a.choice] ?? 0;
    const label = a.choice === "none_of_these" ? "none of these" : PROBE_QUESTION.questions.field.criteria[a.choice as keyof typeof PROBE_QUESTION.questions.field.criteria] ?? a.choice;
    const agrees = a.choice === PROBE_QUESTION.expected;
    return {
      ok: true,
      latencyMs,
      route: out.route,
      model: out.model,
      detail: `chose ${label} with p ${p1.toFixed(2)}, confidence ${a.confidence.toFixed(2)}${agrees ? " (the expected answer)" : " (not the expected answer: the renamed field was f1)"}`,
    };
  } catch (e) {
    const latencyMs = Date.now() - t0;
    if (e instanceof DecisionProviderError) return { ok: false, latencyMs, detail: `${e.kind}: ${e.message}` };
    return { ok: false, latencyMs, detail: e instanceof Error ? e.message : String(e) };
  }
}
