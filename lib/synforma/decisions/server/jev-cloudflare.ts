import { DecisionProviderError, extractAnswers, hostErrors, isAbort, normalizeAnswers, redact, type DecideInput, type DecideOutput, type DecisionProvider } from "./provider";

/** Jev as listed in Cloudflare's model catalog. */
export const DEFAULT_CLOUDFLARE_JEV_MODEL = "typesafe/jev";
export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

type Fetch = typeof fetch;

/** The two request forms Cloudflare documents for its AI REST API; the first that answers is remembered. */
export type CloudflareRoute = "catalog" | "classic";

/**
 * Jev through Cloudflare Workers AI. Needs an account id and an API token
 * with Workers AI read + edit; both stay on the server.
 *
 *   catalog  POST /accounts/{id}/ai/run          { model, input: { state, questions } }
 *   classic  POST /accounts/{id}/ai/run/{model}  { state, questions }
 *
 * Both wrap the model's output in `{ success, result, errors }`.
 */
export class JevCloudflareProvider implements DecisionProvider {
  readonly name = "jev" as const;
  readonly via = "cloudflare" as const;
  private route: CloudflareRoute | null = null;

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    readonly model: string = DEFAULT_CLOUDFLARE_JEV_MODEL,
    private readonly fetchImpl: Fetch = fetch,
    private readonly apiBase: string = CLOUDFLARE_API_BASE,
  ) {}

  async decide(input: DecideInput): Promise<DecideOutput> {
    const routes: CloudflareRoute[] = this.route ? [this.route] : ["catalog", "classic"];
    let lastRouteError: DecisionProviderError | null = null;
    for (const route of routes) {
      try {
        const out = await this.call(route, input);
        this.route = route;
        return { ...out, route };
      } catch (e) {
        if (e instanceof DecisionProviderError && e.kind === "route") {
          lastRouteError = e;
          continue;
        }
        throw e;
      }
    }
    throw lastRouteError ?? new DecisionProviderError("no request form accepted", "route");
  }

  private async call(route: CloudflareRoute, input: DecideInput): Promise<Omit<DecideOutput, "route">> {
    const url = route === "catalog" ? `${this.apiBase}/accounts/${this.accountId}/ai/run` : `${this.apiBase}/accounts/${this.accountId}/ai/run/${this.model}`;
    const payload = { state: input.state, questions: input.questions };
    const body = route === "catalog" ? { model: this.model, input: payload } : payload;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch (e) {
      if (isAbort(e)) throw new DecisionProviderError("decision timed out", "aborted");
      throw new DecisionProviderError(`Cloudflare unreachable: ${redact(e instanceof Error ? e.message : String(e), this.token)}`, "transport");
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const errors = redact(hostErrors(json), this.token);
    if (res.status === 401 || res.status === 403) throw new DecisionProviderError(`Cloudflare rejected the API token (${res.status})${errors ? `: ${errors}` : ""}`, "auth");
    if (res.status === 402 || /billing|payment method|paid plan|insufficient (funds|credit)/i.test(errors)) throw new DecisionProviderError(`Cloudflare needs billing for this model${errors ? `: ${errors}` : ""}`, "billing");
    if (res.status === 404 || res.status === 405 || res.status === 400) throw new DecisionProviderError(`request form "${route}" not accepted (${res.status})${errors ? `: ${errors}` : ""}`, "route");
    if (!res.ok) throw new DecisionProviderError(`Cloudflare answered ${res.status}${errors ? `: ${errors}` : ""}`, "transport");
    if (json && typeof json === "object" && (json as { success?: unknown }).success === false) throw new DecisionProviderError(`Cloudflare reported an error${errors ? `: ${errors}` : ""}`, "output");
    const found = extractAnswers(json);
    if (!found) throw new DecisionProviderError("the reply carries no answers", "output");
    return { answers: normalizeAnswers(found.answers, input.questions), model: found.model ?? this.model };
  }
}
