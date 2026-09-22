import { NextResponse } from "next/server";
import { DecisionRequestSchema, DecisionResponseSchema } from "@/lib/synforma/decisions/protocol";
import { DecisionProviderError, getDecisionProvider } from "@/lib/synforma/decisions/server";
import { summarizeIssues } from "@/lib/synforma/planner/server/prompts";

/**
 * POST /api/decide — the only place a decision model (Jev) is called.
 *
 * Contract (see lib/synforma/decisions/protocol.ts):
 *   body   DecisionRequest { state, questions }
 *   200    { answers, provider, model, via, latencyMs, route? }   one calibrated answer per question
 *   400    { error, issues? }        malformed JSON or request
 *   413    { error }                 body too large
 *   429    { error, retryAfterSeconds }
 *   502    { error, kind }           the provider failed: auth, billing, route, transport, or an unusable reply
 *   503    { error }                 no decision provider configured (the engine runs its lexical rules alone)
 *   504    { error }                 deadline passed
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 120; // requests: a run asks a handful of questions; a decision costs milliseconds
const RATE_WINDOW_MS = 60_000;
// Well under the synchronous function limit of serverless hosts (10 s on Netlify's free tier).
const TIMEOUT_MS = 6_000;
const MAX_BODY_BYTES = 64 * 1024;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const requestTimes: number[] = [];

function checkRateLimit(now: number): number {
  while (requestTimes.length && now - requestTimes[0] >= RATE_WINDOW_MS) requestTimes.shift();
  if (requestTimes.length >= RATE_LIMIT) return Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - requestTimes[0])) / 1000));
  requestTimes.push(now);
  return 0;
}

function reply(status: number, body: Record<string, unknown>, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...(extra ?? {}) } });
}

export async function POST(request: Request) {
  const retryAfter = checkRateLimit(Date.now());
  if (retryAfter) return reply(429, { error: "rate limit exceeded", retryAfterSeconds: retryAfter }, { "Retry-After": String(retryAfter) });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(413, { error: "request body too large" });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: "request body too large" });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: "request body is not valid JSON" });
  }
  const parsed = DecisionRequestSchema.safeParse(body);
  if (!parsed.success) return reply(400, { error: "invalid decision request", issues: summarizeIssues(parsed.error) });

  const provider = getDecisionProvider();
  if (!provider) return reply(503, { error: "decision model not configured" });

  const t0 = Date.now();
  try {
    const out = await provider.decide({ state: parsed.data.state, questions: parsed.data.questions, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const response = { answers: out.answers, provider: provider.name, model: out.model, via: provider.via, latencyMs: Date.now() - t0, route: out.route };
    const valid = DecisionResponseSchema.safeParse(response);
    if (!valid.success) return reply(502, { error: "decision reply failed validation", kind: "output", issues: summarizeIssues(valid.error) });
    return reply(200, response);
  } catch (e) {
    if (e instanceof DecisionProviderError) {
      if (e.kind === "aborted") return reply(504, { error: "decision timed out" });
      return reply(502, { error: e.message, kind: e.kind });
    }
    return reply(502, { error: e instanceof Error ? e.message : String(e), kind: "transport" });
  }
}
