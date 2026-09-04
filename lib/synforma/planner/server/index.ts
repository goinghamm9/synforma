import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "./gemini-provider";
import type { LLMProvider } from "./provider";

export type { LLMProvider, GenerateJSONInput } from "./provider";
export { ProviderError, redact } from "./provider";

/**
 * Provider registry. Server only.
 *
 * Today one provider exists (Gemini). To add another:
 *   1. Create `./<vendor>-provider.ts` implementing `LLMProvider` from
 *      ./provider.ts. `generateJSON` receives a standard JSON Schema; adapt it
 *      to the vendor's structured-output mechanism there (Gemini: responseSchema;
 *      Claude: a single forced tool whose input_schema is the schema; OpenAI:
 *      response_format { type: "json_schema" }). Return the parsed value.
 *   2. Read the vendor's key from the environment inside `getProvider()` below
 *      and add the provider to the candidate list. Keys are read on the server
 *      only, never logged, never returned to the client (see /api/planner/status).
 *   3. Optionally honour PLANNER_PROVIDER=<name> to pin a vendor when several
 *      keys are present. Nothing else changes: prompts.ts, protocol.ts and the
 *      route handler are provider-agnostic, and the browser client only ever
 *      sees `{ configured, provider, model }`.
 */

let cached: { key: string; model: string; provider: LLMProvider } | null = null;

export function getProvider(): LLMProvider | null {
  const preferred = (process.env.PLANNER_PROVIDER ?? "").trim().toLowerCase();
  const candidates: (() => LLMProvider | null)[] = [];

  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey && (!preferred || preferred === "gemini")) {
    candidates.push(() => {
      const model = (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_GEMINI_MODEL;
      if (cached && cached.key === geminiKey && cached.model === model) return cached.provider;
      const provider = new GeminiProvider(geminiKey, model);
      cached = { key: geminiKey, model, provider };
      return provider;
    });
  }
  // Future providers: push their factories here, in priority order.

  for (const make of candidates) {
    const p = make();
    if (p) return p;
  }
  return null;
}

/** What the status endpoint may reveal. Never includes a key. */
export function describeProvider(): { configured: boolean; provider: string; model?: string } {
  const p = getProvider();
  return p ? { configured: true, provider: p.name, model: p.model } : { configured: false, provider: "heuristic" };
}
