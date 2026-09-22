import { DecisionProviderError, extractAnswers, hostErrors, isAbort, normalizeAnswers, redact, type DecideInput, type DecideOutput, type DecisionProvider } from "./provider";

export const DEFAULT_TYPESAFE_MODEL = "jev-latest";
export const TYPESAFE_API_BASE = "https://api.typesafe.ai";

type Fetch = typeof fetch;

/**
 * Jev through TypeSafe's own API: POST {base}/v1/systemone with
 * `{ state, questions, model }`, the request the official SDK sends.
 * Needs TYPESAFE_API_KEY; TYPESAFE_BASE_URL and JEV_MODEL are optional.
 */
export class JevTypeSafeProvider implements DecisionProvider {
  readonly name = "jev" as const;
  readonly via = "typesafe" as const;

  constructor(
    private readonly apiKey: string,
    readonly model: string = DEFAULT_TYPESAFE_MODEL,
    private readonly fetchImpl: Fetch = fetch,
    private readonly baseUrl: string = TYPESAFE_API_BASE,
  ) {}

  async decide(input: DecideInput): Promise<DecideOutput> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}/v1/systemone`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ state: input.state, questions: input.questions, model: this.model }),
        signal: input.signal,
      });
    } catch (e) {
      if (isAbort(e)) throw new DecisionProviderError("decision timed out", "aborted");
      throw new DecisionProviderError(`TypeSafe unreachable: ${redact(e instanceof Error ? e.message : String(e), this.apiKey)}`, "transport");
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const errors = redact(hostErrors(json), this.apiKey);
    if (res.status === 401 || res.status === 403) throw new DecisionProviderError(`TypeSafe rejected the API key (${res.status})${errors ? `: ${errors}` : ""}`, "auth");
    if (res.status === 402) throw new DecisionProviderError(`TypeSafe needs credit${errors ? `: ${errors}` : ""}`, "billing");
    if (!res.ok) throw new DecisionProviderError(`TypeSafe answered ${res.status}${errors ? `: ${errors}` : ""}`, "transport");
    const found = extractAnswers(json);
    if (!found) throw new DecisionProviderError("the reply carries no answers", "output");
    return { answers: normalizeAnswers(found.answers, input.questions), model: found.model ?? this.model, route: "v1/systemone" };
  }
}
