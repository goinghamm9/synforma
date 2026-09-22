# The Synforma engine

This document has two parts. **Part 1** explains how Synforma decides things, in enough detail to
audit or replace any part. Every rule is implemented in `lib/synforma`; nothing is hidden inside a
prompt. **Part 2** is the API reference per module, for building UI on the engine.

Everything lives under `lib/synforma`; import paths use the `@/` alias. The engine is browser-side (it
drives a same-origin iframe). Only the planner route (`app/api/planner`) and the provider registry
(`lib/synforma/planner/server`) run on the server.

---

# Part 1 — Decision rules

## 1. Seeing the application (Universal Interaction Layer)

`snapshotDocument(doc, url)` turns a live DOM into a `PageModel`:

- **Elements**: every visible interactive control (`a[href]`, `button`, inputs, selects, textareas, ARIA
  roles button/link/menuitem/tab/checkbox/radio/switch/combobox/option/textbox).
- **Accessible name**: aria-labelledby → aria-label → `<label for>` / wrapping label → text → placeholder → title.
- **Container path**: landmarks, the nearest preceding heading at each ancestor level, dialog titles, and
  the name of the control that reveals a container (`aria-controls`) or tab (`aria-labelledby`). The
  innermost entry is the element's `region`.
- **Semantic key**: `role:slug(name)`, disambiguated by region, then index. Never a DOM id.
- **Commit classification**: `type=submit` buttons (unless named next/continue/back/cancel/close…) and
  buttons whose name starts with create/submit/save/delete/remove/send/pay/approve/publish/archive/
  purchase/transfer/post/reset/clear/confirm/complete/finish/book/order/issue. Menu items and links are
  never commits (they usually navigate to a form).
- **Structure**: open dialogs, alerts (`role=alert`, `aria-live=assertive`), tables (name, headers,
  rows), definition lists (label → value), visible h1–h3 headings.
- **Route generalization**: id-like segments (`L-1001`, numbers, UUIDs, long hex) become `:id`; query
  values become `:v`. **Fingerprint** = hash(route pattern, dialog titles, secondary headings, field keys,
  non-record action keys): the same wizard step across different records is one state.

## 2. Grounding by meaning

`ground(query, page)` scores each candidate element:

| component | weight | notes |
|---|---|---|
| exact semantic key | 1.0 | short-circuits |
| role | +0.25 exact, +0.12 compatible family, −0.3 mismatch | button ≈ menuitem ≈ link ≈ tab; textbox ≈ textarea ≈ combobox; checkbox ≈ switch ≈ radio |
| name similarity | 0.6 × sim | sim = 0.55·overlap + 0.35·Jaccard + 0.15·containment over canonicalized tokens; an uppercase abbreviation of 3–5 letters on one side collapses the phrase whose initials it spells on the other ("RLS protection" ≈ "Row level security") |
| description / options | +0.15 × sim | "Approved" in a select's options matches "budget confirmed" |
| hints | +0.25 × sim | requirement wording, values |
| region | +0.10 × sim | same section heading |
| commit affinity | ±0.20 | a commit intent must land on a commit control, never a nav link |
| dialog scope | ±0.05 / −0.2 | |
| disabled | −0.2 | |

Threshold 0.42; an ambiguity guard refuses when the top two are weak and nearly tied. The synonym lexicon
(`text.ts`) canonicalizes enterprise vocabulary: budget ≈ funding, decision-maker ≈ economic buyer,
timeline ≈ timeframe, next step ≈ next action, actions ≈ more options, advanced ≈ additional details,
next ≈ continue, save ≈ submit, convert ≈ create ≈ new.

## 3. Autonomous discovery (`explorer.ts`)

Breadth-first over URLs inside the application's base path, depth ≤ 5, ≤ 40 states, ≤ 2 instances per
record route pattern, time budget 120 s. Within each state:

1. Register the screen, its fields, actions (record links grouped as one "open a record" action), and
   objects inferred from tables (singularized heading + headers) and definition lists.
2. Queue in-app links.
3. **Disclosures** (`aria-expanded=false`, no popup): expand; fields that appear are recorded with
   `revealedBy` and a `reveals` edge.
4. **Tabs**: open each; merge revealed fields into the screen; queue links inside.
5. **Menus** (`aria-haspopup`): open, enumerate items, try each non-commit item; navigation targets are
   registered with the human path (open menu → item); dialogs are registered then dismissed with a
   non-commit button (I understand / Close / Cancel / OK…).
6. **Wizards**: if a Next/Continue button exists, fill only *required* empty fields with discovery values
   (never committed), click Next, and recurse; on validation alerts, fill the invalid fields once and retry.
7. **Commit controls are recorded, never executed.**

Output: `DiscoveredState[]` (page model + replayable path + revealed groups) and the Work Graph.

## 4. From objective to program (`HeuristicPlanner.parseObjective`)

- Requirements = numbered/bulleted list items (or obligation sentences). Each gets keywords, a
  `judgment` flag (mentions of decision-maker/buyer/stakeholder/budget/funding/verify/review/approve…),
  and an expectation: accepted values from "(A or B)", rejected values from "(not X)", quoted values,
  and "within N days".
- Population from role nouns (account executives, reps, employees…); object hint from "create a … X";
  entry hint from "from a … lead"; policy constraints = sentences with without/never/must not/
  restricted/confidential/policy; success = the sentence mentioning %, sustained, adoption or success.
- Requirement kind: a list item phrased as a prohibition (without/never/must not/do not/restricted/
  confidential/prohibited/not allowed) is a `policy` constraint; one that names something to create is
  a `field` requirement even when the artifact is called a policy ("A policy that allows authenticated
  users to read their own rows"); %/sustained/adoption mark an `outcome`.

A language-model planner (Claude or Gemini through `RemotePlanner`) does the same task with a model
and must return the same Zod-validated shape. Heuristic expectations are kept when the model omits
them; keywords are always recomputed.

## 5. Workflow inference (`HeuristicPlanner.inferWorkflow`)

1. Group discovered states by route; keep routes with fields. For each group, score how well its fields
   satisfy the requirements (`requirementFieldScore`: name similarity, option/accepted-value matches,
   checkbox labels, keyword overlap) and add bonuses for the object hint and a commit control.
2. The best group is the target form chain, ordered by parent links (wizard steps).
3. Entry steps come from the human path recorded during discovery: "Open the lead record" (navigate;
   the runner substitutes the concrete entry URL) and "Start the opportunity from the lead" (open
   menu → item).
4. One step per form state: reveal actions for hidden groups, fills for required fields
   (`{{field:key}}`) and requirement fields (`{{req:rN}}`, with a companion `{{req:rN:date}}` when the
   requirement has a date expectation and the mapped field is not a date), then Next.
5. The last state with a commit control becomes "Review and create": acknowledge any dialog, then the
   commit click (`commit: true`).
6. Outcome screen = a record detail route (`…/:id`) with a definition list for the object.

**Guide / Assist / Act policy** per step:

| condition | mode | rationale shown |
|---|---|---|
| any mapped requirement needs judgment | **guide** | who decides / what is funded is human knowledge; Synforma never guesses |
| fields to fill, no judgment | **assist** | values derivable from the record and defaults; the person reviews |
| navigation / menu / commit | **act** | mechanical; commits are approval-gated and audited |

With a language-model planner, the model proposes requirement→field mappings (applied as field hints
when confidence ≥ 0.5) and per-state modes; a judgment step can never be set to `act`. The executable
workflow is still built by the heuristic planner.

Values at run time (`resolveValue`): context first; then accepted values that exist as options; for
people-requirements, an option with a decision-making title (VP, Director, Chief, Head…); dates within
the requirement's window; sensible defaults otherwise.

## 6. Execution (`runner.ts`)

A run is governed by a **RunPolicy**, one object instead of a pile of flags:

| field | values | meaning |
|---|---|---|
| `commits` | `"ask"` (default) / `"auto"` | `ask`: every commit control waits for `hooks.requestApproval`. `auto`: commits proceed without asking; used only for simulations and for a commit the person approved a moment ago |
| `scope` | `"all"` (default) / `"routine"` | `routine` is Get It Done: judgment requirements are left for the person and the run stops in front of the commit control |
| `steps` | step ids, optional | limit the run to these steps (single-step assist, resuming after a stop); no outcome verification afterwards |
| `trust` | `{ contract?, claims }`, optional | the Autonomy Contract and evidence that gate autonomy; omitted for simulations and single-step assists, which are never blocked by a contested claim |

`DEFAULT_POLICY = { commits: "ask", scope: "all" }`; callers pass a `Partial<RunPolicy>` that is merged over it.

For each selected step: emit `step_entered`. If `policy.trust` is set, compute the trust decision
(§11) and emit `trust_decision`; `stop` (conflicting sources) abandons the run; for an agent running the
whole workflow, `guide` on an action class the contract sets to `never` abandons it too ("contract
forbids autonomy"). Then for each action: in routine scope, skip actions whose requirement needs
judgment (`note { skippedJudgment }`) and stop before the commit click (`note { stoppedBeforeCommit }`,
outcome `completed`, nothing verified). Resolve the live field (re-grounding by meaning if the key is
gone), resolve the value, perform, emit `action_executed` (+ `action_regrounded`). A field that is not on
the screen is first looked for behind the best-named opener and the closed tabs; if the form continues
on later steps of the same route, the fill is carried forward (`note { deferred }`) and retried at the
start of each later step, so a field the vendor moved to a tab on the review step is still filled. Menu
items are reached by opening the popup buttons first. If a click does not advance and alerts appear → `validation_error`,
repair invalid fields once (dates → ISO, selects → first real option) and retry. Before a commit click
with `commits: "ask"` → `approval_requested` with the collected payload; denial → `approval_denied`,
`run_abandoned`. A failed essential action (navigation, Next, commit) → `run_failed`.

After the last step (unless `steps` was set), the outcome screen is snapshotted and `verifyRequirements`
checks each requirement against the definition list (label similarity, accepted / rejected values, date
windows) → `outcome_verified`, then `run_completed` with `requirementsMet`, or `run_failed` when the
outcome screen was not reached.

**Ledger provenance.** When the caller passes `ledger: { runId, programId, intent?, decidedBy? }`
together with `hooks.onLedger`, every executed action becomes a ledger entry (§12) with the field value
before and after, the action class, the approval status (`granted` when asked, else `not_required`),
the result and the re-grounding flag. Without `ledger`, no entries are written: simulations stay out of
provenance and undo.

**Synthetic users** run the same code with capabilities off: `synonyms` (literal reader), `expand`
(surface skimmer), `fixValidation` and `fillOptional` (hurried closer). Their runs are labelled synthetic
and excluded from human timing statistics.

## 7. Observation (`observer.ts`) and the friction engine (`friction.ts`)

Every 500 ms: snapshot; if the outcome route is reached → verify and complete. Otherwise infer the
current step from anchors (route pattern + step heading, matched even behind a modal). Transitions emit
`step_entered` / `step_completed`; a lower index → `backtrack`; no matching step for 8 s → `wrong_screen`;
new `role=alert` text → `validation_error`; no input/click/keydown for the hesitation threshold (doubling
after each fire) while the step's requirements are unmet → `hesitation`. A live checklist re-reads the
mapped fields (accepted / rejected values, date windows; checkbox groups stay met once any option is).

### Interaction telemetry (`interaction/telemetry.ts`)

Raw pointer movement is reduced locally to 1-second `PointerWindow`s: path distance, straight-line
distance, path efficiency, mean/max velocity, direction changes (> 45°), hover dwell per semantic element,
approaches (within 40 px of the current target) and withdrawals (then > 120 px away), clicks, idle time.
Keyboard events become `KeyboardWindow` METADATA: counts per category (character, backspace, enter,
escape, shortcut, navigation), median inter-key interval, bursts. The key value is classified and
discarded synchronously; password / secret / card / token fields emit only a suppressed count. No gaze.

### Friction engine v0 (`friction.ts`, rule version friction-v0.1)

Every ~1.5 s the observer scores the observable states (evidence in parentheses):

| state | rule |
|---|---|
| FLUENT | clicks or keys in the last seconds without errors; or the step was entered < 4 s ago |
| ERROR_RECOVERY | a validation message is visible or an error occurred < 15 s ago (+ corrections); outranks search evidence |
| VISUAL_SEARCH | target known but never hovered ≥ 0.4 s, > 6 s on the step, no typing, inefficient path (efficiency < 0.55) and/or ≥ 6 direction changes |
| DECISION_UNCERTAINTY | target hovered ≥ 0.6 s or approached ≥ 2 times, no click, step pending or commit; withdrawals add evidence |
| POLICY_UNCERTAINTY | decision uncertainty on a judgment step constrained by accepted values or policy |
| WORKFLOW_KNOWLEDGE_GAP | > 12 s with little movement and no target hover; or backtracks |
| WORKFLOW_FRICTION | ≥ 2 validation errors on the same step |
| UNKNOWN | no rule reached 0.3 |

Output: state, confidence (share of evidence weight), evidence strings, alternatives. The "target" is the
first unmet requirement field on the page, the control that reveals a hidden one, or the step anchor.
Never an emotion, trait or score of a person.

## 8. Adaptation (`adoption.ts`)

**Diagnose** (heuristic rules; confidence = share of evidence weight):

| signal | hypothesis |
|---|---|
| validation errors | capability: skill (format / sequence) |
| hesitation on a step with hidden fields | opportunity: visibility |
| hesitation on a judgment step | motivation: uncertainty |
| hesitation otherwise | capability: knowledge |
| backtracks | capability: knowledge |
| wrong screen | opportunity: visibility |
| abandon at commit | motivation: uncertainty |

Friction states map to barriers (`FRICTION_TO_BARRIER`) and prefer minimal interventions: visual search
→ contextual pointer; decision uncertainty → clarify consequence (never a highlight: the control was
found); error recovery → worked example; knowledge gap → inline explanation / if-then cue; workflow
friction → prefill, act, or recommend redesign.

**Select** a technique from the registry with an explainable score:

```
total = 0.35·barrierFit + 0.20·contextFit + 0.15·evidenceWeight + 0.30·previousSuccess
        − repetitionPenalty − burdenPenalty − uncertaintyPenalty
```

- barrierFit: hypothesis confidence if the technique targets the primary barrier; 0.6 × alternative confidence otherwise.
- contextFit: 0 for Act on judgment steps (excluded); boosted for pointers when fields are hidden; capped for Act on commit steps.
- evidenceWeight: strong 1.0 · promising 0.75 · theoretical 0.5 · experimental 0.35 · philosophical 0.3.
- previousSuccess: 0.5 neutral prior; once ≥ 3 treated and ≥ 3 control human runs exist on this step, 0.5 + (treated completion − control completion).
- repetitionPenalty: 0.15 per prior use on the step (max 0.3), +0.25 within 20 s of the last intervention. burdenPenalty: 0.4 × technique burden. uncertaintyPenalty: 0.25 × (1 − hypothesis confidence).

**DO_NOTHING is always a candidate** (`scoreDoNothing`): 0.3 base, +0.45 when the state is FLUENT / UNKNOWN,
+0.35 × uncertainty, + proficiency multiplier, +0.3 for "stay out of the way", +0.25 within 20 s of the
last intervention, −0.15 for hesitation before a commit, and it wins outright once the intervention budget
of the run is spent. Preference and Get It Done adjust context fit (teach me favours guidance; just do it
and Get It Done favour assist and act, and defer instruction). `decide()` returns the ranked candidates so
the UI can explain why nothing appeared. All components and their explanations are stored on the
intervention ("Why this?").

**Experiment**: human runs are assigned deterministically to control / treatment by hashing the run id
against the treatment share; control runs record `assistance withheld`. **Learn**: `evaluateIntervention`
reports treated vs control completion and lift only when both arms reach `minRunsPerArm`.

### Proficiency and fading (`proficiency.ts`)

Per program × step: assisted runs, unassisted successes, error history (last 5). After 3 unassisted
successes with error rate < 34 %, assistance fades one level (do with me → guide → explain → observe);
two error runs in five regress to guide. The person can override either way. Proficiency raises the
interruption multiplier so DO_NOTHING wins more often for steps a person completes reliably.

### Get It Done (`runner.ts`, `policy.scope = "routine"`)

Fills routine inputs, leaves judgment fields to the person, stops before the commit and asks for approval.
The employee view then runs the commit with `commits: "auto"` and `steps: [thatStep]`, because the person
approved it a moment ago. The recap (handled / decided / approvals) is computed from events.

### Admin diagnosis (`recommend.ts`)

From aggregate metrics and the friction distribution of the highest-friction step, one class: learning
need, assistance need, automation opportunity, policy problem, interface problem, integration problem,
process design problem, or insufficient evidence (< 3 people runs). Each carries evidence, confidence,
and what is unlikely to help ("additional navigation training").

## 9. Measurement (`metrics.ts`)

- **Intent-to-Outcome Rate** = runs by people (human + synthetic, the latter labelled simulation) that completed **and** verified every requirement ÷ finished people runs; `null` until 5. Agent runs are reported separately.
- Per-step: entered, completed, median human duration, errors, hesitations, backtracks, assistance shown, assist requested, friction index (needs ≥ 3 entries).
- Cohorts: completion and median duration for control vs treatment.
- Self-healing: total re-groundings.

Nothing is extrapolated. The UI shows "Still learning" until `sufficient` is true.

## 10. Evidence / truth engine (`evidence.ts`)

Synforma holds **claims**, not facts: subject, predicate, object, statement, source (objective /
observed interface / planner inference / configuration / documentation / person), source reference,
authority (`TrustState`), confidence, scope, observed time, validator, contradictions, supersession and
status (asserted / validated / contested / retired).

Sources of claims in the demo: the objective (organization-approved: requirements, accepted values,
policy constraints); the observed interface (authoritative live: each field with its options and required
flag, each commit control); the planner (model-inferred: field → requirement mappings, plus an explicit
contested claim for any requirement with no field).

Contradiction detection: a requirement's accepted values not offered by the mapped field's options marks
both claims contested with the reason. Belief resolution uses the authority hierarchy, then freshness,
and returns *no belief* when the subject is contested. Re-grounding during execution supersedes the old
naming claim with a live observation. People can validate or reject claims.

## 11. Trust and autonomy engine (`trust.ts`)

Action classes: A read/navigate · B reversible write · C consequential write · D external or destructive.
The default Autonomy Contract for a workflow: A and B automatic, C ask (preview + approval every time),
D never. Trust decision per step: conflicting sources → **stop**; contract "never" or human judgment →
**guide**; confidence < 0.5 → **ask**; risk = 0.55·consequence + 0.25·(1 − reversibility) +
0.2·external + 0.3·exception probability: ≥ 0.8 → guide, ≥ 0.45 or policy "ask" → **prepare + ask**,
otherwise **act**. The runner records every decision and abandons a run whose evidence conflicts.

## 12. Provenance and rollback ledger (`ledger.ts`)

Every executed action becomes a ledger entry: who requested it, the believed intent, what it relied on
(requirement or claim ids), who decided (planner or rule), action class, the action, before and after
field values, approval status, result, re-grounding flag, and rollback capability (restore value for
fills; compensating action needed for commits, not available in the sandbox; none for navigation).
`rollbackEntries` undoes reversible entries newest-first by restoring previous values in the live
interface, stepping back through the wizard with Back/Previous when needed: "undo what Synforma did".

## 13. Demonstration capture (`demonstration.ts`)

Shadow mode in miniature: a person performs the workflow once while the recorder captures a semantic
trace (route, state, control clicked, field changed, never the typed value). Reconstruction groups the
trace by screen state, turns clicks and changes into actions, maps changed fields to requirements, detects
the commit, marks judgment, and produces up to three clarification questions (an unplanned click:
required or convenient? the commit: always ask? which fields needed judgment?) plus the deviations from the
planned workflow. The result is a new semantic version of the workflow with a changelog entry and
governance status "discovered" (→ reviewed → approved → governed).

## 14. Skill, budget, modes, teach-after (`proficiency.ts`)

Skill status is never mastery after one success: unknown → learning → mastered (level explain/observe)
→ stale (mastered on an older workflow version, or not executed for 45 days). The intervention budget
(3 per run by default) makes DO_NOTHING win once spent. Modes: learning (default), performance (Get It
Done or explicit deadline), recovery (after a failure: concrete help preferred). The teach-after recap is
computed from events: what Synforma handled, what the person decided, approvals.

---

# Part 2 — API reference

## Types — `@/lib/synforma/types`

`PageModel`, `SemanticElement`, `Action`, `ActionResult`, `WorkGraph`, `GraphNode`, `GraphEdge`,
`NodeType`, `Provenance`, `TrustState`, `Program`, `ParsedObjective`, `Requirement`, `Workflow`,
`WorkflowStep`, `ExecutionMode` ("guide" | "assist" | "act"), `PlannerKind` ("heuristic" | "claude" |
"gemini"), `Run`, `RunEvent`, `RunEventType`, `StruggleSignal`, `FrictionState`, `Hypothesis`,
`Intervention`, `InterventionScore`, `InterventionTechnique`, `Claim`, `AutonomyContract`, `ActionClass`,
`LedgerEntry`, `ProficiencyState`, `AssistancePreference`, `AuditEntry`, `ApprovalRequest`,
`ProgramMetrics`, `StepMetrics`, `SynformaSettings`, `DEFAULT_SETTINGS`.

Settings: `plannerPreference` ("auto" | "heuristic" | "llm"; "gemini" values from older builds migrate
to "llm"), `assistancePreference` ("just_do_it" | "work_with_me" | "teach_me" | "stay_out"),
`interactionSensing`, `sensingPaused`, `hesitationThresholdMs`, `requireApprovalForCommit`,
`treatmentShare`, `demoView` ("simple" | "advanced"). Runs carry `preference`, `getItDone`,
`assistanceShown`, `withheld`, `uiVariant`, `requirementsMet`, `regroundings`.

Workflow versioning: `workflow.version` ("1.0"…), `workflow.changelog[]`, `workflow.origin`,
`workflow.governance { status: discovered | reviewed | approved | approved_with_exceptions | rejected,
owner, at, note }`. Version "1.0" with a changelog entry at first planning; `bumpVersion` on re-plan or
demonstration.

## Store — `@/lib/synforma/store` (zustand + localStorage, client only)

```ts
import { useSynforma, selectActiveProgram, selectRunsForProgram, selectEventsForRun, selectInterventionsForProgram, useHydrated } from "@/lib/synforma/store";
const programs = useSynforma((s) => s.programs);            // Record<id, Program>
const graph = useSynforma((s) => s.graphs[program.graphId]);
const { upsertProgram, setActiveProgram, saveGraph, saveDiscovery, addRun, updateRun, addEvent, addSignal, addHypothesis,
        upsertIntervention, addAudit, addApproval, decideApproval, setSettings, setProficiency, setClaims, addLedger,
        updateLedger, setContract, deleteProgram, resetAll, exportJSON, importJSON } = useSynforma.getState();
```

Collections: `programs`, `graphs`, `discoveries[programId]` (the `DiscoveredState[]` from the last
discovery, needed by the planner), `runs`, `events`, `signals`, `hypotheses`, `interventions`, `audit`,
`approvals`, `proficiency[`${programId}/${stepId}`]`, `claims[programId]`, `ledger`,
`contracts[workflowId]`, `settings`, `activeProgramId`. Persisted state rehydrates after mount: render a
skeleton until `useHydrated()` is true. Never read the store during SSR.

## Interaction layer

### Snapshot and grounding — `@/lib/synforma/interaction/snapshot`, `.../grounding`, `.../text`

`snapshotDocument(doc, url)` → `{ page: PageModel, elements }`; `generalizeRoute(url)`;
`describeState(page)`, `pageStateLabel(page)`. `ground(query, page, threshold = 0.42)` →
`GroundingCandidate | null`; `candidatesFor`, `scoreCandidate`, `keywordsOf`. `similarity(a, b)`,
`tokenize`, `slug`, `hashString`, `SYNONYM_GROUPS`.

### Driver — `@/lib/synforma/interaction/driver`

```ts
const driver = new IframeDriver(iframeEl, { paceMs: 350, events: { onCursor(rect, label), onHighlight(rect, label), onNavigate(url), onLog(msg) } });
await driver.goto("/sandbox/crm");            // full load
const { page, elements } = driver.snapshot(); // PageModel + live element map
await driver.perform(action);                 // ActionResult (regrounded flag = self-healing)
await driver.waitForSettle(ms);
driver.currentUrl(); driver.frameRect(); driver.rectFor(key); driver.paceMs = 0;
```

Rects from `onCursor` / `onHighlight` / `rectFor` are in the iframe's viewport coordinates: add
`driver.frameRect().left/top` to draw overlays in the parent page.

### Telemetry — `@/lib/synforma/interaction/telemetry`

`PointerAggregator`, `KeyboardAggregator` (used internally by the observer), `isSensitiveField`,
`classifyKey`, `GazeProvider` (interface only; nothing implemented, nothing collected). Events
`pointer_window` / `keyboard_window` contain aggregates only (no coordinates, no key values); show them
in a "what Synforma sees" inspector.

## Explorer — `@/lib/synforma/engine/explorer`

```ts
const graph = createGraph(shortId("g"));      // from "@/lib/synforma/graph/work-graph"
const { states, stats } = await explore({ driver, startUrl, appName, graph, limits: { maxStates: 40, maxDepth: 5, timeBudgetMs: 120000, maxInstancesPerRoute: 2 }, onEvent, signal });
// onEvent receives { type: "log" | "state" | "action" | "graph" | "done", ... }; "graph" carries the live WorkGraph (cloneGraph before putting it in React state)
```

Takes about 10–20 s on the sandbox. `discoveryValue(field)` is the never-committed filler value.

## Planner — `@/lib/synforma/planner`

```ts
import { fetchPlannerStatus, resolvePlannerKind, createPlanner, configuredLlmKind, plannerLabel, plannerVendor } from "@/lib/synforma/planner";
const status = await fetchPlannerStatus();               // { configured, provider, model? } from /api/planner/status (cached; { configured: false, provider: "none" } when unreachable)
const kind = resolvePlannerKind(settings.plannerPreference, status); // "heuristic" | "claude" | "gemini"
const planner = createPlanner(kind);                     // HeuristicPlanner, or RemotePlanner(kind)
configuredLlmKind(status);                               // "claude" | "gemini" | null
plannerVendor(kind);                                     // "Claude" | "Gemini" | "Heuristic"
plannerLabel(kind, status);                              // "Claude planner · claude-opus-5", "Heuristic planner"

const parsed = await planner.parseObjective({ objectiveText, appName });
const workflow = await planner.inferWorkflow({ parsed, states, graph, startUrl }); // also adds requirement/workflow/step nodes to graph
const diagnosis = await planner.diagnose({ step, workflow, requirements, signals });
const content = await planner.composeAssistance({ step, workflow, requirements, hypothesis, technique, policyConstraints });
```

`RemotePlanner` (`planner/remote.ts`) POSTs `{ task: "parseObjective" | "mapFields" | "diagnose" |
"composeAssistance", ... }` to `/api/planner`, validates the reply with the schemas in
`planner/protocol.ts`, and returns the heuristic result on any failure (`lastError` says why). Its
`kind` is only used for labels and provenance. Templated action values `{{req:r1}}`, `{{req:r5:date}}`,
`{{field:key}}` are resolved at run time by `resolveValue(action, requirements, context, field)` from
`@/lib/synforma/planner/heuristic`.

### Server side — `@/lib/synforma/planner/server` and `app/api/planner` (never import from client code)

`getProvider()` reads `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` (and `ANTHROPIC_MODEL`, `GEMINI_MODEL`,
`PLANNER_PROVIDER`) and returns an `LLMProvider { name, model, generateJSON({ system, user, schema,
signal }) }` or null; Claude first when both keys are set. `describeProvider()` → `{ configured,
provider, model? }`, the only thing `/api/planner/status` reveals. `ProviderError(kind: transport | auth
| output | aborted)`; messages never contain the key (`redact`). `AnthropicProvider` sends the task's
JSON Schema through `output_config.format` (structure-only copy from `toOutputSchema`; Zod enforces value
constraints afterwards); `GeminiProvider` converts it to `responseSchema` (`toGeminiSchema`).

Route contract for `POST /api/planner`: 200 `{ result, provider, model, task, attempts }` · 400 malformed
request · 413 body too large (512 KB) · 429 rate limit (30/min per process) · 502 provider failed,
refused, or output failed validation twice · 503 no provider configured · 504 deadline (25 s). Output is
validated with Zod and retried once with a corrective instruction. On anything but 200 the client uses
the heuristic result.

## Runner (Act / Assist / Get It Done) — `@/lib/synforma/engine/runner`

```ts
const result = await runWorkflow({
  driver, workflow, requirements, context, actor: "agent" | "human" | "synthetic",
  policy: { commits: "ask" | "auto", scope: "all" | "routine", steps?: [stepId], trust?: { contract?, claims } }, // Partial<RunPolicy>, merged over DEFAULT_POLICY
  ledger: { runId, programId, intent?, decidedBy? },  // LedgerProvenance; omit and no ledger entries are written
  capabilities?,                                       // RunCapabilities for synthetic personas (FULL_CAPABILITIES by default)
  signal?,
  hooks: {
    onEvent(type, data, stepId, message) {/* store.addEvent({ runId, type, data, stepId, message }) */},
    requestApproval: async (req) => "granted" | "denied",  // show the approval dialog; store.addApproval
    onStep?(step, "entered" | "completed" | "failed") {},
    onLedger?(entry) {/* store.addLedger(entry) */},
  },
});
// result: { outcome: "completed" | "abandoned" | "failed", requirementsMet, regroundings, failedStepId?, error?, outcomeUrl? }
```

Semantics of `policy` are in §6. How the UI uses it:

| caller | policy | ledger |
|---|---|---|
| Mission Control, Act | `{ commits: settings.requireApprovalForCommit ? "ask" : "auto", scope: "all", trust: { contract, claims } }` | `{ runId, programId, intent: workflow.title, decidedBy: program.planner }` |
| Mission Control, synthetic users | `{ commits: "auto", scope: "all" }` plus `capabilities: persona.capabilities` | none |
| Employee view, Assist one step | `{ commits: …, scope: "all", steps: [stepId] }` | none |
| Employee view, Get It Done | `{ commits: "ask", scope: "routine", steps: remainingStepIds }`, then for the approved commit `{ commits: "auto", scope: "all", steps: [stepId] }` | none |

`context` is `Record<string, string>`; `DEFAULT_CONTEXT`, `DEFAULT_OBJECTIVE`, `SANDBOX_APP`,
`CONTEXT_FIELDS`, `withBase` are in `@/lib/synforma/demo`. `verifyRequirements(page, requirements)`
checks an outcome screen; `requirementIdOfAction(action)` reads the `{{req:…}}` template.

## Human observer (Guide) — `@/lib/synforma/engine/observer`

```ts
const observer = new HumanObserver({ driver, workflow, requirements, hesitationThresholdMs, pollMs?,
  sensing: settings.interactionSensing && !settings.sensingPaused, policyConstraints: program.parsed.policyConstraints,
  hooks: { onEvent, onStepChange(step, index, page), onSignal(signal) /* feed decide / reactToSignal */, onFriction(inference),
           onComplete({ requirementsMet, outcomeUrl }), onChecklist(items), onPage(page) } });
observer.start(); observer.stop(); observer.touch(); observer.setSensing(on); observer.currentStep; observer.latestFriction;
resolveAnchorRect(driver, anchor, page) // → { rect, key, name } | null for highlighting
anchorMatchesPage(anchor, page)
```

The observer runs the friction engine every ~1.5 s and emits `friction_inferred` events. Struggle
signals carry `frictionState`, `frictionConfidence`, `evidence`, and the types `visual_search`,
`decision_uncertainty`, `error_recovery` in addition to the timing-based ones.

## Friction — `@/lib/synforma/engine/friction`

`inferFriction(ctx, now?)` → `FrictionInference { state, confidence, evidence, alternatives, ruleVersion }`;
states FLUENT, VISUAL_SEARCH, DECISION_UNCERTAINTY, WORKFLOW_KNOWLEDGE_GAP, POLICY_UNCERTAINTY,
ERROR_RECOVERY, WORKFLOW_FRICTION, TIME_PRESSURE, UNKNOWN. `FRICTION_LABEL`, `FRICTION_SHORT`,
`FRICTION_RULE_VERSION`.

## Adoption and decision policy — `@/lib/synforma/engine/adoption`

```ts
const decision = await decide(signal, deps);         // Decision { selected, candidates[{ techniqueId, total }], hypothesis, intervention | null, reason }
const intervention = await reactToSignal(signal, deps); // the intervention only, or null
rankTechniques(ctx)                                  // [{ technique, score }] including the DO_NOTHING candidate, for "Why this?"
scoreTechnique(t, ctx); scoreDoNothing(ctx); FRICTION_TO_BARRIER; barrierFromSignals(signals); stepEventsSummary(events, stepId)
assignCohort(runId, treatmentShare)                  // "control" | "treatment"
evaluateIntervention(intervention, runs)             // { treated, treatedCompleted, control, controlCompleted, lift, sufficient }
```

`deps`: `planner`, `program`, `getSignalsForStep`, `getInterventionsForStep`, `getRuns`,
`saveHypothesis`, `saveIntervention`, plus `preference` (AssistancePreference), `getItDone`,
`proficiency` (the step's ProficiencyState), `shownThisRun`, `sinceLastShownMs`, `budget`, `mode`.
`selected === "do_nothing"` means stay quiet: record an `intervention_withheld` event with the
candidates so the UI can show why nothing appeared. Techniques `do_nothing`, `clarify_consequence`,
`recommend_redesign` exist in the registry (`DO_NOTHING_ID`).

## Proficiency, skill, budget, modes, recap — `@/lib/synforma/engine/proficiency`

`initialProficiency(programId, stepId)`, `stepOutcomesForRun(run, events, workflow)`,
`updateProficiency(prev, outcome, workflow.version)` → `{ next, faded }` (call for each step when a human
run finishes; emit `proficiency_updated`), `interruptionMultiplier(p)`, `LEVEL_LABEL`, `LEVEL_ORDER`,
`levelIndex`. `skillStatus(p, workflow.version, now)` → `{ status: unknown | learning | mastered | stale,
reason }`, `SKILL_LABEL`. `DEFAULT_INTERVENTION_BUDGET` (3 per run). `deriveMode({ getItDone,
recentFailure, deadlineSoon? })` → learning | performance | recovery. `composeRecap(events, workflow,
runId)` → `{ handled, decided, approvals, skipped, text }` for teach-after.

## Metrics and recommendation — `@/lib/synforma/engine/metrics`, `.../recommend`

`computeProgramMetrics(program, runs, events)` → `ProgramMetrics` (null rates until `MINIMUM_RUNS` = 5
finished people runs; show "Still learning"). `completionByVariant(runs)`;
`isIntentToOutcomeSuccess(run, requirementCount)`.
`recommend(program, metrics, runs, events, hypotheses, interventions)` → `Recommendation { class,
headline, rationale, evidence, unlikelyToHelp, confidence, stepId, stepTitle, frictionDistribution }`;
`RECOMMENDATION_LABEL`; `MIN_RUNS_FOR_RECOMMENDATION` = 3.

## Synthetic users — `@/lib/synforma/engine/synthetic`

`PERSONAS` / `PERSONA_BY_ID`; run each with `runWorkflow({ ..., actor: "synthetic", capabilities:
persona.capabilities, policy: { commits: "auto", scope: "all" } })` and no `ledger`. Synthetic runs must
be labelled as simulation everywhere and excluded from human timing.

## Evidence — `@/lib/synforma/engine/evidence`

`claimsFromProgram(program, graph, states)` → `Claim[]` (objective = ORGANIZATION_APPROVED, observed
interface = AUTHORITATIVE_LIVE, planner mappings = MODEL_INFERRED, unmapped requirements = contested);
`detectContradictions` runs inside it. `resolveBelief(claims, subject, predicate?)` → `{ belief,
conflicting, reason }`. `truthReport(claims)` → counts by authority + contested list.
`claimsFromRegrounding(programId, event, existing)` supersedes naming claims after a UI change.
`validateClaim(claim, by, ok, note)`. `TRUST_LABEL`, `AUTHORITY_ORDER`, `authorityRank`. Compute claims
after planning and after each Act run's re-groundings; store with `setClaims(programId, claims)`.

## Trust — `@/lib/synforma/engine/trust`

`defaultContract(workflow)` → `AutonomyContract` (A/B auto, C ask, D never); store `contracts[workflowId]`,
`setContract`. `classifyAction(action, step)`, `ACTION_CLASS_LABEL`, `CLASS_PROFILE`, `policyFor(contract,
cls)`. `stepTrust(step, workflow, contract, claims, userHistory?)` → `{ decision: act | prepare_ask | guide
| ask | stop, risk, reasons, actionClass }`; `decideTrust(input)` is the underlying rule. Pass the
contract and claims to the runner as `policy.trust`.

## Ledger — `@/lib/synforma/engine/ledger`

`makeLedgerEntry(draft)` (used by the runner), `fieldValue(page, key)`. `rollbackEntries(driver,
entries)` → `{ restored, skipped }` undoes reversible fills newest-first (steps back through a wizard via
Back/Previous when needed); mark restored entries with `updateLedger(id, { rolledBackAt })` and record the
rollback in the audit log.

## Demonstration — `@/lib/synforma/engine/demonstration`

```ts
const rec = new DemonstrationRecorder(driver, onTraceEvent); await rec.start(); const trace = rec.stop();
reconstructWorkflow(trace, { objective: program.parsed, states, planned: program.workflow, startUrl, planner, previousVersion })
// → { workflow (version bumped, origin "demonstration", governance "discovered"), questions (≤ 3, with options), deviations, summary }
```

Save as the program's workflow after the person answers (answers go into `workflow.governance.note`,
status "reviewed"), keep the previous version in `changelog`, add the new nodes to the graph, create a
default contract. `bumpVersion(v)`, `stepHeadingOf(page)`.

## Science — `@/lib/synforma/science/techniques`, `.../citations`

`TECHNIQUES`, `TECHNIQUE_BY_ID`, `techniquesForBarrier`, `EVIDENCE_LABEL`, `EVIDENCE_WEIGHT`,
`BARRIER_LABEL`, `BARRIER_SHORT`, `DO_NOTHING_ID`, `CITATIONS`, `CITATION_BY_ID`, `cite(id)`. Only cite
from this registry. Never invent citations or statistics.

## Work Graph — `@/lib/synforma/graph/work-graph`

`createGraph`, `upsertNode`, `upsertEdge`, `neighbors`, `countByType`, `nodesOfType`, `cloneGraph`,
`nodeId(type, ...parts)`, `defaultProvenance(status, source?)`. Node types: application, screen, action,
field, object, workflow, step, requirement, objective, role, person, outcome, policy, capability,
intervention. Edge types: contains, navigates_to, performs, requires, fulfills, produces, constrained_by,
assigned_to, targets, depends_on, addresses, uses, reveals. Every node carries `provenance { source,
trust, observedAt, by? }`; show it in node details as "How Synforma knows this" (`components/graph/provenance.ts`).
`upsertNode` never downgrades an observed or confirmed node with an inference.

## Trust layer UI — `@/components/trust`

Presentational components (no store access) plus one hook:

- `EvidencePanel({ claims, onValidate?, compact? })`: truth report by authority, contested claims first, confirm/reject.
- `AutonomyContractTable({ contract, onChange?, onApprove?, readOnly? })`: per action class, person / Synforma (auto · ask · never); C and D can never be "auto".
- `TrustDecisions({ workflow, contract, claims })`: per-step decision with risk bar and reasons.
- `LedgerTable({ entries, stepTitle?, onUndo?, undoing? })`: provenance rows with before → after, approval, result, undo capability.
- `GovernanceBadge({ workflow })`: version + governance status with the changelog popover.
- `DemonstrationPanel({ status, trace, reconstruction, answers, onStart, onStop, onAnswer, onAdopt, onDiscard })`: teach by doing.
- `ToneBadge` and `trust-tone.ts`: consistent tones for trust states and decisions.
- `useTrustLayer(program, getDriver)` → `{ claims, contract, ledger, refreshClaims(), applyRegroundings(events), validate(claim, ok), ensureContract(), setContract(next), approveContract(), undo(), undoing, demonstration: { status, trace, reconstruction, answers, start(), stop(), answer(), adopt(), discard(), busy } }`.
  Call `refreshClaims()` after planning or re-planning; `ensureContract()` when a workflow exists; pass
  `policy.trust: { contract, claims }`, `ledger: { runId, programId, intent, decidedBy }` and
  `hooks.onLedger: addLedger` to `runWorkflow`; call `applyRegroundings(runEvents)` after an Act run.
  `mergeClaimValidation` keeps validations across recomputation; `addWorkflowToGraph` adds a demonstrated
  workflow's nodes.

## Engine harness for tests

`/dev/engine` exposes `window.__synforma` with `driver`, `planner`, `snapshot(url)`, `discover()`,
`plan()`, `act(context?, approve?, { routineOnly?, useTrust?, onlySteps?, workflowOverride? })` (the
harness maps these to a `RunPolicy` and always passes a test `ledger`), `rollback()`, `claims()`,
`trust()`, `recap()`, `skill()`, `replan(objective)`, `observe(onSignal, sensing?)`, `decide(signal,
opts?)`, `startRecording()`, `reconstruct()`, `events`, `ledger`, `frictions`, `checklist`. The scripts
in `verify/` drive it with Playwright; see `docs/OPERATIONS.md`. Sandbox facts (base path, entry lead,
`?ui=v2`, storage keys) are in `docs/ARCHITECTURE.md`.
