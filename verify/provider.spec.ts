/**
 * Planner provider check (no real key needed). Run from synforma/:
 *   npx --yes tsx@4 verify/provider.spec.ts
 * Verifies: every task schema survives the structure-only conversion for Claude's
 * structured outputs; a bad Anthropic key maps to a ProviderError of kind "auth"
 * without leaking the key; the registry prefers Claude, honours PLANNER_PROVIDER,
 * and reports "heuristic" when no key is set.
 */
import { RESPONSE_JSON_SCHEMAS } from "../lib/synforma/planner/server/prompts";
import { AnthropicProvider, toOutputSchema } from "../lib/synforma/planner/server/anthropic-provider";
import { ProviderError } from "../lib/synforma/planner/server/provider";

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
}
main();
