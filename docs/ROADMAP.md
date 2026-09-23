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
- The language-model planner is optional (Claude, OpenAI, Gemini or Grok, server-side, schema-validated).
  The heuristic planner is the default and deliberately simple.
- The decision model is optional too (Jev by TypeSafe, server-side, through Cloudflare Workers AI or
  TypeSafe's API): consulted only where the lexical rules are unsure (a field or control during a run, a
  menu item during discovery, a requirement with no matching field, judgment), acted on only above a
  stated probability, and recorded with its probability everywhere.

## Demo library — this release

Five target applications (Meridian CRM, Ledgerline Billing, Nimbus Data Console, Atlas ERP, Lumen
Workspace), a target picker and presenter notes in Mission Control, a demo-applications gallery at
`/sandbox`, and `verify/targets.spec.js` as the zero-configuration regression across all of them. All
five run 5/5 on both UI versions, and the spec exits non-zero otherwise. Lumen Workspace, a fictional
AI-assistant workspace, is the demo for learning an AI-assistant system itself: its objective asks for
approved instructions, a connected knowledge source, a capped data retention and a reviewer. Making its
vendor-update run honest took three more generic engine rules: a fill whose field was renamed beyond
recognition is deferred to a later screen instead of landing on a look-alike field, a capped duration
("30 days or less") is parsed and verified as a threshold, and the wizard re-sync only moves forward
when the live screen belongs to an earlier step. The data console joined last: its policy requirement was being read as a constraint
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
  provider check that needs no key; OpenAI and Grok (xAI) through one OpenAI-compatible provider.
- Node runtime hosting on Netlify so the planner route works in production.
- Jev (TypeSafe's System One model) behind one `DecisionProvider` abstraction with two transports, a
  probe endpoint, a Settings section, and the runner's use of a calibrated choice for a field the rules
  cannot place.
- Foundation for the complete product: GitHub as the system of record and GitHub Actions as the only
  pipeline (static checks, unit specs, the browser specs sharded across runners against the standalone
  server, CodeQL, Scorecard, Dependabot); a container image built on every run and published to GitHub
  Container Registry with a signed build provenance attestation on `main` and on tags; a Deploy workflow
  driven by GitHub Environments with required reviewers and a host chosen by variables, not code
  (`CONTRIBUTING.md`, `docs/OPERATIONS.md` "Pipeline").

## The complete product — the order of work

The prototype's limits are one limit: state lives in one browser and the driver lives in an iframe. The
complete product needs a backend with tenancy, a driver that reaches real applications, and an operating
discipline around models; everything else hangs off those three. In order:

1. **Foundation** (done in this release): the pipeline, the image, the environments. Every later step
   ships through it.
2. **Backend and tenancy** (Phase 2 below): Postgres with row-level security as the privacy firewall, an
   append-only event store for runs, claims, ledger and contracts, object storage for snapshots, queues
   for long work; auth built for enterprise from the start (SSO through SAML and OIDC, SCIM, organizations,
   roles, invitations, audit log, retention); the store migrated from localStorage behind the same
   interfaces, with import of existing programs.
3. **Portals**: an admin portal (programs, Work Graph, approvals, contracts, metrics, model policy,
   billing) and an employee portal (my guidance, my proficiency, what Synforma may and may not do for me,
   private by construction), two route groups with separate role models; aggregates only for admins,
   with minimum cohort sizes.
4. **Memory and model operations**: structural memory (the Work Graph, persisted and versioned),
   episodic memory (every run's events and ledger, with retention), semantic memory (embeddings of
   screens, fields and requirements in pgvector, so a second CRM benefits from the first), decision
   memory (Jev's answers and their outcomes feeding per-application thresholds), personal memory
   (proficiency and friction history, readable only by the person); a prompt and schema registry with
   versions, golden-set evals for every planner task run in CI, fallback chains, per-organization model
   policy with bring-your-own keys, cost and latency budgets, OpenTelemetry traces, a private model
   option behind the same interface.
5. **Extension driver** (Phase 3), then **API connectors** (Phase 4).
6. **Compliance and scale**: SOC 2 controls mapped to the pipeline, SCIM, multi-region only when a
   customer requires it.

The invariants stay fixed throughout: no covert persuasion, no emotion or trait inference, no raw typed
text leaving the browser, judgment steps never automated, discovery never committing.

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

## The five demos

| Demo | Recommended shape | Why |
|---|---|---|
| Claude | Two parts, both in the current product: the planner provider (objective parsing, field mapping, diagnosis and assistance wording through the server route, labelled in the UI, bounded by deadlines), and Lumen Workspace, a fictional AI-assistant workspace replica that Synforma teaches and drives like any other application | Shows the model improving understanding without owning structure, actions or citations, and shows adoption of an AI-assistant system itself, not just an LLM behind Synforma |
| Jev (TypeSafe) | The decision provider in the current product: fields and controls the runner cannot place, menu items discovery must not try, requirements planning cannot map by their words, and the judgment flag, each labelled with its probability in the log, the Work Graph, the Understand panel and the audit; next, option choice for capped or named values and per-application calibration from outcomes | Shows a System One model doing what it is for, a fast typed decision inside software with the probability in the open, while structure, actions and verification stay deterministic |
| Stripe | Extension driver on the Stripe dashboard in test mode (Phase 3), then the Stripe API as an Act connector (Phase 4) | A real third-party UI with dialogs, menus and forms; test mode makes commits safe; the API path shows the same contract applied to calls |
| Supabase | Extension driver on Supabase Studio (Phase 3), then the management API (Phase 4); the same Supabase project can host the Phase 2 backend | One vendor serves as target application and as backend, which keeps the demo honest about what is real |
| SAP | Fiori-style sandbox replica for the UI story, labelled as such; SAP OData against the Business Accelerator Hub sandbox for the API story (Phase 4) | A real SAP tenant cannot be shown; the replica is declared a replica, and the OData sandbox is a genuine API surface |

## What stays out

No emotion recognition, no employee ranking from telemetry, no covert influence, no engagement
maximization, no gaze or biometric capture. Learned (bandit) policies replace the explainable score only
if "Why this?" survives them.
