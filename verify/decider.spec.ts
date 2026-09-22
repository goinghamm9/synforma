/**
 * Decision model guard rails (no credentials, no browser). Run from synforma/:
 *   npx --yes tsx@4 verify/decider.spec.ts
 * Verifies: reply normalisation across the shapes the two hosts return; the Cloudflare transport's two request
 * forms and its auth / billing errors (never the token); the registry's environment logic and the probe; the
 * browser decider's deadline, failure cut-off and the question it builds; and the runner acting on a confident
 * choice while recording a "none", a weak choice and an unreachable model.
 */
import { acceptable, buildFieldQuestion, eligibleCandidates, MAX_FAILURES, NONE_LABEL, RemoteDecider } from "../lib/synforma/decisions";
import { JevCloudflareProvider } from "../lib/synforma/decisions/server/jev-cloudflare";
import { JevTypeSafeProvider } from "../lib/synforma/decisions/server/jev-typesafe";
import { DecisionProviderError, extractAnswers, normalizeAnswer, normalizeAnswers } from "../lib/synforma/decisions/server/provider";
import type { Decider, FieldChoice, FieldChoiceInput } from "../lib/synforma/decisions/types";
import { runWorkflow } from "../lib/synforma/engine/runner";
import { roleCompatible } from "../lib/synforma/interaction/grounding";
import type { IframeDriver } from "../lib/synforma/interaction/driver";
import type { Action, ActionResult, PageModel, Requirement, SemanticElement, Workflow } from "../lib/synforma/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const TOKEN = "cf-FAKE-TOKEN-abcdefghijklmnopqrstuvwxyz0123456789";
const question = { field: { type: "choice" as const, instructions: "Which one?", criteria: { f1: '"Budget confirmation" (combobox)', f2: '"Decision-maker" (combobox)', none_of_these: "No field on this screen is that field" } } };
const sdkAnswer = { type: "choice", choice: "f1", confidence: 0.81, probabilities: { f1: 0.9, f2: 0.05, none_of_these: 0.05 } };

(async () => {
  // ── 1. Reply normalisation ──
  const a1 = normalizeAnswer(sdkAnswer, question.field);
  check("SDK-shaped choice answer normalises", a1?.type === "choice" && a1.choice === "f1" && a1.confidence === 0.81 && a1.probabilities.f1 === 0.9);
  const wrapped = extractAnswers({ success: true, errors: [], result: { model: "jev-1.13", answers: { field: sdkAnswer }, usage: { input_tokens: 40, output_tokens: 0 } } });
  check("Cloudflare-wrapped reply: answers found under result, model read", Boolean(wrapped) && wrapped!.model === "jev-1.13" && "field" in wrapped!.answers);
  const top = extractAnswers({ model: "jev-latest", answers: { field: sdkAnswer }, usage: {} });
  check("TypeSafe top-level reply: answers found", Boolean(top) && top!.model === "jev-latest");
  const alt = normalizeAnswer({ answer: "f2", probability: "0.77", confidence: "high" }, question.field);
  check("alternative field names (answer, lone probability, labelled confidence) normalise", alt?.type === "choice" && alt.choice === "f2" && alt.probabilities.f2 === 0.77 && alt.confidence === 0.9);
  const dist = normalizeAnswer({ choice: "f1", distribution: { f1: 0.6, f2: 0.4, bogus: 1 } }, question.field);
  check("a distribution keeps only the question's own labels; confidence defaults to the chosen probability", dist?.type === "choice" && dist.probabilities.bogus === undefined && dist.confidence === 0.6);
  check("a choice outside the labels is rejected", normalizeAnswer({ choice: "f9", probabilities: { f9: 1 } }, question.field) === null);
  check("a choice without any probability is rejected", normalizeAnswer({ choice: "f1" }, question.field) === null);
  const noulQ = { type: "noul" as const, instructions: "Same field?" };
  check("noul answers: number, boolean and bare value", normalizeAnswer({ type: "noul", noul: 0.93 }, noulQ)?.type === "noul" && (normalizeAnswer({ noul: true }, noulQ) as { noul: number }).noul === 1 && (normalizeAnswer(0.2, noulQ) as { noul: number }).noul === 0.2);
  try {
    normalizeAnswers({ other: sdkAnswer }, question);
    check("a missing answer is an output error", false);
  } catch (e) {
    check("a missing answer is an output error", e instanceof DecisionProviderError && e.kind === "output" && /"field"/.test(e.message), (e as Error).message);
  }

  // ── 2. Cloudflare transport ──
  const calls: { url: string; body: unknown; auth: string }[] = [];
  const cf = (handler: Handler) => new JevCloudflareProvider("acct123", TOKEN, "typesafe/jev", (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
    return handler(url, init);
  }) as unknown as typeof fetch);
  const classicOnly = cf((url) => (url.endsWith("/ai/run") ? json(404, { success: false, errors: [{ code: 7000, message: "No route for that URI" }] }) : json(200, { success: true, result: { model: "jev-1.13", answers: { field: sdkAnswer } } })));
  const out1 = await classicOnly.decide({ state: "s", questions: question });
  check("catalog form refused → classic form answers; route remembered", out1.route === "classic" && out1.model === "jev-1.13" && calls.length === 2 && calls[1].url.endsWith("/ai/run/typesafe/jev") && !("model" in (calls[1].body as object)));
  await classicOnly.decide({ state: "s", questions: question });
  check("the second call goes straight to the remembered form", calls.length === 3 && calls[2].url.endsWith("/ai/run/typesafe/jev"));
  check("the token travels only as a bearer header", calls.every((c) => c.auth === `Bearer ${TOKEN}` && !JSON.stringify(c.body).includes(TOKEN)));
  calls.length = 0;
  const catalog = cf(() => json(200, { success: true, result: { answers: { field: sdkAnswer } } }));
  const out2 = await catalog.decide({ state: "s", questions: question });
  check("catalog form accepted: model + input in the body, configured model id reported", out2.route === "catalog" && out2.model === "typesafe/jev" && (calls[0].body as { model: string; input: { state: string } }).model === "typesafe/jev" && (calls[0].body as { input: { state: string } }).input.state === "s");
  for (const [status, kind] of [[401, "auth"], [403, "auth"], [402, "billing"], [500, "transport"]] as const) {
    try {
      await cf(() => json(status, { success: false, errors: [{ code: 10000, message: `status ${status} for ${TOKEN}` }] })).decide({ state: "s", questions: question });
      check(`HTTP ${status} → ${kind}`, false);
    } catch (e) {
      const err = e as DecisionProviderError;
      check(`HTTP ${status} → ${kind}, token never in the message`, err instanceof DecisionProviderError && err.kind === kind && !err.message.includes(TOKEN), `${err.kind}: ${err.message.slice(0, 90)}`);
    }
  }
  try {
    await cf(() => json(200, { success: false, errors: [{ code: 5016, message: "This model requires a payment method on the account" }] })).decide({ state: "s", questions: question });
    check("a billing message in a 200 body → billing", false);
  } catch (e) {
    check("a billing message in a 200 body → billing", e instanceof DecisionProviderError && e.kind === "billing");
  }
  try {
    await cf(() => json(200, { success: true, result: { answers: { field: { choice: "f7", probabilities: { f7: 1 } } } } })).decide({ state: "s", questions: question });
    check("an answer outside the labels → output error", false);
  } catch (e) {
    check("an answer outside the labels → output error", e instanceof DecisionProviderError && e.kind === "output");
  }
  try {
    const slow = cf((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    // A referenced timer: AbortSignal.timeout() alone would let the process exit before it fires.
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 60);
    await slow.decide({ state: "s", questions: question, signal: ac.signal });
    check("a call past the deadline → aborted", false);
  } catch (e) {
    check("a call past the deadline → aborted", e instanceof DecisionProviderError && e.kind === "aborted");
  }

  // ── 3. TypeSafe transport ──
  const tsCalls: { url: string; body: { model?: string }; auth: string }[] = [];
  const ts = (handler: Handler) => new JevTypeSafeProvider("ts-FAKE-KEY-0123456789abcdef", "jev-latest", (async (url: string, init: RequestInit) => {
    tsCalls.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
    return handler(url, init);
  }) as unknown as typeof fetch);
  const out3 = await ts(() => json(200, { model: "jev-1.13", answers: { field: sdkAnswer }, usage: { input_tokens: 40, output_tokens: 0 } })).decide({ state: "s", questions: question });
  check("TypeSafe: POST /v1/systemone with state, questions, model; answers read", out3.model === "jev-1.13" && tsCalls[0].url === "https://api.typesafe.ai/v1/systemone" && tsCalls[0].body.model === "jev-latest" && out3.answers.field.type === "choice");
  try {
    await ts(() => json(403, { error: { message: "invalid api key ts-FAKE-KEY-0123456789abcdef" } })).decide({ state: "s", questions: question });
    check("TypeSafe 403 → auth", false);
  } catch (e) {
    check("TypeSafe 403 → auth, key never in the message", e instanceof DecisionProviderError && e.kind === "auth" && !e.message.includes("ts-FAKE-KEY"));
  }

  // ── 4. Registry and probe (global fetch mocked; fake credentials) ──
  const { describeDecisionProvider, probeDecisionProvider } = await import("../lib/synforma/decisions/server/index");
  const env = process.env;
  env.CLOUDFLARE_ACCOUNT_ID = ""; env.CLOUDFLARE_API_TOKEN = ""; env.TYPESAFE_API_KEY = ""; env.DECISION_PROVIDER = ""; env.JEV_MODEL = "";
  check("no credentials → not configured", JSON.stringify(describeDecisionProvider()) === JSON.stringify({ configured: false, provider: "none" }));
  env.CLOUDFLARE_ACCOUNT_ID = "acct123"; env.CLOUDFLARE_API_TOKEN = TOKEN;
  check("Cloudflare credentials → jev via cloudflare, typesafe/jev", JSON.stringify(describeDecisionProvider()) === JSON.stringify({ configured: true, provider: "jev", model: "typesafe/jev", via: "cloudflare" }));
  env.TYPESAFE_API_KEY = "ts-FAKE-KEY-0123456789abcdef";
  check("both → TypeSafe's API preferred", describeDecisionProvider().via === "typesafe" && describeDecisionProvider().model === "jev-latest");
  env.DECISION_PROVIDER = "cloudflare"; env.JEV_MODEL = "typesafe/jev-1.13";
  check("DECISION_PROVIDER pins Cloudflare; JEV_MODEL overrides the id", describeDecisionProvider().via === "cloudflare" && describeDecisionProvider().model === "typesafe/jev-1.13");
  env.TYPESAFE_API_KEY = ""; env.DECISION_PROVIDER = ""; env.JEV_MODEL = "";
  let probeAnswer: unknown = { type: "choice", choice: "f1", confidence: 0.8, probabilities: { f1: 0.93, f2: 0.03, f3: 0.02, none_of_these: 0.02 } };
  let probeStatus = 200;
  (globalThis as { fetch: unknown }).fetch = async () => json(probeStatus, probeStatus === 200 ? { success: true, result: { model: "jev-1.13", answers: { field: probeAnswer } } } : { success: false, errors: [{ message: "Authentication error" }] });
  const p1 = await probeDecisionProvider(AbortSignal.timeout(2000));
  check("probe: a usable answer → ok, route, model and the expected-answer note", p1.ok && p1.route === "catalog" && p1.model === "jev-1.13" && /the expected answer/.test(p1.detail ?? "") && typeof p1.latencyMs === "number", p1.detail);
  probeAnswer = { type: "choice", choice: "f2", confidence: 0.5, probabilities: { f1: 0.2, f2: 0.6, f3: 0.1, none_of_these: 0.1 } };
  const p2 = await probeDecisionProvider(AbortSignal.timeout(2000));
  check("probe: another answer → ok but says it was not the expected one", p2.ok && /not the expected answer/.test(p2.detail ?? ""), p2.detail);
  probeStatus = 401;
  const p3 = await probeDecisionProvider(AbortSignal.timeout(2000));
  check("probe: a rejected token → not ok, kind named, token absent", !p3.ok && /^auth:/.test(p3.detail ?? "") && !(p3.detail ?? "").includes(TOKEN), p3.detail);
  env.CLOUDFLARE_ACCOUNT_ID = ""; env.CLOUDFLARE_API_TOKEN = "";

  // ── 5. Browser decider (global fetch mocked as the /api/decide route) ──
  const el = (key: string, name: string, role: SemanticElement["role"], extra: Partial<SemanticElement> = {}): SemanticElement => ({ key, name, role, visible: true, path: [], ...extra }) as SemanticElement;
  const candidates = [el("textbox:name", "Name", "textbox", { required: true }), el("textbox:region-identifier", "Region identifier", "textbox", { description: "Sales region the account belongs to" }), el("checkbox:ack", "I understand", "checkbox"), el("combobox:stage", "Stage", "combobox", { options: ["Select", "Discovery", "Proposal"], disabled: true })];
  const input: FieldChoiceInput = { expected: { name: "Territory code", role: "textbox", value: "EMEA-7", requirement: "Territory code noted" }, screen: { heading: "New account", url: "/app/accounts/new" }, candidates };
  const eligible = eligibleCandidates(input);
  check("eligible candidates: enabled fields of a compatible role only", eligible.map((c) => c.key).join(",") === "textbox:name,textbox:region-identifier", eligible.map((c) => c.key).join(","));
  const built = buildFieldQuestion(input, eligible);
  check("the question lists f1…fN plus none_of_these and maps labels back to elements", Object.keys(built.question.criteria).join(",") === `f1,f2,${NONE_LABEL}` && built.labels.get("f2")?.key === "textbox:region-identifier");
  check("the state names the expected field, its role, the value and the requirement, and the help text of candidates", /knew as "Territory code" \(textbox\)/.test(built.state) && /set it to "EMEA-7"/.test(built.state) && /Territory code noted/.test(built.state) && /Sales region/.test(built.state) && !built.state.includes("{{"));
  check("roleCompatible: family and mismatch", roleCompatible("textbox", "combobox") && roleCompatible(undefined, "checkbox") && !roleCompatible("textbox", "checkbox"));

  type FetchInit = { body?: string; signal?: AbortSignal };
  let hits = 0;
  function mockRoute(answer: (req: { state: string; questions: typeof question }) => { status: number; body: unknown; delayMs?: number }) {
    (globalThis as { fetch: unknown }).fetch = (_url: unknown, init?: FetchInit) =>
      new Promise((resolve, reject) => {
        hits += 1;
        const a = answer(JSON.parse(init?.body ?? "{}"));
        const timer = setTimeout(() => resolve(json(a.status, a.body)), a.delayMs ?? 0);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        });
      });
  }
  const reply = (choice: string, p: number) => ({ answers: { field: { type: "choice", choice, confidence: 0.8, probabilities: { [choice]: p, [choice === "f2" ? "f1" : "f2"]: (1 - p) / 2, [NONE_LABEL]: choice === NONE_LABEL ? p : (1 - p) / 2 } } }, provider: "jev", model: "jev-1.13", via: "cloudflare", latencyMs: 12 });
  mockRoute(() => ({ status: 200, body: reply("f2", 0.92), delayMs: 3000 }));
  const slowDecider = new RemoteDecider("/api/decide", 300);
  const t0 = Date.now();
  const slowChoice = await slowDecider.chooseField(input);
  check("a call past the deadline → no answer, at the deadline, reason recorded", slowChoice === null && Date.now() - t0 < 1500 && /no answer within 0.3 s/.test(slowDecider.lastError ?? ""), slowDecider.lastError ?? "null");
  mockRoute(() => ({ status: 503, body: { error: "decision model not configured" } }));
  const d503 = new RemoteDecider("/api/decide", 300);
  check("503 → no answer, reason from the route", (await d503.chooseField(input)) === null && d503.lastError === "Decision API 503: decision model not configured", d503.lastError ?? "null");
  hits = 0;
  for (let i = 0; i < MAX_FAILURES + 2; i++) await d503.chooseField(input);
  check(`after ${MAX_FAILURES} consecutive failures the decider stops calling`, hits === MAX_FAILURES - 1 && d503.silenced && /not consulted after/.test(d503.lastError ?? ""), `${hits} more calls; ${d503.lastError}`);
  d503.reset();
  check("reset() lets it ask again", !d503.silenced && d503.lastError === null);
  mockRoute(() => ({ status: 200, body: reply("f2", 0.92) }));
  const ok = new RemoteDecider("/api/decide", 300);
  const c1 = await ok.chooseField(input);
  check("a confident choice maps back to the element with its probability and confidence", c1?.key === "textbox:region-identifier" && c1.name === "Region identifier" && c1.probability === 0.92 && c1.confidence === 0.8 && acceptable(c1) && ok.lastError === null && ok.answered === 1);
  mockRoute(() => ({ status: 200, body: reply(NONE_LABEL, 0.88) }));
  const c2 = await ok.chooseField(input);
  check("none_of_these → key null with the probability of none; not acceptable", c2 !== null && c2.key === null && c2.probability === 0.88 && !acceptable(c2));
  mockRoute(() => ({ status: 200, body: reply("f2", 0.55) }));
  check("a weak choice is returned but not acceptable", !acceptable(await ok.chooseField(input)));
  mockRoute(() => ({ status: 200, body: { answers: { field: { type: "choice", choice: "f9", confidence: 0.9, probabilities: { f9: 0.9 } } }, provider: "jev", model: "m", via: "cloudflare", latencyMs: 1 } }));
  check("an answer naming an unknown label → no answer, reason recorded", (await ok.chooseField(input)) === null && /unknown option/.test(ok.lastError ?? ""), ok.lastError ?? "null");
  const noCandidates = await ok.chooseField({ ...input, candidates: [el("checkbox:only", "Only a box", "checkbox")] });
  check("no compatible field → not asked at all", noCandidates === null && /no field of a compatible role/.test(ok.lastError ?? ""));

  // ── 6. The runner acting on decisions (fake driver, fake decider) ──
  const pageOf = (fields: SemanticElement[]): PageModel => ({ url: "/app/accounts/new", title: "New account", heading: "New account", headings: ["New account"], landmarks: [], elements: [...fields], fields, actions: [], alerts: [], dialogs: [], tables: [], definitions: [], fingerprint: "new-account", capturedAt: 0 });
  function fakeDriver(initial: PageModel) {
    let page = initial;
    const performed: Action[] = [];
    const driver = {
      paceMs: 0,
      snapshot: () => ({ page, elements: new Map() }),
      async waitForSettle() {},
      async goto() { return page; },
      async perform(action: Action): Promise<ActionResult> {
        performed.push(action);
        if (action.kind === "type" || action.kind === "select" || action.kind === "check") {
          const f = page.fields.find((x) => x.key === action.target);
          if (!f) return { ok: false, action, error: `no element "${action.targetName}"`, durationMs: 1 };
          const fields = page.fields.map((x) => (x.key === f.key ? { ...x, value: action.value } : x));
          page = { ...page, fields, elements: fields };
          return { ok: true, action, page, durationMs: 1 };
        }
        return { ok: true, action, page, durationMs: 1 };
      },
    };
    return { driver: driver as unknown as IframeDriver, performed, current: () => page };
  }
  const requirements: Requirement[] = [{ id: "r1", text: "Territory code noted", kind: "field", keywords: ["territory", "code"], judgment: false, expectation: { fieldHint: "Territory code" } }];
  const workflow: Workflow = {
    id: "wf_test", title: "Create account", startUrl: "/app/accounts/new", successCriteria: [], confidence: 1,
    steps: [{ id: "s1", index: 0, title: "Basics", route: "/app/accounts/new", requirementIds: ["r1"], mode: "act", modeRationale: "", commit: false, judgment: false, anchor: { heading: "New account" }, actions: [{ kind: "type", target: "textbox:territory-code", targetName: "Territory code", targetRole: "textbox", value: "{{req:r1}}", label: "Enter Territory code" }] }],
  };
  const renamed = pageOf([el("textbox:name", "Name", "textbox"), el("textbox:region-identifier", "Region identifier", "textbox"), el("checkbox:ack", "I understand", "checkbox")]);
  type Ev = { type: string; data?: Record<string, unknown>; message?: string };
  async function runWith(page: PageModel, answer: FieldChoice | null | "absent", lastError: string | null = null) {
    const asked: FieldChoiceInput[] = [];
    const decider: Decider | undefined = answer === "absent" ? undefined : { name: "Jev", lastError, async chooseField(i) { asked.push(i); return answer; } };
    const events: Ev[] = [];
    const ledger: { regrounded?: boolean; after?: { key: string; value: string } }[] = [];
    const fake = fakeDriver(page);
    const result = await runWorkflow({ driver: fake.driver, workflow, requirements, context: { r1: "EMEA-7" }, actor: "agent", policy: { commits: "auto", scope: "all", steps: ["s1"] }, decider, ledger: { runId: "run_t", programId: "p_t" }, hooks: { onEvent: (type, data, _stepId, message) => events.push({ type, data, message }), requestApproval: async () => "granted", onLedger: (e) => ledger.push(e) } });
    return { result, events, asked, performed: fake.performed, page: fake.current(), ledger };
  }
  const accepted = await runWith(renamed, { key: "textbox:region-identifier", name: "Region identifier", probability: 0.92, confidence: 0.8, latencyMs: 20 });
  const regEv = accepted.events.find((e) => e.type === "action_regrounded");
  const decEv = accepted.events.find((e) => e.type === "decision");
  check("runner: the rules find nothing, the decider is asked with role-compatible candidates only", accepted.asked.length === 1 && accepted.asked[0].candidates.map((c) => c.key).join(",") === "textbox:name,textbox:region-identifier" && accepted.asked[0].expected.requirement === "Territory code noted", accepted.asked[0]?.candidates.map((c) => c.key).join(","));
  check("runner: a confident choice fills the renamed field with the requirement's value", accepted.performed.some((a) => a.kind === "type" && a.target === "textbox:region-identifier" && a.value === "EMEA-7") && accepted.page.fields.find((f) => f.key === "textbox:region-identifier")?.value === "EMEA-7");
  check("runner: recorded as a decision and a re-grounding decided by Jev with its probability", decEv?.data?.accepted === true && regEv?.data?.decidedBy === "Jev" && regEv?.data?.probability === 0.92 && /decided by Jev, p 0\.92/.test(regEv?.message ?? ""), regEv?.message);
  check("runner: counters", accepted.result.outcome === "completed" && accepted.result.decisions.asked === 1 && accepted.result.decisions.accepted === 1 && accepted.result.regroundings === 1, JSON.stringify(accepted.result));
  check("runner: the ledger entry of a decided fill is flagged re-grounded with the value in the new field", accepted.ledger.length === 1 && accepted.ledger[0].regrounded === true && accepted.ledger[0].after?.key === "textbox:region-identifier" && accepted.ledger[0].after?.value === "EMEA-7", JSON.stringify(accepted.ledger));
  const none = await runWith(renamed, { key: null, name: null, probability: 0.88, confidence: 0.7, latencyMs: 9 });
  const noneEv = none.events.find((e) => e.type === "decision");
  check("runner: \"none of these\" is recorded and nothing is re-grounded; the fill fails as it would without a model", noneEv?.data?.accepted === false && /is not on this screen \(p 0\.88\)/.test(noneEv?.message ?? "") && !none.events.some((e) => e.type === "action_regrounded") && none.events.some((e) => e.type === "action_failed") && none.result.decisions.asked === 1 && none.result.decisions.accepted === 0, noneEv?.message);
  const weak = await runWith(renamed, { key: "textbox:region-identifier", name: "Region identifier", probability: 0.55, confidence: 0.4, latencyMs: 9 });
  const weakEv = weak.events.find((e) => e.type === "decision");
  check("runner: a choice below the threshold is reported, not used", weakEv?.data?.accepted === false && /below the 0\.8 acceptance threshold/.test(weakEv?.message ?? "") && weak.result.decisions.accepted === 0 && !weak.events.some((e) => e.type === "action_regrounded"), weakEv?.message);
  const down = await runWith(renamed, null, "no answer within 4 s");
  const downEv = down.events.find((e) => e.type === "decision");
  check("runner: an unreachable model is recorded with the reason; rules only", downEv?.data?.unavailable === true && /no answer within 4 s/.test(downEv?.message ?? "") && down.result.decisions.asked === 1 && down.result.decisions.accepted === 0, downEv?.message);
  const noModel = await runWith(renamed, "absent");
  check("runner: without a decider nothing changes (no decision events, counters at zero)", !noModel.events.some((e) => e.type === "decision") && noModel.result.decisions.asked === 0);
  const unchanged = await runWith(pageOf([el("textbox:territory-code", "Territory code", "textbox")]), { key: "textbox:territory-code", name: "Territory code", probability: 0.99, confidence: 0.9, latencyMs: 1 });
  check("runner: the rules come first; a field they recognise is never put to the model", unchanged.asked.length === 0 && unchanged.result.decisions.asked === 0 && unchanged.page.fields[0].value === "EMEA-7");

  console.log(failed ? `\nFAIL ${failed}` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
