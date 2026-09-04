# SYNFORMA

**Software that learns how your organization works, and continuously makes it work better.**

Synforma is a prototype of *autonomous digital adoption*: connect an application Synforma has never
seen, state an objective in plain language, and Synforma discovers the application, understands the
workflow, performs it under approval (**Act**), guides people through it (**Guide**), watches where they
struggle, generates contextual assistance on its own (**Adapt**), and measures whether intended outcomes
actually happen (**Intent-to-Outcome Rate**).

No builders. No tagging. No authored walkthroughs. When the vendor moves a button, the workflow keeps
working because Synforma addresses controls by meaning, not by selector.

## The magic trick

The repo bundles a target application, **Meridian CRM** (`/sandbox/crm`), that contains no Synforma
hooks, ids or instrumentation. Mission Control (`/demo`) walks through:

1. **Connect** the application (a same-origin iframe in this prototype).
2. **Objective**: "I want account executives to create a properly qualified opportunity… must have five requirements…"
3. **Discover**: Synforma crawls the app through generic DOM semantics (links, menus, tabs, disclosures,
   multi-step forms, dialogs). Discovery never commits data. ~10 seconds.
4. **Understand**: the objective becomes a program: population, requirements (with "needs human judgment"
   flags), policy constraints, and a workflow whose steps are classified Guide / Assist / Act with rationale.
5. **Act**: Synforma performs the workflow in the live app, asks for approval before the commit, verifies
   the five requirements on the resulting record, and audits every action.
6. **Guide & Observe**: open the employee view (`/employee`), do it yourself; Synforma anchors help to the
   live interface, keeps a requirement checklist, and records hesitation, validation errors, backtracking.
7. **Adapt**: struggle becomes a barrier hypothesis, a technique from a citation-backed registry is
   scored ("Why this?"), assistance is composed and tested against a control cohort.
8. **Measure**: metrics computed only from stored runs; "Still learning" until there is enough data.

Then flip the sandbox's **"Simulate vendor UI update"** switch (labels renamed, menu becomes a kebab,
collapsible becomes a tab, ids changed) and run again: the log shows each control being re-grounded
semantically. That is self-healing without a single selector.

## Quick start

```bash
cd synforma
npm install
npm run dev
# open http://localhost:3000        → the site
# open http://localhost:3000/demo   → Mission Control
```

Requires Node 20+. Everything runs locally; all state lives in your browser's localStorage.

### Optional: live LLM planner

Without an API key Synforma runs the **heuristic planner** (deterministic lexical reasoning; the UI says so).
To enable the Gemini planner for objective parsing, field mapping, diagnosis and assistance wording:

```bash
cp .env.example .env.local   # then set GEMINI_API_KEY (and optionally GEMINI_MODEL)
```

The key is only read server-side (`app/api/planner`). Structured JSON responses are validated with Zod;
the LLM can improve understanding but cannot invent techniques, citations or statistics.

## Routes

| Route | What |
|---|---|
| `/` | The thesis site (`/thesis` for the long form) |
| `/demo` | Mission Control: the eight phases above |
| `/employee` | Guide mode: the employee view with the Synforma overlay |
| `/graph` | Interactive 3D Work Graph of the discovered application and program |
| `/science` | Barrier model, intervention registry, evidence classes, decision policy, citations |
| `/settings` | Planner preference, observation thresholds, data export/import/delete |
| `/sandbox/crm` | Meridian CRM, the target application (open it standalone too) |
| `/dev/engine` | Engine harness exposing `window.__synforma` for tests |

## What is real in this prototype, and what is not

Real: the universal interaction layer (semantic DOM snapshot, grounding, driver), autonomous discovery,
objective parsing, workflow inference, Guide/Assist/Act classification, execution with approval gates and
audit, outcome verification, human observation, struggle diagnosis, intervention scoring and composition,
control/treatment cohorts, synthetic users, metrics from stored events, and semantic self-healing across
the sandbox's two UI versions. All of it is exercised end to end by `verify/engine.spec.js`.

Not yet: enterprise connectors (the tiles on the site are roadmap), server-side persistence, a browser
extension for cross-origin applications, vision-based grounding, learned (bandit) policies. See
`docs/ROADMAP.md`. The heuristic planner is deliberately simple; an LLM planner is optional.

## Documentation

- `docs/ARCHITECTURE.md` — layers, module map, data model, trust properties
- `docs/ENGINE.md` — the decision engine: discovery, grounding, planning, execution, observation, adaptation, metrics
- `docs/ENGINE_API.md` — how the UI uses the engine
- `docs/DESIGN.md` — design system
- `docs/SANDBOX_SPEC.md` — the target application
- `docs/ROADMAP.md` — where this goes next

## Tests

```bash
npm run dev            # in one terminal
node verify/engine.spec.js   # discover → plan → act (v1) → act (v2 self-heal) → observe a scripted human
```

## Brand

Synforma (sin-FOR-ma) is a working brand name pending trademark and domain clearance. Tagline:
*Intelligence for becoming.*
