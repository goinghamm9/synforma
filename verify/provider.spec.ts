/**
 * Planner provider check (no real key needed). Run from synforma/:
 *   npx --yes tsx@4 verify/provider.spec.ts
 * Verifies: every task schema survives the structure-only conversion for Claude's
 * structured outputs; a bad Anthropic key maps to a ProviderError of kind "auth"
 * without leaking the key; the registry prefers Claude, honours PLANNER_PROVIDER,
 * and reports "heuristic" when no key is set; OpenAI and Grok register in order and
 * pin, and the OpenAI-compatible provider sends chat completions with a JSON-schema
 * response format (reasoning effort on gpt-5 / o-series / reasoning Grok models) and
 * maps 401, 429, refusals, cut-offs and fenced replies without leaking the key.
 */
import { RESPONSE_JSON_SCHEMAS } from "../lib/synforma/planner/server/prompts";
import { AnthropicProvider, toOutputSchema } from "../lib/synforma/planner/server/anthropic-provider";
import { ProviderError } from "../lib/synforma/planner/server/provider";
import { OpenAICompatibleProvider } from "../lib/synforma/planner/server/openai-compatible-provider";

const VALUE = ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "pattern", "format"];
function scan(node: unknown, path: string, out: string[]) {
  if (Array.isArray(node)) return node.forEach((n, i) => scan(n, `${path}[${i}]`, out));
  if (typeof node !== "object" || node === null) return;
  const o = node as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (VALUE.includes(k)) out.push(`${path}.${k}`);
    if (o.type === "object" && o.properties && o.additionalProperties !== false) out.push(`${path} open object`);
    scan(o[k], `${path}.${k}`, out);
  }
}
for (const [task, schema] of Object.entries(RESPONSE_JSON_SCHEMAS)) {
  const before: string[] = []; scan(schema, task, before);
  const after: string[] = []; scan(toOutputSchema(schema), task, after);
  console.log(`schema ${task}: constraints before=${before.length} after=${after.length} keys=${Object.keys((toOutputSchema(schema).properties ?? {}) as object).join(",")}`);
}

async function main() {
  const fakeKey = "sk-ant-FAKEKEY-abcdefghijklmnopqrstuvwxyz0123456789";
  const p = new AnthropicProvider(fakeKey);
  console.log("provider", p.name, p.model);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    await p.generateJSON({ system: "Return JSON.", user: "Return {\"ok\":true}", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, signal: ac.signal });
    console.log("UNEXPECTED success");
  } catch (e) {
    const err = e as ProviderError;
    console.log("error kind:", err instanceof ProviderError ? err.kind : "not ProviderError", "| message:", String(err.message).slice(0, 120));
    console.log("key leaked:", String(err.message).includes(fakeKey) || String(err.message).includes("FAKEKEY"));
  } finally { clearTimeout(t); }

  process.env.ANTHROPIC_API_KEY = fakeKey; process.env.GEMINI_API_KEY = "gemini-fake-key-1234567890";
  const { describeProvider } = await import("../lib/synforma/planner/server/index");
  console.log("both keys ->", JSON.stringify(describeProvider()));
  process.env.PLANNER_PROVIDER = "gemini";
  console.log("pinned gemini ->", JSON.stringify(describeProvider()));
  process.env.PLANNER_PROVIDER = ""; process.env.ANTHROPIC_API_KEY = "";
  console.log("gemini only ->", JSON.stringify(describeProvider()));
  process.env.GEMINI_API_KEY = "";
  console.log("no keys ->", JSON.stringify(describeProvider()));

  // OpenAI and Grok: the registry order and the pins, then the OpenAI-compatible provider against a fake endpoint.
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failed += 1; };
  process.env.OPENAI_API_KEY = "sk-openai-FAKE-0123456789abcdef"; process.env.XAI_API_KEY = "xai-FAKE-0123456789abcdef";
  check("OpenAI and Grok keys → OpenAI first, gpt-5-mini", JSON.stringify(describeProvider()) === JSON.stringify({ configured: true, provider: "openai", model: "gpt-5-mini" }), JSON.stringify(describeProvider()));
  process.env.PLANNER_PROVIDER = "grok";
  check("PLANNER_PROVIDER=grok pins Grok, grok-4-fast-non-reasoning", JSON.stringify(describeProvider()) === JSON.stringify({ configured: true, provider: "grok", model: "grok-4-fast-non-reasoning" }), JSON.stringify(describeProvider()));
  process.env.XAI_MODEL = "grok-4-fast-reasoning";
  check("XAI_MODEL overrides the Grok model", describeProvider().model === "grok-4-fast-reasoning");
  process.env.PLANNER_PROVIDER = ""; process.env.OPENAI_API_KEY = ""; process.env.XAI_API_KEY = ""; process.env.XAI_MODEL = "";
  process.env.GROK_API_KEY = "grok-FAKE-0123456789abcdef";
  check("GROK_API_KEY is accepted as the xAI key", describeProvider().provider === "grok");
  process.env.GROK_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = fakeKey; process.env.OPENAI_API_KEY = "sk-openai-FAKE-0123456789abcdef";
  check("Claude stays first when both Claude and OpenAI keys are set", describeProvider().provider === "claude");
  process.env.PLANNER_PROVIDER = "openai";
  check("PLANNER_PROVIDER=openai pins OpenAI over Claude", describeProvider().provider === "openai");
  process.env.PLANNER_PROVIDER = ""; process.env.ANTHROPIC_API_KEY = ""; process.env.OPENAI_API_KEY = "";

  const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const make = (model: string, name = "openai", vendor = "OpenAI", baseUrl = "https://api.openai.com/v1", handler: (url: string) => Response = () => json(200, { choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] })) =>
    new OpenAICompatibleProvider({ name, vendor, apiKey: "sk-openai-FAKE-0123456789abcdef", model, baseUrl, fetchImpl: (async (url: string, init: RequestInit) => { calls.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) }); return handler(url); }) as unknown as typeof fetch });
  const schema = { type: "object", properties: { ok: { type: "boolean" }, n: { type: "number", minimum: 1 } }, required: ["ok"] };
  const out = await make("gpt-5-mini").generateJSON({ system: "sys", user: "usr", schema });
  const req = calls[0];
  check("OpenAI: chat completions with system + user, a json_schema response format and the structure-only schema", req.url === "https://api.openai.com/v1/chat/completions" && (req.body.messages as { role: string }[]).map((m) => m.role).join(",") === "system,user" && (req.body.response_format as { type: string; json_schema: { schema: { properties: { n: Record<string, unknown> }; additionalProperties: boolean } } }).type === "json_schema" && (req.body.response_format as { json_schema: { schema: { properties: { n: Record<string, unknown> } } } }).json_schema.schema.properties.n.minimum === undefined && (req.body.response_format as { json_schema: { schema: { additionalProperties: boolean } } }).json_schema.schema.additionalProperties === false, JSON.stringify(req.body.response_format).slice(0, 160));
  check("OpenAI: a gpt-5 model takes low reasoning effort and max_completion_tokens, no temperature", req.body.reasoning_effort === "low" && typeof req.body.max_completion_tokens === "number" && req.body.temperature === undefined);
  check("OpenAI: the parsed JSON comes back", JSON.stringify(out) === '{"ok":true}');
  await make("grok-4-fast-non-reasoning", "grok", "xAI", "https://api.x.ai/v1").generateJSON({ system: "sys", user: "usr", schema });
  const req2 = calls[1];
  check("Grok: xAI's endpoint, a non-reasoning model takes temperature 0.2 and max_tokens", req2.url === "https://api.x.ai/v1/chat/completions" && req2.body.temperature === 0.2 && typeof req2.body.max_tokens === "number" && req2.body.reasoning_effort === undefined && req2.auth.startsWith("Bearer "));
  await make("grok-4-fast-reasoning", "grok", "xAI", "https://api.x.ai/v1").generateJSON({ system: "sys", user: "usr", schema });
  check("Grok: a reasoning model takes low reasoning effort", calls[2].body.reasoning_effort === "low");
  try {
    await make("gpt-5-mini", "openai", "OpenAI", "https://api.openai.com/v1", () => json(401, { error: { message: "Incorrect API key provided: sk-openai-FAKE-0123456789abcdef" } })).generateJSON({ system: "s", user: "u", schema });
    check("OpenAI 401 → auth", false);
  } catch (e) {
    check("OpenAI 401 → ProviderError auth, key never in the message", e instanceof ProviderError && e.kind === "auth" && !e.message.includes("FAKE"), String((e as Error).message));
  }
  try {
    await make("gpt-5-mini", "openai", "OpenAI", "https://api.openai.com/v1", () => json(429, { error: { message: "rate limit for key sk-openai-FAKE-0123456789abcdef" } })).generateJSON({ system: "s", user: "u", schema });
    check("OpenAI 429 → transport", false);
  } catch (e) {
    check("OpenAI 429 → transport with the key redacted", e instanceof ProviderError && e.kind === "transport" && !e.message.includes("FAKE") && /429/.test(e.message), String((e as Error).message));
  }
  try {
    await make("gpt-5-mini", "openai", "OpenAI", "https://api.openai.com/v1", () => json(200, { choices: [{ message: { refusal: "no" }, finish_reason: "stop" }] })).generateJSON({ system: "s", user: "u", schema });
    check("a refusal → output error", false);
  } catch (e) {
    check("a refusal → output error", e instanceof ProviderError && e.kind === "output" && /declined/.test(e.message));
  }
  try {
    await make("gpt-5-mini", "openai", "OpenAI", "https://api.openai.com/v1", () => json(200, { choices: [{ message: { content: '{"ok":' }, finish_reason: "length" }] })).generateJSON({ system: "s", user: "u", schema });
    check("a cut-off reply → output error", false);
  } catch (e) {
    check("a cut-off reply → output error", e instanceof ProviderError && e.kind === "output" && /cut off/.test(e.message));
  }
  const fenced = await make("gpt-5-mini", "openai", "OpenAI", "https://api.openai.com/v1", () => json(200, { choices: [{ message: { content: "```json\n{\"ok\":false}\n```" }, finish_reason: "stop" }] })).generateJSON({ system: "s", user: "u", schema });
  check("a fenced reply is unwrapped", JSON.stringify(fenced) === '{"ok":false}');
  console.log(failed ? `\nFAIL ${failed}` : "\nALL PASS (OpenAI / Grok)");
  process.exit(failed ? 1 : 0);
}
main();
