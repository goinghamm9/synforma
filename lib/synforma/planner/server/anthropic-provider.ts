import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, redact, type GenerateJSONInput, type LLMProvider } from "./provider";

/**
 * Claude provider (Anthropic API) using @anthropic-ai/sdk.
 *
 * Structured output: `output_config.format` with the task's JSON Schema, so the
 * model's reply is constrained to the shape the route expects. The route still
 * validates with Zod and retries once with a corrective instruction, which is
 * why this provider strips the value constraints (lengths, ranges, patterns)
 * that the grammar cannot express: Zod enforces them afterwards.
 *
 * Server only. The key never leaves this process and never appears in errors.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/** Output tokens are the planner's JSON only; the largest task (field mapping) stays well under this. */
const MAX_OUTPUT_TOKENS = 8192;

export class AnthropicProvider implements LLMProvider {
  readonly name = "claude";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string = DEFAULT_ANTHROPIC_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
    // One retry: the route has its own deadline and its own corrective retry.
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }

  async generateJSON({ system, user, schema, signal }: GenerateJSONInput): Promise<unknown> {
    let text = "";
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
          // Planning tasks are extraction and mapping, not open-ended reasoning: medium effort keeps latency inside the route's deadline.
          output_config: { effort: "medium", format: { type: "json_schema", schema: toOutputSchema(schema) } },
        },
        { signal },
      );
      if (response.stop_reason === "refusal") throw new ProviderError("the model declined this request", "output");
      if (response.stop_reason === "max_tokens") throw new ProviderError("the model's output was cut off", "output");
      text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (signal?.aborted) throw new ProviderError("planner timed out", "aborted");
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new ProviderError("Anthropic rejected the API key", "auth");
      if (e instanceof Anthropic.APIError) throw new ProviderError(redact(`Anthropic API ${e.status ?? ""}: ${e.message}`, this.apiKey), "transport");
      throw new ProviderError(redact(e instanceof Error ? e.message : String(e), this.apiKey), "transport");
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError("the model returned output that is not JSON", "output");
    }
  }
}

/** Keywords that describe values rather than structure. Zod checks them after the fact. */
const VALUE_CONSTRAINTS = new Set(["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minItems", "maxItems", "pattern", "format", "multipleOf", "uniqueItems", "default", "examples"]);

/** Structure-only copy of a JSON Schema: objects are closed, value constraints removed, everything else kept. */
export function toOutputSchema(schema: unknown): Record<string, unknown> {
  const out = walk(schema);
  return typeof out === "object" && out !== null && !Array.isArray(out) ? (out as Record<string, unknown>) : { type: "object" };
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk);
  if (typeof node !== "object" || node === null) return node;
  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (VALUE_CONSTRAINTS.has(key)) continue;
    if (key === "properties" || key === "$defs" || key === "definitions") {
      const map = value as Record<string, unknown>;
      result[key] = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, walk(v)]));
    } else {
      result[key] = walk(value);
    }
  }
  if (result.type === "object" && result.properties && result.additionalProperties === undefined) result.additionalProperties = false;
  return result;
}
