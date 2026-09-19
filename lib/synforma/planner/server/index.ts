import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic-provider";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "./gemini-provider";
import type { LLMProvider } from "./provider";

export type { LLMProvider, GenerateJSONInput } from "./provider";
export { ProviderError, redact } from "./provider";

/**
 * Provider registry. Server only.
 *
 * Two providers exist: Claude (ANTHROPIC_API_KEY, preferred when both keys are
 * set) and Gemini (GEMINI_API_KEY). PLANNER_PROVIDER=claude|gemini pins one.
 * To add another:
 *   1. Create `./<vendor>-provider.ts` implementing `LLMProvider` from
 *      ./provider.ts. `generateJSON` receives a standard JSON Schema; adapt it
 *      to the vendor's structured-output mechanism there (Claude: output_config
 *      format json_schema; Gemini: responseSchema; OpenAI: response_format
 *      json_schema). Return the parsed value.
 *   2. Read the vendor's key from the environment inside `getProvider()` below
 *      and add the provider to the candidate list. Keys are read on the server
 *      only, never logged, never returned to the client (see /api/planner/status).
 *   Nothing else changes: prompts.ts, protocol.ts and the route handler are
 *   provider-agnostic, and the browser client only ever sees
 *   `{ configured, provider, model }`.
 */

const cache = new Map<string, LLMProvider>();

function cachedProvider(name: string, key: string, model: string, make: () => LLMProvider): LLMProvider {
  const id = `${name}:${model}:${key.length}:${key.slice(-4)}`;
  let p = cache.get(id);
  if (!p) {
    p = make();
    cache.clear();
    cache.set(id, p);
  }
  return p;
}

export function getProvider(): LLMProvider | null {
  const preferred = (process.env.PLANNER_PROVIDER ?? "").trim().toLowerCase();
  const candidates: (() => LLMProvider | null)[] = [];

  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (anthropicKey && (!preferred || preferred === "claude" || preferred === "anthropic")) {
    candidates.push(() => {
      const model = (process.env.ANTHROPIC_MODEL ?? "").trim() || DEFAULT_ANTHROPIC_MODEL;
      return cachedProvider("claude", anthropicKey, model, () => new AnthropicProvider(anthropicKey, model));
    });
  }

  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey && (!preferred || preferred === "gemini")) {
    candidates.push(() => {
      const model = (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_GEMINI_MODEL;
      return cachedProvider("gemini", geminiKey, model, () => new GeminiProvider(geminiKey, model));
    });
  }

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
