/**
 * Remote planner guard rails (no browser, no key). Run from synforma/:
 *   npx --yes tsx@4 verify/remote-planner.spec.ts
 * Verifies, with a mocked planner API: a call that does not answer within the deadline falls back to the
 * heuristic result and records why; the model's objective reading is merged additively (heuristic requirement
 * list kept, titles and judgment taken, model requirements used only when the heuristic found none); a model
 * field mapping fills a gap but never overrides a confident heuristic mapping.
 */
import type { DiscoveredState } from "../lib/synforma/engine/explorer";
import { createGraph } from "../lib/synforma/graph/work-graph";
import { HeuristicPlanner } from "../lib/synforma/planner/heuristic";
import type { PlannerRequest } from "../lib/synforma/planner/protocol";
import { applyMappings, mergeParsed, RemotePlanner } from "../lib/synforma/planner/remote";
import type { PageModel, ParsedObjective, SemanticElement } from "../lib/synforma/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

// ── Fixtures: a two-step form the heuristic planner can turn into a workflow ──
const el = (key: string, name: string, role: SemanticElement["role"], extra: Partial<SemanticElement> = {}): SemanticElement =>
  ({ key, name, role, visible: true, path: [], ...extra }) as SemanticElement;
const pageOf = (url: string, heading: string, fields: SemanticElement[], actions: SemanticElement[]): PageModel =>
  ({ url, title: heading, heading: "New opportunity", headings: ["New opportunity", heading], landmarks: [], elements: [...fields, ...actions], fields, actions, alerts: [], dialogs: [], tables: [], definitions: [], fingerprint: heading, capturedAt: 0 }) as PageModel;
const stateOf = (id: string, url: string, heading: string, fields: SemanticElement[], actions: SemanticElement[], depth: number, parentId?: string): DiscoveredState =>
  ({ id, label: heading, route: "/app/opportunities/new", url, page: pageOf(url, heading, fields, actions), path: [], depth, parentId, revealed: {}, screenNodeId: `screen:${id}` }) as DiscoveredState;

const s1 = stateOf("s1", "/app/opportunities/new", "Step 1 of 2 · Basics", [el("f:name", "Name", "textbox", { required: true }), el("f:amount", "Amount", "textbox")], [el("a:next", "Next", "button")], 1);
const s2 = stateOf(
  "s2",
  "/app/opportunities/new?step=2",
  "Step 2 of 2 · Qualification",
  [el("f:dm", "Decision-maker", "combobox", { options: ["Select", "Helen Marsh — VP Operations", "Sam Lee — Analyst"] }), el("f:funding", "Funding stage", "combobox", { options: ["Unknown", "Requested", "Approved", "Allocated"] })],
  [el("a:back", "Back", "button"), el("a:create", "Create opportunity", "button", { commit: true } as Partial<SemanticElement>)],
  2,
  "s1",
);
const states = [s1, s2];
const objective = `I want reps to create a qualified opportunity from a lead.
1. A named decision-maker contact
2. Budget status confirmed (Approved or Allocated)
3. An amount recorded
4. Territory code noted
Success is every opportunity meeting all four.`;

type FetchInit = { body?: string; signal?: AbortSignal };
/** Replace global fetch with a planner API stand-in. `answer` may take time; an aborted signal rejects like a real fetch. */
function mockFetch(answer: (req: PlannerRequest) => { result: unknown; delayMs?: number } | null) {
  (globalThis as { fetch: unknown }).fetch = (_url: unknown, init?: FetchInit) =>
    new Promise((resolve, reject) => {
      const req = JSON.parse(init?.body ?? "{}") as PlannerRequest;
      const a = answer(req);
      if (!a) return resolve({ ok: false, status: 503, json: async () => ({ error: "planner not configured" }) });
      const timer = setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ result: a.result }) }), a.delayMs ?? 0);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
      });
    });
}

(async () => {
  const heuristic = new HeuristicPlanner();
  const base = await heuristic.parseObjective({ objectiveText: objective, appName: "Test CRM" });
  check("heuristic parses four requirements", base.requirements.length === 4, String(base.requirements.length));

  // 1. Deadline: a slow planner API never stalls the demo.
  mockFetch(() => ({ result: {}, delayMs: 5_000 }));
  const slow = new RemotePlanner("claude", "/api/planner", 300);
  const t0 = Date.now();
  const parsedSlow = await slow.parseObjective({ objectiveText: objective, appName: "Test CRM" });
  const elapsed = Date.now() - t0;
  check("a call past the deadline falls back to the heuristic result", parsedSlow.title === base.title && parsedSlow.requirements.length === 4, parsedSlow.title);
  check("the fallback happens at the deadline, not later", elapsed < 1_500, `${elapsed} ms`);
  check("lastError says the model did not answer in time", /no answer within/.test(slow.lastError ?? ""), slow.lastError ?? "null");

  // 2. Merge: the model's reading is additive.
  const llmParsed = (over: Partial<ParsedObjective>): ParsedObjective => ({
    title: "Create a qualified opportunity",
    population: "Sales representatives",
    targetBehavior: "Create a qualified opportunity from an inbound lead",
    requirements: [],
    policyConstraints: ["Never skip qualification"],
    successDefinition: "Every opportunity meets all four requirements",
    objectHints: ["opportunity"],
    entryHints: ["lead"],
    confidence: 0.9,
    ...over,
  });
  const mismatch = mergeParsed(base, llmParsed({ requirements: base.requirements.slice(0, 2) }));
  check("a model list of a different length is ignored; the heuristic list stays", mismatch.requirements.length === 4 && mismatch.requirements[0].text === base.requirements[0].text);
  check("title, population and constraints come from the model", mismatch.title === "Create a qualified opportunity" && mismatch.population === "Sales representatives" && mismatch.policyConstraints[0] === "Never skip qualification");
  const sameCount = mergeParsed(base, llmParsed({ requirements: base.requirements.map((r, i) => ({ ...r, text: `model wording ${i}`, judgment: i === 2, expectation: { fieldHint: "model hint" } })) }));
  check("same-length list: wording and expectations stay the heuristic's", sameCount.requirements[2].text === base.requirements[2].text && sameCount.requirements[2].expectation?.fieldHint === base.requirements[2].expectation?.fieldHint);
  check("same-length list: the model can add a judgment flag, never remove one", sameCount.requirements[2].judgment === true && sameCount.requirements[0].judgment === base.requirements[0].judgment);
  const prose = await heuristic.parseObjective({ objectiveText: "I want reps to open a deal for every inbound lead.", appName: "Test CRM" });
  const fromModel = mergeParsed(prose, llmParsed({ requirements: [{ id: "r1", text: "A named decision-maker contact", kind: "field", keywords: [], judgment: true, expectation: { fieldHint: "Decision-maker" } }] }));
  check("when the heuristic found no requirements, the model's are used with recomputed keywords", prose.requirements.length === 0 && fromModel.requirements.length === 1 && fromModel.requirements[0].keywords.length > 0, JSON.stringify(fromModel.requirements[0]?.keywords));

  // 3. Mappings: the model fills gaps and never overrides a confident heuristic choice.
  const mapped = applyMappings(
    base,
    [
      { requirementId: "r2", fieldKey: "f:name", stateId: "s1", confidence: 0.95 }, // wrong: budget → Name; the heuristic is confident about Funding stage
      { requirementId: "r4", fieldKey: "f:name", stateId: "s1", confidence: 0.8 }, // gap: no field looks like "territory code"
      { requirementId: "r3", fieldKey: "f:missing", stateId: "s1", confidence: 0.9 }, // a key that does not exist
    ],
    states,
  );
  check("a confident heuristic mapping is kept over the model's", mapped.requirements[1].expectation?.fieldHint === base.requirements[1].expectation?.fieldHint, mapped.requirements[1].expectation?.fieldHint);
  check("a requirement no field matched takes the model's field", mapped.requirements[3].expectation?.fieldHint === "Name", mapped.requirements[3].expectation?.fieldHint);
  check("a mapping to an unknown field key is ignored", mapped.requirements[2].expectation?.fieldHint === base.requirements[2].expectation?.fieldHint);

  const graph = createGraph("g_test");
  const wf = await heuristic.inferWorkflow({ parsed: mapped, states, graph, startUrl: "/app" });
  const labels = wf.steps.flatMap((s) => s.actions.map((a) => a.label));
  check("the workflow maps budget to Funding stage and territory code to Name", labels.some((l) => /^Funding stage ← requirement 2/.test(l)) && labels.some((l) => /^Name ← requirement 4/.test(l)) && !labels.some((l) => /^Name ← requirement 2/.test(l)), labels.join(" | "));

  // 4. End to end through the client with a well-behaved mock.
  mockFetch((req) => (req.task === "parseObjective" ? { result: llmParsed({ requirements: base.requirements }) } : req.task === "mapFields" ? { result: { mappings: [{ requirementId: "r4", fieldKey: "f:name", stateId: "s1", confidence: 0.8, rationale: "initials go in the name" }], stepModes: [{ stateId: "s1", mode: "act", rationale: "no judgment here" }] } } : { result: {} }));
  const remote = new RemotePlanner("claude", "/api/planner", 2_000);
  const parsed = await remote.parseObjective({ objectiveText: objective, appName: "Test CRM" });
  const wf2 = await remote.inferWorkflow({ parsed, states, graph: createGraph("g_test_2"), startUrl: "/app" });
  const labels2 = wf2.steps.flatMap((s) => s.actions.map((a) => a.label));
  check("through the client: model title, heuristic requirements, mapping gap filled, no error recorded", parsed.title === "Create a qualified opportunity" && parsed.requirements.length === 4 && labels2.some((l) => /^Name ← requirement 4/.test(l)) && remote.lastError === null, remote.lastError ?? "ok");
  const s1Step = wf2.steps.find((s) => s.screenId === "screen:s1");
  check("a model step mode is applied with its rationale labelled", s1Step?.mode === "act" && /language model/.test(s1Step?.modeRationale ?? ""), s1Step?.modeRationale);

  // 5. A 503 (no provider) is a clean fallback.
  mockFetch(() => null);
  const none = new RemotePlanner("claude", "/api/planner", 2_000);
  const parsed503 = await none.parseObjective({ objectiveText: objective, appName: "Test CRM" });
  check("a 503 falls back to the heuristic and records the status", parsed503.title === base.title && none.lastError === "Planner API 503", none.lastError ?? "null");

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
