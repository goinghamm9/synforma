import { GoogleGenAI } from "@google/genai";
import { ProviderError, redact, type GenerateJSONInput, type LLMProvider } from "./provider";

/**
 * Gemini provider (Google AI Studio API) using @google/genai.
 *
 * Structured output: responseMimeType "application/json" + responseSchema.
 * The Gemini `responseSchema` field takes an OpenAPI-3.0 subset with
 * upper-case type names, so the standard JSON Schema handed to every provider
 * is converted here rather than written twice.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string = DEFAULT_GEMINI_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJSON({ system, user, schema, signal }: GenerateJSONInput): Promise<unknown> {
    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: user,
        config: {
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(schema),
          systemInstruction: system,
          temperature: 0.2,
          abortSignal: signal,
        },
      });
      text = response.text;
    } catch (e) {
      if (signal?.aborted) throw new ProviderError("request aborted", "aborted");
      const message = redact(e instanceof Error ? e.message : String(e), this.apiKey);
      const kind = /401|403|API key|permission|unauthenticated/i.test(message) ? "auth" : "transport";
      throw new ProviderError(`Gemini request failed: ${message}`, kind);
    }
    if (!text || !text.trim()) throw new ProviderError("Gemini returned an empty response", "output");
    try {
      return JSON.parse(stripFences(text));
    } catch {
      throw new ProviderError("Gemini returned text that is not valid JSON", "output");
    }
  }
}

/** Models occasionally wrap JSON in a markdown fence despite the mime type. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return m ? m[1] : trimmed;
}

type GeminiSchema = Record<string, unknown>;

/**
 * Convert a standard JSON Schema object into Gemini's `Schema` shape:
 *   - `type` becomes upper-case (and `["string","null"]` becomes nullable)
 *   - `properties` keeps its declaration order via `propertyOrdering`
 *   - length/item bounds are strings (int64 in the API)
 *   - keywords Gemini does not accept (`$schema`, `additionalProperties`) are dropped
 */
export function toGeminiSchema(schema: Record<string, unknown>): GeminiSchema {
  const out: GeminiSchema = {};
  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    const nonNull = rawType.filter((t) => t !== "null");
    if (nonNull.length) out.type = String(nonNull[0]).toUpperCase();
    if (rawType.includes("null")) out.nullable = true;
  } else if (typeof rawType === "string") {
    out.type = rawType.toUpperCase();
  }
  for (const key of ["description", "format", "title", "minimum", "maximum", "nullable", "enum", "required", "default"] as const) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }
  for (const key of ["minLength", "maxLength", "minItems", "maxItems"] as const) {
    if (schema[key] !== undefined) out[key] = String(schema[key]);
  }
  if (schema.properties && typeof schema.properties === "object") {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const converted: Record<string, GeminiSchema> = {};
    for (const [name, sub] of Object.entries(props)) converted[name] = toGeminiSchema(sub);
    out.properties = converted;
    out.propertyOrdering = Object.keys(props);
  }
  if (schema.items && typeof schema.items === "object") out.items = toGeminiSchema(schema.items as Record<string, unknown>);
  if (Array.isArray(schema.anyOf)) out.anyOf = (schema.anyOf as Record<string, unknown>[]).map(toGeminiSchema);
  return out;
}
