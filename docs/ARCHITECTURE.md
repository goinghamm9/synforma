# Synforma architecture

Synforma is an **Enterprise Intent Layer** prototype. The problem it works on is not teaching people
where to click. It is: establishing trustworthy ground truth about what should happen, knowing when
Synforma is certain enough to intervene or act, and continuously proving that the human-system
combination got better. Its shape follows the thesis:

```
┌──────────────────────────────────────────────────────────────┐
│  Intent Engine        "What is the person trying to do?"     │  lib/synforma/planner
├──────────────────────────────────────────────────────────────┤
│  Work Graph           people · roles · objectives · workflows │  lib/synforma/graph
│                       screens · actions · fields · objects    │
│                       requirements · policies · outcomes      │
├──────────────────────────────────────────────────────────────┤
│  Reasoning / Orchestration     GUIDE   ·   ASSIST   ·   ACT   │  planner (modes) + engine/runner
├──────────────────────────────────────────────────────────────┤
│  Autonomous Adoption Engine                                   │  engine/observer + engine/adoption
│  Observe → Diagnose → Intervene → Experiment → Learn          │  + engine/metrics
├──────────────────────────────────────────────────────────────┤
│  Universal Interaction Layer                                  │  lib/synforma/interaction
│  DOM · accessibility semantics · (roadmap: API, MCP, vision)  │
├──────────────────────────────────────────────────────────────┤
│  Target applications              Meridian CRM sandbox        │  app/sandbox/crm
└──────────────────────────────────────────────────────────────┘
   wrapped by: approvals · audit log · cohorts · settings · local-only data
```

## The operating architecture (target) and what exists

```
                 OUTCOME GRAPH        roadmap (objective → process → workflow → action → application)
                      │
                 INTENT ENGINE        planner: objective → program (population, requirements, policy, success)
                      │
                   WORK GRAPH         graph/: screens · actions · fields · objects · requirements · workflow · steps
                      │
        ┌─────────────┼─────────────┐
 CONFIGURATION    KNOWLEDGE      SKILL
     GRAPH          GRAPH         GRAPH   observed interface (tenant truth) · objective + citations · proficiency per step
        └─────────────┼─────────────┘
               EVIDENCE ENGINE        engine/evidence.ts: claims with source, authority, freshness, confidence,
                      │               scope, validator, contradictions; belief by authority hierarchy
                  TRUST ENGINE        engine/trust.ts: action classes A–D, Autonomy Contract (auto / ask / never),
                      │               decision from confidence × reversibility × consequence; conflict → STOP
              INTERVENTION ENGINE     engine/adoption.ts: friction → hypothesis → DO_NOTHING vs technique,
                      │               interruption budget, preference, mode, proficiency
               AUTONOMY ENGINE        runner: Act / Get It Done (routine only) / Assist a step
                      │
          GUIDE • ASSIST • ACT        per step, per person, per context
                      │
               EXECUTION LAYER        interaction/driver.ts (same-origin iframe); roadmap: API · MCP · extension · computer use
                      │
                 OBSERVATION          interaction/snapshot.ts + telemetry.ts (pointer / keyboard metadata; gaze interface only)
                      │
               OUTCOME MEASURE        engine/metrics.ts + recommend.ts
                      │
                     LEARN            proficiency fading, intervention evaluation, claims superseded by live observation
```

Surrounding everything: approvals, audit, the provenance + rollback ledger (`engine/ledger.ts`), cohorts,
local-only data, and the person's controls. Demonstration capture (`engine/demonstration.ts`) lets an
expert teach a workflow by performing it once.

Principles encoded as code: reversible autonomy (autonomy grows with reversibility × confidence ÷
consequence); conflicting sources stop autonomy; DO_NOTHING is a decision; optimize the system, not
obedience to the system; one success is never mastery; typed values never enter telemetry.

## Runtime topology

Everything except the optional LLM call runs **in the browser**. Mission Control (`/demo`) and the
Employee view (`/employee`) embed the target application in a same-origin `<iframe>`; the engine reads
and drives it through `IframeDriver`. State persists in `localStorage` via a zustand store that mirrors
the collections a server deployment would hold.

```
browser ──► /demo, /employee, /graph (React, client components)
              │
              ├─ lib/synforma (engine, pure TypeScript)
              │     └─ IframeDriver ──► <iframe src="/sandbox/crm/…">  (any semantic web app)
              │
              └─ fetch /api/planner ──► server route ──► Gemini (optional, key never leaves the server)
```

The same `Planner` interface is implemented by `HeuristicPlanner` (deterministic, no key) and
`GeminiPlanner` (browser client → server route → provider abstraction → Gemini). The UI labels which
one made each decision.

## Module map

| Module | Responsibility |
|---|---|
| `lib/synforma/types.ts` | Domain contracts: PageModel, Action, WorkGraph, Program, Workflow, Run, RunEvent, StruggleSignal, Hypothesis, Intervention, AuditEntry, Metrics |
| `interaction/accessible-name.ts` | Pragmatic WAI-ARIA accessible name / description / group name |
| `interaction/snapshot.ts` | DOM → `PageModel`: interactive elements with semantic keys, roles, values, options, container paths, dialogs, alerts, tables, definition lists, commit classification, route generalization, state fingerprint |
| `interaction/text.ts` | Tokenizer, small enterprise synonym lexicon, similarity, hashing |
| `interaction/grounding.ts` | Semantic grounding: score elements by role, name, description/options, hints, region, commit affinity |
| `interaction/driver.ts` | `IframeDriver`: goto, waitForSettle (mutation quiet), snapshot, perform (click/type/select/check/expand/navigate) with React-compatible events and semantic re-grounding |
| `graph/work-graph.ts` | Work Graph builder: nodes, edges, neighbors, counts |
| `engine/explorer.ts` | Autonomous discovery over links, menus, tabs, disclosures, wizards, dialogs; never commits |
| `planner/types.ts` | `Planner` interface and run capabilities |
| `planner/heuristic.ts` | Objective parsing, form-chain selection, requirement→field mapping, Guide/Assist/Act policy, diagnosis rules, assistance templates, value resolution |
| `planner/gemini.ts` + `planner/protocol.ts` | LLM client and Zod wire contract |
| `planner/server/*` + `app/api/planner` | Provider abstraction, prompts, validation, status |
| `engine/runner.ts` | Executes a workflow (Act) or one step (Assist) with approval gates, validation repair, outcome verification |
| `engine/observer.ts` | Watches a human: step inference from anchors, live requirement checklist, struggle signals, completion |
| `engine/adoption.ts` | Diagnose → score techniques → compose → cohort assignment → evaluate |
| `engine/metrics.ts` | Intent-to-Outcome Rate, per-step friction, cohorts; computed from events only |
| `engine/synthetic.ts` | Synthetic personas = the runner with capabilities switched off |
| `science/techniques.ts`, `science/citations.ts` | The only sources of techniques and citations |
| `engine/evidence.ts` | Claims (source, authority, freshness, confidence, scope, validator, contradictions), belief resolution, truth report |
| `engine/trust.ts` | Action classes, Autonomy Contract, trust decision (act / prepare_ask / guide / ask / stop) |
| `engine/ledger.ts` | Provenance + rollback ledger entries with before/after state; undo of reversible actions |
| `engine/demonstration.ts` | Demonstration recorder (semantic trace, no typed values) and workflow reconstruction with clarification questions |
| `engine/proficiency.ts` | Fading, skill status with decay and staleness after workflow change, intervention budget, modes, teach-after recap |
| `engine/recommend.ts` | System-vs-human diagnosis for administrators |
| `store/index.ts` | zustand + localStorage persistence (incl. claims, ledger, contracts, proficiency), export/import |

## Data model

The store's collections map one-to-one to the tables a Postgres deployment would use (with `org_id`
and row-level security added):

| Collection | Table (future) | Notes |
|---|---|---|
| `programs` | `programs` | objective, parsed program, workflow, planner kind, discovery stats |
| `graphs` | `work_graph_nodes`, `work_graph_edges` | typed nodes with confidence and status |
| `discoveries` | `application_states` | serialized PageModels + replay paths |
| `runs` | `runs` | actor (agent / human / synthetic), mode, cohort, uiVariant, requirementsMet, regroundings |
| `events` | `run_events` | append-only timeline |
| `signals` | `struggle_signals` | hesitation, validation_error, backtrack, wrong_screen, abandon |
| `hypotheses` | `hypotheses` | barrier, confidence, evidence, alternatives |
| `interventions` | `interventions` | technique id, content, score components, experiment config, status |
| `approvals` | `approvals` | payload shown, decision, timestamps |
| `audit` | `audit_log` | every action, approval and run lifecycle event |
| `settings` | `org_settings` | planner preference, thresholds, cohort share |
| `claims` | `claims` | evidence per program with authority, status, contradictions |
| `ledger` | `action_ledger` | before/after, approval, rollback capability, rolled-back marker |
| `contracts` | `autonomy_contracts` | per workflow, versioned, approver |
| `proficiency` | `proficiency_state` | per person × workflow × step (employee-private) |

## Trust properties (enforced in code, not policy text)

- **Discovery never commits.** `snapshot.ts` classifies commit controls (submit buttons and buttons named create/save/delete/send/…); `explorer.ts` records but never executes them.
- **Commits are approval-gated.** `runner.ts` requests approval before the committing action of any step flagged `commit`; denial abandons the run. Approvals are stored with the exact payload shown.
- **Judgment is never automated away.** Steps with judgment requirements are `guide`; the adoption engine gives `act` techniques zero context fit there.
- **Everything is audited.** Every executed action, re-grounding, approval and run lifecycle event is an event/audit entry.
- **Nothing inferred is presented as fact.** Nodes carry `confidence` and `status` (hypothesis / observed / confirmed); metrics return `null` until `MINIMUM_RUNS`.
- **Data stays local.** No network calls except the optional planner route; export/import/delete in Settings.

## Self-healing

Workflow actions store the *semantic identity* of their targets (role, accessible name, region, commit
class), never DOM ids or classes. When a key no longer resolves, `IframeDriver.resolve` re-grounds by
meaning (`grounding.ts`) and reports it as an `action_regrounded` event. The sandbox's v2 UI (renamed
labels, kebab menu, tab instead of collapsible, changed ids, reordered nav, different button names) is
handled without any change to the stored workflow.

## Limitations of this prototype

- Same-origin iframe only; cross-origin applications need the extension/Playwright/API drivers on the roadmap.
- The heuristic planner reasons lexically; it is transparent and fast but not general. The LLM planner improves understanding but is optional and unverified against a live key in this environment.
- Struggle detection uses timing and DOM signals; there is no eye tracking, no biometric or affective inference, and none is planned.
- Metrics are descriptive. Lift is reported only when both cohorts reach the minimum sample.
