# Roadmap

No dates, no effort estimates. Each phase names what will exist when it is done and what is not built
yet. The invariants do not move: discovery never commits, commits are approval-gated, judgment steps are
never automated, conflicting sources stop autonomy, no fabricated statistics, citations only from
`lib/synforma/science/citations.ts`, no emotion or personality inference, no raw typed text in telemetry.

## Where it stands

- A single-tenant prototype. There is no backend; all state is in one browser's localStorage.
- The interaction layer drives only a same-origin iframe. Third-party applications (SAP, Stripe,
  Supabase, Salesforce) cannot be reached yet; the connector tiles on the site are roadmap.
- The engine is real: discovery, planning, Act with approval and ledger, Guide with friction inference
  and DO_NOTHING, evidence and trust, demonstration capture, metrics from stored events, and semantic
  self-healing across the sandbox's two UI versions (`README.md`, "What is real and what is simulated").
- The language-model planner is optional (Claude or Gemini, server-side, schema-validated). The
  heuristic planner is the default and deliberately simple.

## Demo library — this release

Four target applications (Meridian CRM, Ledgerline Billing, Nimbus Data Console, Atlas ERP), a target
picker and presenter notes in Mission Control, a demo-applications gallery at `/sandbox`, and
`verify/targets.spec.js` as the zero-configuration regression across all of them. All four run 5/5 on
both UI versions. The data console joined last: its policy requirement was being read as a constraint
because it contains the word "policy", the renamed "RLS protection" switch did not match "Row level
security" on the outcome screen, and the vendor update moves the policy fields to a tab on the review
step. The fixes are generic (requirement kind by prohibition wording, acronym-aware matching, fills
carried forward to later screens of the same form), not per application.

## Phase 1 — this release: simplify and host

- Simplification: the two largest UI files split into focused modules; runner flags replaced by one
  `RunPolicy` (`commits`, `scope`, `steps`, `trust`) plus `LedgerProvenance`; Mission Control in two
  views (simple for the five-minute demo, advanced for the full instrument); documentation reduced to
  five documents.
- Claude provider next to Gemini behind one `LLMProvider` abstraction, with structured outputs and a
  provider check that needs no key.
- Node runtime hosting on Netlify so the planner route works in production.

## Phase 2 — Supabase backend

Not built yet. The prototype's collections already mirror the tables (`docs/ARCHITECTURE.md`, data model).

- Auth and organizations; admin and employee roles.
- Persisted Work Graph, programs, runs and events, claims, ledger, autonomy contracts.
- Per-tenant isolation: `org_id` on every row with row-level security; employee-private collections
  (proficiency, interaction windows, individual friction history) readable only by the person;
  aggregates only for admin roles, with minimum cohort sizes.
- The behavioral firewall becomes an access-control boundary instead of a data-model boundary.

## Phase 3 — browser extension driver

Not built yet. The `Driver` interface is the seam.

- A content script that hosts the same snapshot, grounding and driver code, so any web application the
  person is signed into becomes a target without an iframe.
- A small embeddable snippet for applications the customer owns, for the cases where an extension is
  not wanted.
- First real targets: the Stripe dashboard in test mode and Supabase Studio. Both are semantic web
  applications with menus, forms and dialogs, and both have a safe mode where a committed action costs
  nothing.
- Security review of the extension permission model before any pilot (least privilege, per-site
  enablement, visible state, interruptible).

## Phase 4 — API-level Act connectors

Not built yet. The same autonomy contract classes, ledger and rollback apply to API calls as to clicks.

- Stripe API, Supabase management API, SAP OData against the SAP Business Accelerator Hub sandbox.
- Every API call is classified A–D, gated by the workflow's Autonomy Contract, written to the ledger with
  before and after state, and reversed through a compensating call where one exists.
- A Fiori-style sandbox for the SAP UI story, explicitly labelled a replica, for demonstrations where
  the real system cannot be shown.

## Cross-cutting

- Evals: replay each workflow against every real target application after engine changes; report
  discovery recall, grounding precision, self-healing rate and permission adherence per target.
- Security review of the extension permission model (Phase 3) and of the connector credentials (Phase 4).
- Pilots with real users, with the privacy model in `docs/OPERATIONS.md` as the entry condition.

## The four demos

| Demo | Recommended shape | Why |
|---|---|---|
| Claude | Planner provider in the current product: objective parsing, field mapping, diagnosis and assistance wording through the server route, labelled in the UI | Shows the model improving understanding without owning structure, actions or citations; runs today with a key |
| Stripe | Extension driver on the Stripe dashboard in test mode (Phase 3), then the Stripe API as an Act connector (Phase 4) | A real third-party UI with dialogs, menus and forms; test mode makes commits safe; the API path shows the same contract applied to calls |
| Supabase | Extension driver on Supabase Studio (Phase 3), then the management API (Phase 4); the same Supabase project can host the Phase 2 backend | One vendor serves as target application and as backend, which keeps the demo honest about what is real |
| SAP | Fiori-style sandbox replica for the UI story, labelled as such; SAP OData against the Business Accelerator Hub sandbox for the API story (Phase 4) | A real SAP tenant cannot be shown; the replica is declared a replica, and the OData sandbox is a genuine API surface |

## What stays out

No emotion recognition, no employee ranking from telemetry, no covert influence, no engagement
maximization, no gaze or biometric capture. Learned (bandit) policies replace the explainable score only
if "Why this?" survives them.
