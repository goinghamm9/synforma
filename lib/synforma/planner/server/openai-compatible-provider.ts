import { ProviderError, redact, type GenerateJSONInput, type LLMProvider } from "./provider";
import { toOutputSchema } from "./anthropic-provider";

/**
 * OpenAI-compatible chat-completions provider, used for OpenAI itself and for
 * Grok (xAI serves the same wire format at api.x.ai). Plain fetch, no SDK.
 *
 * Structured output: `response_format: { type: "json_schema" }` with the
 * task's JSON Schema (structure only, as for Claude; Zod enforces the value
 * constraints afterwards and the route retries once with a corrective
 * instruction). Reasoning models (gpt-5 family, o-series) take a low
 * reasoning effort so a call stays inside the route's deadline; other models
 * take a low temperature.
 *
 * Server only. The key never leaves this process and never appears in errors.
 */

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
export const OPENAI_API_BASE = "https://api.openai.com/v1";
export const DEFAULT_XAI_MODEL = "grok-4-fast-non-reasoning";
export const XAI_API_BASE = "https://api.x.ai/v1";

/** Output tokens are the planner's JSON only; the largest task (field mapping) stays well under this. */
const MAX_OUTPUT_TOKENS = 8192;

/** Models whose API takes a reasoning effort instead of a temperature. */
const REASONING_MODEL_RE = /^(gpt-5|o[1-9]|grok-[0-9.]+(-fast)?-reasoning)/i;

export interface OpenAICompatibleOptions {
  /** Vendor id shown in the UI ("openai", "grok"). */
  name: string;
  /** Vendor name for error messages ("OpenAI", "xAI"). */
  vendor: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private readonly vendor: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(o: OpenAICompatibleOptions) {
    this.name = o.name;
    this.vendor = o.vendor;
    this.apiKey = o.apiKey;
    this.model = o.model;
    this.baseUrl = o.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = o.fetchImpl ?? fetch;
  }

  async generateJSON({ system, user, schema, signal }: GenerateJSONInput): Promise<unknown> {
    const reasoning = REASONING_MODEL_RE.test(this.model);
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: "planner_result", schema: toOutputSchema(schema) } },
      ...(reasoning ? { reasoning_effort: "low", max_completion_tokens: MAX_OUTPUT_TOKENS } : { temperature: 0.2, max_tokens: MAX_OUTPUT_TOKENS }),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new ProviderError("planner timed out", "aborted");
      throw new ProviderError(redact(`${this.vendor} unreachable: ${e instanceof Error ? e.message : String(e)}`, this.apiKey), "transport");
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const detail = redact(errorMessage(json) || text.slice(0, 200), this.apiKey);
    if (res.status === 401 || res.status === 403) throw new ProviderError(`${this.vendor} rejected the API key (${res.status})`, "auth");
    if (!res.ok) throw new ProviderError(`${this.vendor} API ${res.status}: ${detail}`, "transport");
    const choice = (json as { choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: string }[] } | null)?.choices?.[0];
    if (!choice) throw new ProviderError(`${this.vendor} returned no choices`, "output");
    if (choice.message?.refusal) throw new ProviderError("the model declined this request", "output");
    if (choice.finish_reason === "length") throw new ProviderError("the model's output was cut off", "output");
    const content = choice.message?.content;
    const output = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text) : "")).join("") : "";
    if (!output.trim()) throw new ProviderError(`${this.vendor} returned an empty response`, "output");
    try {
      return JSON.parse(stripFences(output)) as unknown;
    } catch {
      throw new ProviderError("the model returned output that is not JSON", "output");
    }
  }
}

function errorMessage(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const err = (json as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && typeof (err as { message?: unknown }).message === "string") return (err as { message: string }).message;
  return "";
}

/** Models occasionally wrap JSON in a markdown fence despite the response format. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return m ? m[1] : trimmed;
}
