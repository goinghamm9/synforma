import { NextResponse } from "next/server";
import { PlannerRequestSchema } from "@/lib/synforma/planner/protocol";
import { getProvider, ProviderError } from "@/lib/synforma/planner/server";
import { buildTaskPrompt, correctiveInstruction, summarizeIssues } from "@/lib/synforma/planner/server/prompts";

/**
 * POST /api/planner — the only place an LLM is called.
 *
 * Contract (see lib/synforma/planner/protocol.ts):
 *   body   PlannerRequest (discriminated on `task`)
 *   200    { result, provider, model }   result validates against the task's response schema
 *   400    { error, issues? }            malformed JSON or request
 *   413    { error }                     body too large
 *   429    { error, retryAfterSeconds }  rate limit (per process)
 *   502    { error, issues? }            provider failed, or its output failed validation twice
 *   503    { error }                     no provider configured (client falls back to the heuristic planner)
 *   504    { error }                     deadline passed
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000;
const TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 512 * 1024;

const NO_STORE = { "Cache-Control": "no-store" } as const;

// In-memory sliding window, per server process. Enough for a prototype; a
// deployment with several instances would move this to a shared store.
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

/** Resolve with the provider's value or reject when the deadline passes, whichever comes first. */
function withDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ProviderError("planner timed out", "aborted"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
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
  const parsed = PlannerRequestSchema.safeParse(body);
  if (!parsed.success) return reply(400, { error: "invalid planner request", issues: summarizeIssues(parsed.error) });

  const provider = getProvider();
  if (!provider) return reply(503, { error: "planner not configured" });

  const prompt = buildTaskPrompt(parsed.data);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let issues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt === 0 ? prompt.user : prompt.user + correctiveInstruction(issues);
    let output: unknown;
    try {
      output = await withDeadline(provider.generateJSON({ system: prompt.system, user, schema: prompt.schema, signal }), signal);
    } catch (e) {
      if (signal.aborted || (e instanceof ProviderError && e.kind === "aborted")) return reply(504, { error: "planner timed out" });
      const detail = e instanceof Error ? e.message : String(e);
      return reply(502, { error: "planner provider error", detail });
    }
    const validated = prompt.validator.safeParse(output);
    if (validated.success) {
      return reply(200, { result: validated.data, provider: provider.name, model: provider.model, task: prompt.task, attempts: attempt + 1 });
    }
    issues = summarizeIssues(validated.error);
  }
  return reply(502, { error: "planner output failed validation", issues });
}
