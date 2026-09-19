# Synforma architecture

Synforma is an **Enterprise Intent Layer** prototype. The problem it works on is not teaching people
where to click. It is: establishing trustworthy ground truth about what should happen, knowing when
Synforma is certain enough to intervene or act, and continuously proving that the human-system
combination got better.

Contents: [Layers](#layers) · [Operating stack](#operating-stack) · [Runtime topology](#runtime-topology) ·
[Mission Control views](#mission-control-views) · [Module map](#module-map) · [Data model](#data-model) ·
[Trust properties](#trust-properties) · [Self-healing](#self-healing) · [Knowledge layers](#knowledge-layers) ·
[Design language](#design-language) · [Sandbox specification](#sandbox-specification-meridian-crm) ·
[Limitations](#limitations-of-this-prototype)

## Layers

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
│  DOM · accessibility semantics · (roadmap: extension, API)    │
├──────────────────────────────────────────────────────────────┤
│  Target applications              Meridian CRM sandbox        │  app/sandbox/crm
└──────────────────────────────────────────────────────────────┘
   wrapped by: approvals · audit log · cohorts · settings · local-only data
```

## Operating stack

The target architecture, and what exists in this build.

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
               AUTONOMY ENGINE        engine/runner.ts: Act / Get It Done (routine scope) / Assist a step, under a RunPolicy
                      │
          GUIDE • ASSIST • ACT        per step, per person, per context
                      │
               EXECUTION LAYER        interaction/driver.ts (same-origin iframe); roadmap: extension · API connectors
                      │
                 OBSERVATION          interaction/snapshot.ts + telemetry.ts (pointer / keyboard metadata; gaze interface only)
                      │
               OUTCOME MEASURE        engine/metrics.ts + recommend.ts
                      │
                     LEARN            proficiency fading, intervention evaluation, claims superseded by live observation
```

Surrounding everything: approvals, audit, the provenance and rollback ledger (`engine/ledger.ts`),
cohorts, local-only data, and the person's controls. Demonstration capture (`engine/demonstration.ts`)
lets an expert teach a workflow by performing it once.

Principles encoded as code: reversible autonomy (autonomy grows with reversibility × confidence ÷
consequence); conflicting sources stop autonomy; DO_NOTHING is a decision; optimize the system, not
obedience to the system; one success is never mastery; typed values never enter telemetry.

## Runtime topology

Everything except the optional language-model call runs **in the browser**. Mission Control (`/demo`)
and the employee view (`/employee`) embed the target application in a same-origin `<iframe>`; the
engine reads and drives it through `IframeDriver`. State persists in `localStorage` via a zustand
store that mirrors the collections a server deployment would hold.

```
browser ──► /demo, /employee, /graph (React client components)
              │
              ├─ lib/synforma (engine, pure TypeScript)
              │     └─ IframeDriver ──► <iframe src="/sandbox/crm/…">  (any semantic web app on the same origin)
              │
              └─ fetch /api/planner ──► Next.js route (Node runtime) ──► provider registry ──► Claude or Gemini
                                        keys live here only; the browser sees { configured, provider, model }
```

The `Planner` interface has two implementations. `HeuristicPlanner` is deterministic and needs no key.
`RemotePlanner` (`planner/remote.ts`) is the browser-side client for the server route; it wraps the
heuristic planner, asks the model for the parts a model is good at (objective parsing, requirement to
field mapping, diagnosis, assistance wording) and validates every reply with Zod. Structure (paths,
actions, anchors, graph edges) always comes from the heuristic planner. Any failure returns the
heuristic result. The server side (`planner/server`) holds an `LLMProvider` abstraction with two
providers, `AnthropicProvider` (`ANTHROPIC_API_KEY`, structured outputs via `output_config.format`
json_schema) and `GeminiProvider` (`GEMINI_API_KEY`, `responseSchema`). Claude is preferred when both
keys are set; `PLANNER_PROVIDER` pins one. `PlannerKind` is `"heuristic" | "claude" | "gemini"`, and the
UI labels which one made each decision (`plannerLabel` in `planner/index.ts`).

Hosting: production runs on Netlify's Next.js runtime so the planner route works (see
`docs/OPERATIONS.md`). A static export (`npm run build:static`) has no planner route and always runs
the heuristic planner.

## Mission Control views

`/demo` has two views, stored in settings as `demoView: "simple" | "advanced"` (default simple).

- **Simple** is one screen with three stages. Connect is automatic. Objective offers
  "Discover and plan", which runs discovery and planning together. Run offers "Run it" (execution with
  the approval gate), then Undo, and "Vendor update" plus "Run again" to show self-healing. A one-line
  trust summary shows claims, contested count and contract status, and a "Details" link opens the
  advanced view.
- **Advanced** is the five-phase layout: Connect, Understand, Act, Guide & Observe, Adapt, Measure, with
  the evidence panel, the Autonomy Contract, trust decisions, the ledger and the demonstration panel.
  The phase panels live in `components/demo/phases/`; the trust-layer components in `components/trust/`.

Both views drive the same engine and store; the simple view hides panels, it does not skip gates.

## Module map

| Module | Responsibility |
|---|---|
| `lib/synforma/types.ts` | Domain contracts: PageModel, Action, WorkGraph, Program, Workflow, Run, RunEvent, StruggleSignal, Hypothesis, Intervention, Claim, AutonomyContract, LedgerEntry, ProficiencyState, AuditEntry, Metrics, SynformaSettings |
| `interaction/accessible-name.ts` | Pragmatic WAI-ARIA accessible name / description / group name |
| `interaction/snapshot.ts` | DOM → `PageModel`: interactive elements with semantic keys, roles, values, options, container paths, dialogs, alerts, tables, definition lists, commit classification, route generalization, state fingerprint |
| `interaction/text.ts` | Tokenizer, small enterprise synonym lexicon, similarity, hashing |
| `interaction/grounding.ts` | Semantic grounding: score elements by role, name, description/options, hints, region, commit affinity |
| `interaction/driver.ts` | `IframeDriver`: goto, waitForSettle (mutation quiet), snapshot, perform (click/type/select/check/expand/navigate) with React-compatible events and semantic re-grounding |
| `interaction/telemetry.ts` | Pointer and keyboard-metadata aggregation into 1-second windows; sensitive-field suppression; gaze interface (unimplemented) |
| `graph/work-graph.ts` | Work Graph builder: nodes with provenance, edges, neighbors, counts |
| `engine/explorer.ts` | Autonomous discovery over links, menus, tabs, disclosures, wizards, dialogs; never commits |
| `planner/types.ts` | `Planner` interface and run capabilities |
| `planner/heuristic.ts` | Objective parsing, form-chain selection, requirement→field mapping, Guide/Assist/Act policy, diagnosis rules, assistance templates, value resolution |
| `planner/remote.ts` + `planner/protocol.ts` | Browser client for the server planner, and the Zod wire contract (requests, responses, status) |
| `planner/index.ts` | `fetchPlannerStatus`, `resolvePlannerKind`, `createPlanner`, `configuredLlmKind`, `plannerLabel`, `plannerVendor` |
| `planner/server/*` + `app/api/planner` | Provider registry (`getProvider`, `describeProvider`), `AnthropicProvider`, `GeminiProvider`, prompts and response schemas, the route handler with validation, retry, rate limit and deadline |
| `engine/runner.ts` | Executes a workflow or selected steps under a `RunPolicy` (commits ask/auto, scope all/routine, trust gate) with approval gates, validation repair, outcome verification and optional ledger entries |
| `engine/observer.ts` | Watches a human: step inference from anchors, live requirement checklist, struggle signals, friction inference, completion |
| `engine/friction.ts` | Observable interaction states from semantic context and telemetry windows (rule version `friction-v0.1`) |
| `engine/adoption.ts` | Diagnose → score techniques (DO_NOTHING included) → compose → cohort assignment → evaluate |
| `engine/proficiency.ts` | Fading, skill status with decay and staleness after workflow change, intervention budget, modes, teach-after recap |
| `engine/metrics.ts` | Intent-to-Outcome Rate, per-step friction, cohorts; computed from events only |
| `engine/recommend.ts` | System-vs-human diagnosis for administrators |
| `engine/synthetic.ts` | Synthetic personas: the runner with capabilities switched off |
| `engine/evidence.ts` | Claims (source, authority, freshness, confidence, scope, validator, contradictions), belief resolution, truth report |
| `engine/trust.ts` | Action classes, Autonomy Contract, trust decision (act / prepare_ask / guide / ask / stop) |
| `engine/ledger.ts` | Provenance and rollback ledger entries with before/after state; undo of reversible actions |
| `engine/demonstration.ts` | Demonstration recorder (semantic trace, no typed values) and workflow reconstruction with clarification questions |
| `science/techniques.ts`, `science/citations.ts` | The only sources of techniques and citations |
| `store/index.ts` | zustand + localStorage persistence (programs, graphs, discoveries, runs, events, signals, hypotheses, interventions, audit, approvals, proficiency, claims, ledger, contracts, settings), export/import, settings migration |
| `demo.ts` | Demo defaults: sandbox descriptor, default objective and context |

## Data model

The store's collections map one-to-one to the tables a Postgres deployment would use (with `org_id`
and row-level security added):

| Collection | Table (future) | Notes |
|---|---|---|
| `programs` | `programs` | objective, parsed program, workflow, planner kind, discovery stats |
| `graphs` | `work_graph_nodes`, `work_graph_edges` | typed nodes with confidence, status and provenance |
| `discoveries` | `application_states` | serialized PageModels + replay paths |
| `runs` | `runs` | actor (agent / human / synthetic), mode, cohort, uiVariant, requirementsMet, regroundings, preference, getItDone |
| `events` | `run_events` | append-only timeline (see the event schema in `docs/OPERATIONS.md`) |
| `signals` | `struggle_signals` | hesitation, validation_error, backtrack, wrong_screen, abandon, visual_search, decision_uncertainty, error_recovery |
| `hypotheses` | `hypotheses` | barrier, confidence, evidence, alternatives |
| `interventions` | `interventions` | technique id, content, score components, experiment config, status |
| `approvals` | `approvals` | payload shown, decision, timestamps |
| `audit` | `audit_log` | every action, approval and run lifecycle event |
| `settings` | `org_settings` | planner preference, assistance preference, sensing, thresholds, cohort share, demo view |
| `claims` | `claims` | evidence per program with authority, status, contradictions |
| `ledger` | `action_ledger` | before/after, approval, rollback capability, rolled-back marker |
| `contracts` | `autonomy_contracts` | per workflow, versioned, approver |
| `proficiency` | `proficiency_state` | per person × workflow × step (employee-private) |

## Trust properties

Enforced in code, not policy text.

- **Discovery never commits.** `snapshot.ts` classifies commit controls (submit buttons and buttons named create/save/delete/send/…); `explorer.ts` records but never executes them.
- **Commits are approval-gated.** With the default `RunPolicy` (`commits: "ask"`), `runner.ts` requests approval before the committing action of any step flagged `commit`; denial abandons the run. Approvals are stored with the exact payload shown. `commits: "auto"` exists only for simulations and for a commit the person approved a moment ago.
- **Judgment is never automated away.** Steps with judgment requirements are `guide`; the adoption engine gives `act` techniques zero context fit there; the routine scope leaves judgment fields to the person; a language-model step mode can never turn a judgment step into `act`.
- **Conflicting sources stop autonomy.** A contested claim on a step makes the trust decision `stop` and the runner abandons the run.
- **Everything is audited.** Every executed action, re-grounding, approval, trust decision and run lifecycle event is an event or audit entry; every executed action can also be a ledger entry with before and after state.
- **Nothing inferred is presented as fact.** Nodes carry `confidence`, `status` (hypothesis / observed / confirmed) and `provenance`; metrics return `null` until `MINIMUM_RUNS`.
- **Data stays local.** No network calls except the optional planner route; export/import/delete in Settings.

## Self-healing

Workflow actions store the *semantic identity* of their targets (role, accessible name, region, commit
class), never DOM ids or classes. When a key no longer resolves, `IframeDriver.resolve` re-grounds by
meaning (`grounding.ts`) and reports it as an `action_regrounded` event carrying a `ui_element_changed`
change record. The sandbox's v2 UI (renamed labels, kebab menu, tab instead of collapsible, changed
ids, reordered nav, different button names) is handled without any change to the stored workflow.
Re-grounding also supersedes the old naming claim in the evidence set with a live observation.

## Knowledge layers

The master specification describes five knowledge layers and an Enterprise Configuration Twin with
three layers of truth. This is how they map to the prototype.

| Layer | Specification | This build | Trust state used |
|---|---|---|---|
| Live application understanding | DOM / accessibility / route state, semantic actions not selectors | `interaction/snapshot.ts` + `engine/explorer.ts`: every screen, action, field, object and dialog observed live, addressed by role + accessible name + region | `AUTHORITATIVE_LIVE` / `OBSERVED_HIGH_CONFIDENCE` |
| Organizational context | SOPs, policies, required fields, terminology | The objective text: requirements, judgment flags, policy constraints, success definition (`planner.parseObjective`) | `ORGANIZATION_APPROVED` |
| Personal context | known workflows, preferred assistance, proficiency, time pressure | `proficiency` per step, `assistancePreference`, Get It Done, run history | private to the person |
| Product knowledge | vendor docs, release notes as structured change events | Not yet. Re-grounding events carry `ui_element_changed` change records, the seed of drift detection | — |
| Native connectors / capability model | APIs, normalized capabilities | Not yet; the `Driver` interface is the seam | — |

Configuration Twin truths:

- **Vendor truth**: roadmap (documentation ingestion).
- **Tenant truth**: partially. The discovered Work Graph *is* the observed configuration of this
  instance (fields, options, required flags, menus, dialogs).
- **Operational truth**: runs and events show how people actually complete the workflow; the admin
  recommendation distinguishes learning needs from interface, policy and process problems.

Source authority, highest first: `AUTHORITATIVE_LIVE`, `AUTHORITATIVE_METADATA`, `ORGANIZATION_APPROVED`,
`VENDOR_DOCUMENTED`, `OBSERVED_HIGH_CONFIDENCE`, `OBSERVED_LOW_CONFIDENCE`, `MODEL_INFERRED`, `UNKNOWN`
(`AUTHORITY_ORDER` in `engine/evidence.ts`; the graph and the Science page re-export it). The graph
builder never downgrades observed facts by inferences; inferred nodes carry `MODEL_INFERRED` and the
planner that made them. Conflicts between stated policy and observed interface are surfaced, not
resolved silently: a requirement with no matching field is a contested claim.

## Design language

The visual language should feel like a premium scientific journal crossed with a serious laboratory.
Calm, precise, no hype.

### Palette (Tailwind tokens defined in `app/globals.css`)

| token | hex | use |
|---|---|---|
| `paper` | #fafaf7 | page background |
| `surface` | #ffffff | cards, panels |
| `surface-2` | #f3f2ee | secondary fills, hover |
| `surface-3` | #ebe9e3 | tertiary fills, skeletons |
| `ink` | #0b0b0c | primary text, primary buttons |
| `graphite` | #3a3a3c | secondary text |
| `slate` | #6b6b70 | tertiary text, eyebrows |
| `mist` | #9a9a9e | placeholders, disabled |
| `line` | #e4e2dd | hairlines |
| `line-strong` | #cfccc5 | borders on controls |
| `signal` / `signal-soft` | #b4532a / #f4e6df | attention, errors, struggle; use sparingly |
| `verdant` / `verdant-soft` | #2f6b4f / #e3ede7 | confirmed outcomes, completion |
| `amber` / `amber-soft` | #8a6a1f / #f2ead6 | hypotheses, inferences, "insufficient evidence" |

Never: purple gradients, neon blue, glowing brains, robot imagery, sparkles, stock wellness imagery.

### Typography

- Geist Sans (variable) via `font-sans`; Geist Mono via `font-mono` for data.
- Display headings use `.display` (tight tracking, 1.02 line height), weight 500.
- Eyebrows use `.eyebrow` (11px uppercase, wide tracking, slate).
- Data uses `.mono-data` (tabular numerals).

### Structure and motion

- Generous whitespace. Max content width 1200px (`max-w-6xl`) for the site, full-bleed for the product.
- Fine structural lines (`border-line`) instead of shadows. Shadows only on floating layers (dialogs, menus).
- `.grid-paper` and `.dot-paper` backgrounds for diagram areas, subtle.
- Border radius: `rounded-md` (8px) for controls, `rounded-lg` (12px) for cards.
- Motion is restrained and meaningful: reveal on scroll with `motion/react`, 300–500 ms ease-out, small
  translate. Animate when a relationship changes (a node appears in the Work Graph, an action is
  executed, a step completes), never for decoration. Respect `prefers-reduced-motion`.

### Components and voice

`components/ui/*` are the shared primitives (Button, Card, Input, Textarea, Label, Badge, Tabs, Dialog,
Switch, Tooltip, Progress, Skeleton, Separator, NativeSelect, Table, DropdownMenu); import from
`@/components/ui`. Brand marks: `SynformaMark`, `SynformaWordmark`, `SynformaLogo` from
`@/components/brand/logo`. Trust tones for claims and decisions are in `components/trust/trust-tone.ts`.

Voice: intelligent, calm, precise. No exclamation marks. No hype words. State what the system observed,
what it hypothesizes, and what it will do. Distinguish observation from inference: "Observed",
"Current hypothesis", "Insufficient evidence".

## Sandbox specification (Meridian CRM)

Meridian CRM is a fictional, deliberately generic enterprise CRM that Synforma has "never seen". It
lives at `/sandbox/crm` inside this Next.js app so the demo runs with zero installs. It must contain no
Synforma-specific hooks, ids, data attributes or imports. Synforma reads it purely through generic DOM
semantics (roles, labels, text, ARIA), the same way it would read any web application.

### Non-negotiables

1. No imports from `@/components/brand` or `@/lib/synforma`. It has its own components in
   `app/sandbox/crm/_components` and its own store in `app/sandbox/crm/_lib`.
2. Visually distinct from Synforma: a conventional corporate enterprise look (navy header, dense tables,
   standard form layouts, blue primary buttons). It should look like software people are made to use.
3. Proper semantics: `<label for>` for every field, `<button>`s, `role="dialog"` with an accessible
   title, `role="menu"/"menuitem"` for menus (Radix is fine), `role="tablist"/"tab"`, `aria-expanded` on
   collapsibles, `role="alert"` for validation errors, `aria-invalid` on invalid fields, `<h1>` per page,
   `<nav aria-label="Primary">`, `<main>`.
4. Works inside a same-origin `<iframe>`: no frame-busting, no `window.top`, client-side routing only
   (Next.js `<Link>` / `router.push`).
5. State persists in `localStorage` under `meridian-crm-db` (seeded on first load). The Settings page
   has "Reset demo data".
6. React inputs are controlled but tolerate programmatic value setting followed by `input` / `change`
   events (standard React behaviour; nothing special).

### Two UI versions (simulated vendor release)

`app/sandbox/crm/_lib/ui-version.ts` exposes the current version (`"v1" | "v2"`), stored in
`localStorage` key `meridian-ui-version`, also settable via `?ui=v2` on any sandbox route (the query
parameter writes the setting, then continues). The Settings page has a switch "Simulate vendor UI update
(v2)"; Mission Control has the same switch.

v2 changes, all of which apply together:

- Labels: "Funding stage" → "Budget confirmation"; "Decision-maker" → "Economic buyer";
  "Decision timeline" → "Purchase timeframe"; "Next step" → "Next action".
- The lead detail "Actions" dropdown becomes a kebab icon button labelled "More options" (aria-label) at
  the right of the header, and the item "Convert to opportunity" becomes "Create opportunity from lead".
- The "Advanced qualification" collapsible is renamed "Additional details" and rendered as a tab next
  to a "Core" tab instead of a collapsible.
- Different DOM ids/classes on all form fields (prefix `mx-` instead of `fld-`); the primary nav order
  changes (Opportunities before Leads).
- Buttons "Next" → "Continue", "Create opportunity" → "Save opportunity".

### Data model (`app/sandbox/crm/_lib/db.ts`)

- Accounts (8): id `A-1xxx`, name, industry, region, owner.
- Contacts (about 20): id, accountId, name, title, email. Each account has 2–3 contacts, at least one
  with a decision-making title (VP, Director, Chief, Head of).
- Leads (10): id `L-10xx`, company (maps to an account), contact name, source, status (New / Working /
  Nurturing), created date, owner, notes. The seed includes "Acme Industrial — Expansion" as lead
  `L-1001` with account `A-1001` "Acme Industrial".
- Opportunities (5 seeded plus created ones): id `O-20xx`, name, accountId, amount, closeDate, stage,
  decisionMakerContactId, fundingStage, decisionTimeline, competitors[], nextStep, nextStepDate, notes,
  createdAt, sourceLeadId.

### Routes

- `/sandbox/crm` — Home: welcome, "My pipeline" summary cards, recent activity, quick links.
- `/sandbox/crm/leads` — table (id, company, contact, status, source, owner, created) with a search box
  and status filter; rows link to detail.
- `/sandbox/crm/leads/[id]` — header with company name (h1), status badge, and an "Actions" menu (v1)
  containing "Convert to opportunity", "Mark as nurturing", "Assign owner" (the latter two open simple
  dialogs). Tabs: Overview (details grid), Activity (timeline), Files (empty state).
- `/sandbox/crm/opportunities` — table; rows link to detail.
- `/sandbox/crm/opportunities/new?lead=L-1001` — the 3-step form below.
- `/sandbox/crm/opportunities/[id]` — detail page showing all stored fields as a definition list (`<dl>`
  with `<dt>` label / `<dd>` value), including Decision-maker name, Funding stage, Decision timeline,
  Competitors (comma list or "None identified"), Next step, Next step date. Heading is the opportunity
  name, plus a "Created from lead L-1001" line.
- `/sandbox/crm/accounts`, `/sandbox/crm/contacts` — simple tables.
- `/sandbox/crm/reports` — summary cards computed from the db.
- `/sandbox/crm/settings` — UI version switch, Reset demo data, "About Meridian CRM v4.2".

### The multi-step opportunity form (the workflow Synforma must learn)

A wizard with a step indicator ("Step 1 of 3 · Basics", …). Each step is its own h2.

Step 1 — Basics: Opportunity name (text, prefilled "<Account> — <Lead title>", required); Account
(read-only text); Amount (number, USD, required); Expected close date (`type="date"`, required); Stage
(select: Prospecting, Qualification, Proposal, Negotiation; default Prospecting); button "Next".

Step 2 — Qualification: Decision-maker (select of the account's contacts, placeholder "Select a contact",
no HTML `required`); Funding stage (select: Unknown, Requested, Approved, Allocated; default Unknown);
Decision timeline (select: Unknown, This quarter, Next quarter, 6–12 months; default Unknown);
collapsible "Advanced qualification" (collapsed by default, `aria-expanded`) containing Competitors
(checkbox group: Northwind Systems, Contoso Cloud, Fabrikam, None identified), Next step (text) and Next
step date (text input, not `type=date`, helper "Format: YYYY-MM-DD"; a `role="alert"` "Enter the date
as YYYY-MM-DD" on Next when non-empty and malformed); Qualification notes (textarea); buttons "Back",
"Next".

Step 3 — Review: on entry a dialog "Data quality reminder" opens (`role="dialog"`) with the body
"Opportunities missing qualification details are excluded from forecasting." and a button
"I understand"; it must be dismissed before the form is usable. Review summary (dl of all values),
button "Back", primary button "Create opportunity". On create: persist, navigate to
`/sandbox/crm/opportunities/[newId]`, show a dismissible success banner "Opportunity created".

Validation: step 1 required fields show `role="alert"` messages under the field and set `aria-invalid`.
Step 2 validates only the date format. Nothing else is enforced: the CRM does not know about Synforma's
five business requirements. That is the point.

### Look and feel

Navy (#1f3a5f) top bar with a "Meridian CRM" text logo (no Synforma mark), white content on a light
grey (#f4f6f8) canvas, blue (#2563eb) primary buttons, grey secondary. Dense 14px UI, top navigation,
standard enterprise, slightly dated. Fully responsive.

### Facts the engine must not hard-code (fine for demo defaults in `lib/synforma/demo.ts`)

Base `/sandbox/crm`; entry lead `/sandbox/crm/leads/L-1001`; `?ui=v2` switches the vendor UI version;
data in localStorage `meridian-crm-db`, version in `meridian-ui-version`. The sandbox pages are client
components hydrated from localStorage.

## Limitations of this prototype

- Same-origin iframe only. Third-party applications need the extension and API drivers on the roadmap.
- Single tenant, no backend. All state is in one browser; two people at the same URL each get their own state.
- The heuristic planner reasons lexically; it is transparent and fast but not general. The language-model
  planner improves understanding but is optional.
- Struggle detection uses timing and DOM signals. There is no eye tracking, no biometric or affective
  inference, and none is planned.
- Metrics are descriptive. Lift is reported only when both cohorts reach the minimum sample.
