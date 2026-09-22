# Synforma

Synforma is a prototype of autonomous digital adoption. Connect a web application it has never seen,
state an objective in plain language, and it discovers the application, infers the workflow, performs
it under approval (**Act**), guides people through it (**Guide**), watches where they struggle and
composes assistance on its own (**Adapt**), and measures whether the intended outcome actually happened
(**Intent-to-Outcome Rate**). Nothing is authored, tagged or configured for the target application.
Controls are addressed by role and accessible name, never by selector, so the workflow survives a vendor
UI update.

Live: **https://synforma.netlify.app** (the production build of `main`).

## Try it

| Route | What |
|---|---|
| `/` | The site (`/thesis` for the long form) |
| `/demo` | Mission Control: the whole loop against the bundled CRM |
| `/employee` | Employee view: do the workflow yourself with the Synforma overlay |
| `/graph` | Work Graph as a 2D process map: Workflow, Application, Runs and Evidence lenses, with the 3D scene behind a toggle |
| `/science` | Barrier model, intervention registry, evidence classes, decision policy, citations |
| `/settings` | Planner preference, assistance and sensing controls, data export / import / delete |
| `/sandbox` | The four demo applications, each usable on its own |
| `/sandbox/crm` | Meridian CRM (fictional CRM) |
| `/sandbox/billing` | Ledgerline Billing (billing-dashboard replica) |
| `/sandbox/data` | Nimbus Data Console (developer-console replica) |
| `/sandbox/erp` | Atlas ERP (enterprise-ERP replica) |

Everything runs in the browser against a same-origin iframe. All state lives in localStorage. Nothing
leaves the browser except calls to the optional planner route.

## Quick start

```bash
cd synforma
npm install
npm run dev
# http://localhost:3000        the site
# http://localhost:3000/demo   Mission Control
```

Node 20 or newer. No database, no required secrets.

### Optional: language-model planner

Without a key Synforma runs the **heuristic planner** (deterministic, lexical; the UI says so). To let
a language model parse objectives, map requirements to fields, name barriers and phrase assistance:

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY  (Claude; default model claude-opus-5, override with ANTHROPIC_MODEL)
# or  GEMINI_API_KEY     (Gemini; default model gemini-2.5-flash, override with GEMINI_MODEL)
```

Claude is preferred when both keys are set; `PLANNER_PROVIDER=claude|gemini` pins one. Keys are read
only on the server (`app/api/planner`). The browser sees `{ configured, provider, model }` from
`/api/planner/status` and nothing else. Every reply is validated against fixed Zod schemas; a refused or
malformed reply makes the route answer 502 and the client falls back to the heuristic planner, as does
any call that has not answered within ten seconds. The model's answer is additive: the heuristic's
requirement list stays the executable contract, the model adds titles, constraints, judgment flags and
fills mapping gaps. It can improve understanding but cannot invent techniques, citations or statistics. Settings → Planner
chooses Automatic, Heuristic only or Language model.

## Four applications, one engine

Mission Control's Connect stage offers four target applications. Every one is a fictional replica of a
category of enterprise software, built for this demonstration and labelled as such in its own footer;
none contains a connector, a selector or any hook for Synforma. Each ships with an objective, a work
context, a simulated vendor update (labels, menus, tabs and DOM ids change) and presenter notes.
`/demo?target=billing` (or `data`, `erp`, `crm`) opens Mission Control on that application.

| Application | Objective | Both UI versions, zero configuration |
|---|---|---|
| Meridian CRM | qualified opportunity from an inbound lead | 5/5 requirements, self-healed |
| Ledgerline Billing | compliant refund for a disputed charge | 5/5 requirements, self-healed |
| Atlas ERP | approvable purchase requisition | 5/5 requirements, self-healed |
| Nimbus Data Console | new table with row level security on and a read-own-rows policy | 5/5 requirements, self-healed |

The engine changes that made this possible are generic, not per app: discovery keeps prefilled values,
retries rejected fields with values derived from the validation message, reads fields behind toggles,
closes menus it opened and replays a wizard's path instead of reloading it; the planner picks the
terminal commit control, sets selects the objective names outright and ticks acknowledgement boxes on
the commit screen; the runner finds fields a vendor update moved into a tab, skips a "Next" the new
version no longer needs, never re-grounds forward navigation onto "Back", repairs duplicate names,
re-synchronises with a wizard that jumped back and carries a fill forward when the vendor moved its
field to a later screen of the same form; matching treats an abbreviation as the phrase whose initials
it spells ("RLS protection" is "Row level security"); and a requirement that names an artifact to create
("a policy that allows …") is a field requirement, not a constraint. `node verify/targets.spec.js` runs
all four.

## Demo in five minutes

Open `/demo`. Mission Control starts in the **simple view**: one screen, three stages.

1. **Connect** happens automatically. The CRM loads in the frame and Synforma lists what its
   interaction layer sees on the home page: roles, names, landmarks. No selectors.
2. **Objective.** The default objective asks account executives to create a properly qualified
   opportunity from a lead: five requirements, one policy constraint. Press **Discover and plan**.
   Discovery crawls the application for about ten seconds (navigation, a menu, a three-step wizard, a
   collapsed section that reveals six fields, a dialog) and never commits. Planning turns the objective
   into a program: requirements with "needs human judgment" flags and a workflow classified Guide /
   Assist / Act per step, with the rationale.
3. **Run.** Press **Run it**. The agent opens the lead, uses the Actions menu, fills the basics,
   qualifies, expands the hidden section, acknowledges the data-quality dialog, then stops: approval
   required, with the exact payload. Approve. The outcome screen is verified: 5 of 5 requirements on
   the created record, every action audited. Press **Undo** to restore the fields Synforma filled
   (while the form is still open). Then press **Vendor update** (labels renamed, menu becomes a kebab,
   collapsible becomes a tab, ids change) and **Run again**: the log shows each control re-grounded by
   meaning and 5 of 5 verified. Nothing was re-configured.

A one-line trust summary shows the claims, the contested count and the contract status. **Details**
opens the **advanced view**: the five-phase layout (Connect, Understand, Act, Guide & Observe, Adapt,
Measure) with the evidence panel, the Autonomy Contract, trust decisions, the ledger and the
demonstration panel. Three scenes worth showing there:

- **Guide.** Open the employee view (`/employee`) and start a run. Move quickly: the friction state
  reads FLUENT and the decision log says DO_NOTHING. On Qualification, look around for competitors
  without opening the disclosure: after a few seconds the state becomes VISUAL_SEARCH and one cue
  appears anchored to "Advanced qualification"; "Why this?" shows the score. On Review, hover "Create
  opportunity", move away, come back: Synforma does not highlight the button (you found it); it states
  the consequence instead. **Get It Done** fills the routine fields, leaves the judgment fields to you
  and stops at approval. After unassisted successes the proficiency panel shows the level and the next
  run favours DO_NOTHING.
- **Evidence and contract.** In Understand, every requirement is an organization-approved claim, every
  field a live observation, every mapping a model inference with its confidence. Edit the objective so
  requirement 2 accepts "Signed or Countersigned" and re-plan: the claim becomes contested (the
  interface offers Unknown, Requested, Approved, Allocated), the trust decision for Qualification reads
  **Stop**, and Act refuses that step until a person resolves it. The Autonomy Contract reads: read and
  reversible writes automatic, consequential writes ask, destructive never. Class C cannot be set to
  automatic.
- **Teach by doing.** In Guide & Observe choose "Teach Synforma this workflow", perform it once (the
  controls you use are recorded, never what you type), stop. Synforma reconstructs the steps, marks what
  needs judgment, asks up to three clarification questions and versions the workflow (governance
  "reviewed") when you adopt it. Act runs on the adopted version.

Measure shows "Still learning" until five runs by people exist; agent runs never count. Run the
synthetic users or complete a human run to see it fill in, labelled as simulation where applicable.

The reaction to aim for: *You didn't configure this? No. You didn't build the walkthrough? No. You
didn't tag the UI? No. It figured out the workflow itself? Yes.*

## What is real and what is simulated

Real: the universal interaction layer (semantic DOM snapshot, grounding, driver), autonomous discovery,
objective parsing, workflow inference, Guide/Assist/Act classification, execution with approval gates and
audit, outcome verification, human observation with pointer and keyboard-metadata sensing (never typed
text), an observable friction taxonomy, DO_NOTHING as a first-class decision, intervention scoring and
composition, proficiency fading, Get It Done, control/treatment cohorts, synthetic users, metrics
computed only from stored events, an admin system-vs-human diagnosis, semantic self-healing across the
sandbox's two UI versions, and the trust layer: evidence claims with contradictions that stop autonomy,
an Autonomy Contract per workflow, a provenance ledger with undo, and teach-by-demonstration with
versioned, governed workflows. All of it is exercised end to end by the scripts in `verify/`.

Simulated or absent: the target application is a bundled sandbox (Meridian CRM) and its "vendor
update" is a switch. The interaction layer drives only a same-origin iframe, so third-party applications
(SAP, Stripe, Supabase, Salesforce) cannot be reached yet; the connector tiles on the site are roadmap.
There is no backend: all state is in one browser's localStorage, single tenant. The language-model
planner is optional; the heuristic planner is deliberately simple. Synthetic users are the runner with
capabilities switched off and are labelled as simulation everywhere. No statistics are fabricated:
metrics return null until enough stored runs exist, citations come only from
`lib/synforma/science/citations.ts`, and Synforma never infers emotion, personality or employee worth.
Imported stimulus analyses (Science page, research use) are an encoding model's predictions about the
screens a run showed, the predicted response of an average subject, not measurements of people. See
`docs/ROADMAP.md`.

## Documentation

- `docs/ARCHITECTURE.md` — layers, runtime topology, module map, data model, trust properties, the
  five knowledge layers, design language, sandbox specification
- `docs/ENGINE.md` — decision rules (discovery, grounding, planning, execution, observation, adaptation,
  evidence, trust, ledger, demonstration) and the API reference per module
- `docs/OPERATIONS.md` — deploy, environment variables, verification, privacy model, threat model,
  event schema
- `docs/ROADMAP.md` — where this stands and the platform plan

## Verification

```bash
npx tsc --noEmit -p . && npx eslint . && npm run build
npx --yes tsx@4 verify/provider.spec.ts   # planner providers and schemas; no key needed
npm run dev                               # in one terminal, port 3000; then, with CHROMIUM_PATH set:
node verify/engine.spec.js    # discover → plan → act (v1) → act (v2 self-heal) → observe a scripted human
node verify/friction.spec.js  # friction states, minimal interventions, DO_NOTHING when fluent, no typed values in events
node verify/epics.spec.js     # evidence + contradictions → STOP, Autonomy Contract, ledger undo, Get It Done, demonstration → workflow
```

Details in `docs/OPERATIONS.md`.

## Brand

Synforma (sin-FOR-ma) is a working brand name pending trademark and domain clearance. Tagline:
*Intelligence for becoming.*

## Repository

This repository was split out of `goinghamm9/Experimentation` (folder `synforma/`) on 2026-09-21 with
its full history. Production is the Netlify project `synforma`, which builds `main` from this repository;
the operations guide covers hosting, environment variables and verification.
