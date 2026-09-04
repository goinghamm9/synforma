/**
 * Provider abstraction for the server-side planner.
 *
 * A provider turns (system prompt, user prompt, response JSON schema) into a
 * parsed JSON value. It knows nothing about Synforma's tasks: prompts.ts
 * decides what to ask, protocol.ts decides what is acceptable, and the route
 * handler validates. Any LLM vendor that can produce schema-constrained JSON
 * can sit behind this interface (see ./index.ts for how to add one).
 *
 * Server only. Never import from client components.
 */

export interface GenerateJSONInput {
  /** Standing instructions: role, rules, tone. */
  system: string;
  /** The task and its data. */
  user: string;
  /** Standard JSON Schema (draft 2020-12 subset) describing the expected response. */
  schema: Record<string, unknown>;
  /** Abort when the route's deadline passes. */
  signal?: AbortSignal;
}

export interface LLMProvider {
  /** Short vendor id shown in the UI ("gemini"). Never a secret. */
  readonly name: string;
  /** Model id shown in the UI ("gemini-2.5-flash"). */
  readonly model: string;
  /**
   * Generate a JSON value that should match `schema`. Providers return the
   * parsed value without validating it: the caller validates with Zod and
   * retries with a corrective instruction when needed.
   */
  generateJSON(input: GenerateJSONInput): Promise<unknown>;
}

/** Raised by providers for transport, authentication or malformed-output failures. Messages never contain secrets. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "transport" | "auth" | "output" | "aborted" = "transport",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Remove a secret from any string that might reach a log or a response body. */
export function redact(text: string, secret: string | undefined): string {
  if (!secret || secret.length < 6) return text;
  return text.split(secret).join("[redacted]");
}
