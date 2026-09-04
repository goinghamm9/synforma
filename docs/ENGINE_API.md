# Synforma engine API (for UI builders)

Everything lives under `lib/synforma`. Import paths use the `@/` alias. The engine is
browser-side (it drives a same-origin iframe); only the Gemini route is server-side.

## Types — `@/lib/synforma/types`
`PageModel`, `SemanticElement`, `Action`, `ActionResult`, `WorkGraph`, `GraphNode`, `GraphEdge`,
`NodeType`, `Program`, `ParsedObjective`, `Requirement`, `Workflow`, `WorkflowStep`, `ExecutionMode`
("guide" | "assist" | "act"), `Run`, `RunEvent`, `RunEventType`, `StruggleSignal`, `Hypothesis`,
`Intervention`, `InterventionScore`, `InterventionTechnique`, `AuditEntry`, `ApprovalRequest`,
`ProgramMetrics`, `StepMetrics`, `SynformaSettings`, `DEFAULT_SETTINGS`.

## Store — `@/lib/synforma/store` (zustand + localStorage, client only)
```ts
import { useSynforma, selectActiveProgram, selectRunsForProgram, selectEventsForRun, selectInterventionsForProgram, useHydrated } from "@/lib/synforma/store";
const programs = useSynforma((s) => s.programs);            // Record<id, Program>
const graph = useSynforma((s) => s.graphs[program.graphId]);
const { upsertProgram, saveGraph, saveDiscovery, addRun, updateRun, addEvent, addSignal, addHypothesis, upsertIntervention, addAudit, addApproval, decideApproval, setSettings, deleteProgram, resetAll, exportJSON, importJSON, setActiveProgram } = useSynforma.getState();
```
`discoveries[programId]` holds the `DiscoveredState[]` from the last discovery (needed by the planner).
Persisted state rehydrates after mount: render a skeleton until `useHydrated()` is true (or
`useSynforma.persist.onFinishHydration`). Never read the store during SSR.

## Driver — `@/lib/synforma/interaction/driver`
```ts
const driver = new IframeDriver(iframeEl, { paceMs: 350, events: { onCursor(rect, label), onHighlight(rect, label), onNavigate(url), onLog(msg) } });
await driver.goto("/sandbox/crm");            // full load
const { page, elements } = driver.snapshot(); // PageModel + live element map
await driver.perform(action);                 // ActionResult (regrounded flag = self-healing)
driver.currentUrl(); driver.frameRect(); driver.rectFor(key); driver.paceMs = 0;
```
Rects from `onCursor`/`onHighlight`/`rectFor` are in the iframe's viewport coordinates: add
`driver.frameRect().left/top` to draw overlays in the parent page.

## Explorer — `@/lib/synforma/engine/explorer`
```ts
const graph = createGraph(shortId("g"));      // from "@/lib/synforma/graph/work-graph"
const { states, stats } = await explore({ driver, startUrl, appName, graph, limits: { maxStates: 40, timeBudgetMs: 120000 }, onEvent, signal });
// onEvent receives { type: "log" | "state" | "action" | "graph" | "done", ... } — "graph" carries the live WorkGraph (clone before putting in React state: cloneGraph(graph)).
```
Discovery never executes commit actions. Takes ~10–20 s on the sandbox.

## Planner — `@/lib/synforma/planner`
```ts
const status = await fetchPlannerStatus();               // { configured, provider, model? } from /api/planner/status
const kind = resolvePlannerKind(settings.plannerPreference, status); // "heuristic" | "gemini"
const planner = createPlanner(kind);
const parsed = await planner.parseObjective({ objectiveText, appName });
const workflow = await planner.inferWorkflow({ parsed, states, graph, startUrl }); // also adds requirement/workflow/step nodes to graph
const diagnosis = await planner.diagnose({ step, workflow, requirements, signals });
const content = await planner.composeAssistance({ step, workflow, requirements, hypothesis, technique, policyConstraints });
```
Templated action values: `{{req:r1}}`, `{{req:r5:date}}`, `{{field:key}}` are resolved at run time by
`resolveValue(action, requirements, context, field)` from `@/lib/synforma/planner/heuristic`.

## Runner (Act / Assist) — `@/lib/synforma/engine/runner`
```ts
const result = await runWorkflow({ driver, workflow, requirements, context, actor: "agent", hooks: {
  onEvent(type, data, stepId, message) {/* store.addEvent({ runId, type, data, stepId, message }) */},
  requestApproval: async (req) => "granted" | "denied", // show an approval dialog; store.addApproval
  onStep(step, status) {},
}, capabilities?, requireApprovalForCommit: settings.requireApprovalForCommit, signal, onlySteps?: [stepId] });
// result: { outcome: "completed" | "abandoned" | "failed", requirementsMet, regroundings, failedStepId?, error?, outcomeUrl? }
```
`context` is `Record<string,string>`; `DEFAULT_CONTEXT` / `DEFAULT_OBJECTIVE` / `SANDBOX_APP` / `CONTEXT_FIELDS` in `@/lib/synforma/demo`.
`verifyRequirements(page, requirements)` checks the outcome screen.

## Human observer (Guide) — `@/lib/synforma/engine/observer`
```ts
const observer = new HumanObserver({ driver, workflow, requirements, hesitationThresholdMs, hooks: {
  onEvent, onStepChange(step, index, page), onSignal(signal) /* feed reactToSignal */, onComplete({ requirementsMet, outcomeUrl }), onChecklist(items), onPage(page) } });
observer.start(); observer.stop(); observer.touch(); observer.currentStep;
resolveAnchorRect(driver, anchor, page) // → { rect, key, name } | null for highlighting
anchorMatchesPage(anchor, page)
```

## Adoption engine — `@/lib/synforma/engine/adoption`
```ts
const intervention = await reactToSignal(signal, { planner, program, getSignalsForStep, getInterventionsForStep, getRuns, saveHypothesis, saveIntervention });
rankTechniques({ step, hypothesis, existing, runs }) // [{ technique, score }] for "Why this?"
assignCohort(runId, treatmentShare)                  // "control" | "treatment"
evaluateIntervention(intervention, runs)             // { treated, treatedCompleted, control, controlCompleted, lift, sufficient }
```

## Metrics — `@/lib/synforma/engine/metrics`
`computeProgramMetrics(program, runs, events)` → `ProgramMetrics` (null rates until `MINIMUM_RUNS` = 5 finished runs → show "Still learning").
`completionByVariant(runs)`; `isIntentToOutcomeSuccess(run, requirementCount)`.

## Synthetic users — `@/lib/synforma/engine/synthetic`
`PERSONAS` / `PERSONA_BY_ID`; run each with `runWorkflow({ ..., actor: "synthetic", capabilities: persona.capabilities })`.
Synthetic runs must be labeled as simulation everywhere and excluded from human timing.

## Science — `@/lib/synforma/science/techniques`, `@/lib/synforma/science/citations`
`TECHNIQUES`, `TECHNIQUE_BY_ID`, `EVIDENCE_LABEL`, `BARRIER_LABEL`, `BARRIER_SHORT`, `CITATIONS`, `CITATION_BY_ID`, `cite(id)`.
Only cite from this registry. Never invent citations or statistics.

## Work Graph — `@/lib/synforma/graph/work-graph`
`createGraph`, `upsertNode`, `upsertEdge`, `neighbors`, `countByType`, `nodesOfType`, `cloneGraph`, `nodeId(type, ...parts)`.
Node types: application, screen, action, field, object, workflow, step, requirement, objective, role, person, outcome, policy, capability, intervention.
Edge types: contains, navigates_to, performs, requires, fulfills, produces, constrained_by, assigned_to, targets, depends_on, addresses, uses, reveals.

## Sandbox facts (do not hard-code in the engine; fine for demo defaults)
Base `/sandbox/crm`; entry lead `/sandbox/crm/leads/L-1001`; `?ui=v2` switches the vendor UI version
(also a switch in `/sandbox/crm/settings`). Data in localStorage `meridian-crm-db`, version in
`meridian-ui-version`. The sandbox pages are client components hydrated from localStorage.

## Engine harness for tests
`/dev/engine` exposes `window.__synforma` = { driver, planner, snapshot(url), discover(), plan(), act(context, approve), observe(onSignal) }.
Playwright: `chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })`.

## Added by the master-spec integration (friction, telemetry, policy, proficiency)

### Friction engine — `@/lib/synforma/engine/friction`
`inferFriction(ctx)` → `FrictionInference { state, confidence, evidence, alternatives, ruleVersion }`; states: FLUENT, VISUAL_SEARCH, DECISION_UNCERTAINTY, WORKFLOW_KNOWLEDGE_GAP, POLICY_UNCERTAINTY, ERROR_RECOVERY, WORKFLOW_FRICTION, TIME_PRESSURE, UNKNOWN.
`FRICTION_LABEL`, `FRICTION_SHORT`. The observer runs it every ~1.5 s and emits `friction_inferred` events (data: state, confidence, evidence, alternatives, ruleVersion) plus `hooks.onFriction(inference)`.
Struggle signals now carry `frictionState`, `frictionConfidence`, `evidence` and new types `visual_search | decision_uncertainty | error_recovery`.

### Telemetry — `@/lib/synforma/interaction/telemetry`
`PointerAggregator`, `KeyboardAggregator` (used internally by the observer), `isSensitiveField`, `classifyKey`, `GazeProvider` (interface only; nothing implemented, nothing collected).
Events `pointer_window` / `keyboard_window` contain aggregates only (no coordinates, no key values). Show them in a "what Synforma sees" inspector.

### Observer options
`new HumanObserver({ ..., sensing: settings.interactionSensing && !settings.sensingPaused, policyConstraints: program.parsed.policyConstraints, hooks: { ..., onFriction } })`; `observer.setSensing(on)`; `observer.latestFriction`.

### Decision policy — `@/lib/synforma/engine/adoption`
`decide(signal, deps)` → `Decision { selected, candidates[{techniqueId,total}], hypothesis, intervention | null, reason }` — `selected === "do_nothing"` means stay quiet (record an `intervention_withheld` event with the candidates so the UI can show "why nothing appeared"). `reactToSignal` still returns just the intervention.
`deps` now accepts `preference` (AssistancePreference), `getItDone`, `proficiency` (ProficiencyState for the step), `shownThisRun`, `sinceLastShownMs`.
`FRICTION_TO_BARRIER`, `scoreDoNothing`, `rankTechniques(ctx)` (includes the DO_NOTHING candidate). New techniques: `do_nothing`, `clarify_consequence`, `recommend_redesign` (`DO_NOTHING_ID` in science/techniques).

### Proficiency & fading — `@/lib/synforma/engine/proficiency`
Store: `useSynforma((s) => s.proficiency[`${programId}/${stepId}`])`, `setProficiency(p)`.
`initialProficiency(programId, stepId)`, `stepOutcomesForRun(run, events, workflow)`, `updateProficiency(prev, outcome) → { next, faded }` (call for each step when a human run finishes; emit `proficiency_updated`), `interruptionMultiplier(p)`, `LEVEL_LABEL`, `LEVEL_ORDER`.

### Get It Done — runner option
`runWorkflow({ ..., routineOnly: true })` fills routine inputs, leaves judgment fields to the person (emits `note` with `skippedJudgment`), and stops before the commit (emits `note` with `stoppedBeforeCommit`). Combine with `onlySteps` for a single step.

### Preferences — settings & runs
`settings.assistancePreference` ("just_do_it" | "work_with_me" | "teach_me" | "stay_out"), `settings.interactionSensing`, `settings.sensingPaused`; `run.preference`, `run.getItDone`, `run.assistanceShown`, `run.withheld`.

### Admin recommendation — `@/lib/synforma/engine/recommend`
`recommend(program, metrics, runs, events, hypotheses, interventions)` → `Recommendation { class, headline, rationale, evidence, unlikelyToHelp, confidence, stepId, stepTitle, frictionDistribution }`; `RECOMMENDATION_LABEL`; `MIN_RUNS_FOR_RECOMMENDATION` = 3.

### Provenance
Every GraphNode carries `provenance { source, trust, observedAt }` (`TrustState`). Show it in node details as "How Synforma knows this".
`action_regrounded` events now include `data.change` (a UI change event: type, screen, affectedStep, risk) — surface as "Change detected" entries.
