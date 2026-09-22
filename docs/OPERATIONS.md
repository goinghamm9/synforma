# Operations

Deploy, environment, verification, and the privacy, threat and event contracts that operators and
reviewers need. The product itself is described in `docs/ARCHITECTURE.md` and `docs/ENGINE.md`.

Contents: [Deploy](#deploy) · [Environment variables](#environment-variables) · [Verification](#verification) ·
[Privacy model](#privacy-model) · [Threat model](#threat-model) · [Event schema](#event-schema)

## Deploy

Synforma is a plain Next.js app with no database and no required secrets. All state lives in the
browser (localStorage). The bundled target application (Meridian CRM) is part of the same site, so a
single deployment is the whole demo. The optional `/api/planner` route is the only server-side code;
it needs a Node runtime and a key.

### Live site

https://synforma.netlify.app is the production deploy of the `main` branch (Netlify project `synforma`,
git-connected). Every push to `main` rebuilds it; every pull request gets a Deploy Preview. The team's
visitor-access setting may require a Netlify team login: sign in to Netlify first, or change it under
**Team settings → Site access**.

### Run locally

```bash
git clone https://github.com/goinghamm9/synforma.git
cd synforma
npm install
npm run dev          # http://localhost:3000, Mission Control at /demo
```

Node 20 or newer. Production build check: `npm run build && npm run start`.

### Netlify (production; Next.js runtime)

The repository root carries `netlify.toml`: build command `npm run build`, publish directory `.next`,
plugin `@netlify/plugin-nextjs`, Node 20. No base directory: the app is the whole repository.

1. **Add new project → Import from an existing project → GitHub**, pick `goinghamm9/synforma`,
   branch `main`. Build settings are read from `netlify.toml`; leave them as detected.
2. Optional: under **Site configuration → Environment variables** set `ANTHROPIC_API_KEY` (Claude),
   `OPENAI_API_KEY` (OpenAI), `GEMINI_API_KEY` (Gemini) or `XAI_API_KEY` (Grok). Redeploy. `/api/planner/status` then reports the provider and model; the
   Settings page shows it. Without a key the heuristic planner runs and the UI says so.

### GitHub Pages (static export)

`npm run build:static` runs `scripts/build-static.sh`: it moves `app/api` aside, builds with
`SYNFORMA_STATIC=1` (`output: "export"`, trailing slashes) and writes `out/`. `NEXT_PUBLIC_BASE_PATH`
mounts the app under a sub-path. The static export has no planner route, so the heuristic planner
always runs.

1. In the repository choose **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Run the workflow **Deploy to GitHub Pages** (`.github/workflows/pages.yml`, manual dispatch). It
   builds with base path `/synforma` and publishes to `https://goinghamm9.github.io/synforma/`.

### Vercel

Import the repository and keep the defaults (Next.js preset, `next build`, root directory unchanged).
Environment variables are optional, as above.

### Any other Node host

`npm run build && npm run start` (Render, Fly, a VM). The app needs a Node runtime only for the planner
route; a static host works with `npm run build:static`.

### What to expect

- Discovery takes about ten seconds and drives the embedded CRM visibly.
- Everything is per browser: two people opening the same URL each get their own state. Use Settings →
  Export / Import to move a program between browsers.
- The Work Graph's 3D view needs WebGL; the default process map does not.

## Environment variables

All optional; read on the server only, never logged, never returned to the browser. `.env.example`
lists them; copy it to `.env.local` for local development and restart the dev server after changes.

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the Claude provider. Preferred when both keys are set. |
| `ANTHROPIC_MODEL` | Claude model id; default `claude-opus-5`, run at low effort (extraction and mapping tasks). |
| `OPENAI_API_KEY` | Enables the OpenAI provider (chat completions with a JSON-schema response format). |
| `OPENAI_MODEL` | OpenAI model id; default `gpt-5-mini`. A gpt-5 or o-series model runs at low reasoning effort; others at temperature 0.2. |
| `OPENAI_BASE_URL` | API root for an OpenAI-compatible gateway; default `https://api.openai.com/v1`. |
| `GEMINI_API_KEY` | Enables the Gemini provider. |
| `GEMINI_MODEL` | Gemini model id; default `gemini-2.5-flash`. |
| `XAI_API_KEY` | Enables the Grok provider through xAI's OpenAI-compatible API (`GROK_API_KEY` is accepted too). |
| `XAI_MODEL` | Grok model id; default `grok-4-fast-non-reasoning` (`GROK_MODEL` is accepted too). |
| `XAI_BASE_URL` | API root; default `https://api.x.ai/v1`. |
| `PLANNER_PROVIDER` | `claude`, `openai`, `gemini` or `grok`: pin one vendor when several keys are present; otherwise the first configured in that order. |
| `SYNFORMA_STATIC` | `1` builds a static export without API routes (set by `npm run build:static`). |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path for a static deployment (e.g. `/synforma`); public by design, contains no secret. |

`GET /api/planner/status` returns `{ configured, provider, model }` and nothing else. `POST
/api/planner` validates the request and the model's reply against fixed Zod schemas, retries once with a
corrective instruction, and answers 502 when the provider fails, refuses, or the output fails validation
twice; 503 when no provider is configured; 504 after 8 s (under the 10 s function limit of serverless
hosts such as Netlify's free tier); 429 above 30 requests per minute per process. On any non-200 answer,
or when no answer arrives within 10 s, the browser client uses the heuristic planner and labels the run
as a fallback.

## Verification

Run everything from `synforma/`.

### Static checks

```bash
npx tsc --noEmit -p .
npx eslint .
npm run build
```

### Planner providers and the remote planner client (no key, no browser)

```bash
npx --yes tsx@4 verify/provider.spec.ts
npx --yes tsx@4 verify/remote-planner.spec.ts
npx --yes tsx@4 verify/text.spec.ts
```

`remote-planner.spec.ts` mocks the planner API and verifies the client's deadline (a slow call falls back
to the heuristic result at the deadline, with the reason in `lastError`) and its additive merging (the
heuristic requirement list stays; the model adds title, constraints and judgment; a model mapping fills a
gap but never overrides a confident heuristic mapping). `text.spec.ts` covers acronym-aware matching and
requirement kinds.

Verifies that every planner task schema survives the structure-only conversion used for Claude's
structured outputs, that a bad Anthropic key maps to a `ProviderError` of kind `"auth"` without leaking
the key, and that the provider registry prefers Claude, honours `PLANNER_PROVIDER`, and reports
`"heuristic"` when no key is set.

### Engine checks (Playwright against a dev server)

Start `npm run dev` on port 3000 in one terminal. The scripts drive the engine harness at `/dev/engine`
(`window.__synforma`) through Chromium; set `CHROMIUM_PATH` to a Chromium binary when Playwright's
bundled browser is not installed (`npx playwright install chromium` installs one).

```bash
CHROMIUM_PATH=/path/to/chrome node verify/engine.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/friction.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/epics.spec.js
```

| Script | What it exercises | What to read in the output |
|---|---|---|
| `engine.spec.js` | discover → plan → Act on UI v1 → Act on UI v2 (self-healing; `SKIP_V2=1` skips it) → observe a scripted human through the whole workflow | `ACT V2` result and the `regrounded` list; the event trail with `run_completed`; `SIGNALS`; `CHECKLIST` all met |
| `friction.spec.js` | a scripted person who is fluent, searches, mis-formats a date, hesitates over the commit; the decision policy for each signal, DO_NOTHING when fluent and after unassisted successes | the expected state after each scene (FLUENT, VISUAL_SEARCH, ERROR_RECOVERY, DECISION_UNCERTAINTY); `DECISION` lines; `privacy check — events containing typed values: 0` |
| `epics.spec.js` | claims and the truth report; trust decisions under the default contract; Act with the trust gate and ledger; Get It Done (routine scope) then rollback of fills; an objective whose accepted values contradict the interface → contested claim → Stop; expert demonstration → reconstructed workflow → Act on it; skill status | `CONTRADICTION test` and `ACT with conflicting sources → abandoned`; `ROLLBACK restored n`; `privacy (typed values in reconstruction): false`; `ACT reconstructed workflow → completed` |

The scripts print their results and exit non-zero only on an exception. Read the printed lines against
the expectations above; a run that finishes with the wrong state or a non-zero privacy count is a
failure.

The harness API is listed at the end of `docs/ENGINE.md`.

### UI checks (Playwright against a dev server)

Same setup as the engine checks. Each script prints one `PASS`/`FAIL` line per check and a final
console/page-error line; a `FAIL` line or a non-zero error count is a failure. Screenshots land in
`.verify/` (gitignored).

```bash
CHROMIUM_PATH=/path/to/chrome node verify/demo-simple.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/demo-advanced.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/demo-trust.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/demo-trust-extra.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/employee.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/employee-guide.spec.js
CHROMIUM_PATH=/path/to/chrome node verify/stimulus.spec.js
```

| Script | What it exercises |
|---|---|
| `demo-simple.spec.js` | Mission Control simple view from empty storage: auto-connect → Discover and plan → Run it (approval) → Undo → Vendor update → Run again with self-healed changes → Details into the advanced view → mobile width → Start over |
| `demo-advanced.spec.js` | Advanced view end to end: Connect → Objective → Discover → Understand → Approve → Act → vendor update → synthetic users → Adapt → Measure → run drawer and audit → reload persistence → mobile → Start over |
| `demo-trust.spec.js` | Trust layer in the advanced view: claims and authority badges, autonomy contract (class C never "auto"), trust decisions, ledger and undo, contested claims → Stop, self-heal claims after v2, teach by doing → adopted workflow |
| `demo-trust-extra.spec.js` | Contract regeneration after a reload without contracts; the employee link; claims kept |
| `employee.spec.js` | Employee view against the fixture program in `verify/fixtures/employee-seed.json`: guide flow, quiet decisions, intervention cards and feedback, completion, proficiency, Get It Done (deny → reopen → approve), recap, sensing pause, mobile |
| `employee-guide.spec.js` | Planner badge, step ring on the current step, checklist advancing on typing, hesitation → recorded decision, assist completing a step, Get It Done approve path, start another run, abandon |
| `graph.spec.js` | Work Graph process map: sample graph, lenses, search, 3D toggle, seeded fixture, Runs lens after a Mission Control run, mobile |
| `stimulus.spec.js` | Science → stimulus analysis import, chart and table, disclaimer wording; Record screen control in the advanced Act panel |
| `sandbox-billing.spec.js`, `sandbox-data.spec.js`, `sandbox-erp.spec.js`, `sandbox-assistant.spec.js` | Each replica application by hand: its workflow on both UI versions, validation, the two small workflows, reset, mobile |
| `targets.spec.js [ids]` | The engine on every target application: discover → plan → Act on v1 → vendor update → Act on v2 (self-healing); prints a summary row per app and exits non-zero unless every app completes both runs with all requirements verified |
| `stimulus.spec.js` | The Science page's stimulus-analysis section: disclaimer wording, import of `verify/fixtures/stimulus-analysis.example.json` (synthetic values), list entry, small multiples, per-step table, persistence across a reload, removal, an invalid file rejected; then the advanced Act panel's Record screen button, present and either enabled or disabled with a stated reason (headless Chromium has no screen to share) |

The advanced-view scripts seed `settings.demoView = "advanced"` in `localStorage` before loading, because
the simple view auto-connects on load.

## Stimulus analysis with TRIBE v2 (research)

Synforma can import a **stimulus analysis**: the predicted cortical response of an *average subject* to
the screen content a person saw during a Mission Control run, produced offline by Meta's TRIBE v2
encoding model from a screen recording. It is a property of the screens, like a readability score.
It is not a measurement of anyone's brain, attention or state, and the Science page says so in exactly
the wording below wherever the data is shown. TRIBE v2 is licensed CC BY-NC 4.0, so the feature is
labelled research use. **The browser never calls the model**; the Python bridge in
`services/tribe-bridge` runs on the operator's machine and writes a JSON file that is imported by hand.

Three steps:

1. **Record.** Mission Control → Advanced → Act → *Record screen*. The browser's own dialog asks what to
   share; nothing starts by itself and nothing is uploaded. Stopping downloads
   `synforma-run-<runId>.webm` and `synforma-run-<runId>-steps.json` (the run's step windows as
   `[{ stepId, title, startS, endS }]`, seconds from the start of the recording, clamped at 0). The
   employee view has no recording control and never records anything.
2. **Analyse offline.** `python -m tribe_bridge.analyze --video run.webm --steps run-steps.json --out analysis.json`
   in `services/tribe-bridge`. The bridge predicts one sample per TR for the average subject, shifts the
   predictions back by the hemodynamic lag, z-scores them across the recording and aggregates the
   fsaverage5 vertices into six coarse systems.
3. **Import.** Science → *Predicted cortical response to screens* → *Import analysis JSON*. The file is
   validated with `parseStimulusAnalysis` (`lib/synforma/analysis/stimulus.ts`) before anything is
   stored; it lives in this browser's `analyses` collection, is part of export/import/reset in Settings,
   and is removed with the program it is linked to.

The JSON contract (`StimulusAnalysisSchema`, `version: 1`):

| Field | Meaning |
|---|---|
| `id`, `createdAt`, `runId?`, `programId?` | identity and, if known, the run and program the recording covers |
| `source.fileName`, `durationS`, `sampleS`, `lagS` | the recording, its length, seconds between samples (one TR), the lag the predictions were shifted back by |
| `model.name`, `checkpoint`, `subject: "average"`, `license` | which model produced it; the subject is always the average subject |
| `systems[]`: `id` ∈ visual · language · attention · motor · default · other, `vertices`, `values[]` | mean predicted response per sample, z-scored across the recording, per coarse cortical system; every system has the same number of samples |
| `steps[]`: `stepId`, `title`, `startS`, `endS` | the step windows from the steps file |
| `disclaimer` | fixed wording the bridge writes; the UI shows the same wording verbatim |

Disclaimer, shown verbatim in the UI (`DISCLAIMER` in `lib/synforma/analysis/stimulus.ts`):

> Predicted response of an average subject's cortex to the recorded screen content (TRIBE v2 encoding
> model). A property of the screens, not a measurement of any person. Research use; the model is
> licensed CC BY-NC 4.0.

Never describe this data as what a person's brain is doing, or as engagement, emotion or a signature of
anyone. The stored analysis contains no frames of the recording and nothing about the person who made it.

## Privacy model

Synforma observes people at work. If people believe it is management spyware, the product fails.
Privacy is therefore architecture, not a legal page.

### What is collected (this prototype)

| Category | Collected | Never collected |
|---|---|---|
| Semantic screen state | roles, accessible names, headings, dialog titles, alert text, table headers, definition-list labels | screenshots, full DOM, page text bodies |
| Navigation | route patterns, step transitions, backtracks, abandonment | URLs of non-program applications |
| Validation | alert text shown by the application | field values that failed |
| Pointer | 1-second aggregates: distance, path efficiency, direction changes, hover dwell per semantic element, approaches/withdrawals to the current target | raw coordinates or movement traces |
| Keyboard | 1-second METADATA aggregates: counts by category (character, backspace, enter, escape, shortcut, navigation), median inter-key interval, bursts | key values, typed text, clipboard, anything on password / secret / card / token fields (those emit only a suppressed count) |
| Outcome verification | labels present on the outcome screen and which requirements were met | record values (except in the approval payload the person explicitly approved) |
| Demonstration capture | route, state, control clicked, which field changed | the typed value |
| Gaze / webcam / physiology | nothing (a provider interface exists; nothing implements it) | — |

Enforced in code: `lib/synforma/interaction/telemetry.ts` (`isSensitiveField`, `classifyKey`; key values
are classified and discarded synchronously), `snapshot.ts` (no text bodies), `runner.ts` / `observer.ts`
(outcome events carry labels only), `demonstration.ts` (semantic trace only). `verify/friction.spec.js`
checks that typed values never appear in event payloads; `verify/epics.spec.js` checks the same for a
reconstructed demonstration. The Settings page shows the collection table above, verbatim in substance,
next to the consent wording (`components/settings/sensing-section.tsx`).

### What is inferred, and what is not

Synforma infers **interaction states** with uncertainty: fluent, visual search, decision uncertainty,
knowledge gap, policy uncertainty, error recovery, workflow friction, unknown. Every inference stores its
evidence and alternatives.

Synforma never infers, stores or displays: emotion, stress, personality, intelligence, motivation as a
trait, mental health, neurodivergence, "performer" rankings, or any employee-worth score. Interaction
features exist only to improve the current person's interaction with the current task. They are never
used to identify, authenticate or rank a person.

### The behavioral firewall

- **Employee-private**: assistance preference, proficiency per step, interaction windows, individual
  friction history, "why this appeared" records.
- **Employer-visible**: aggregate friction by workflow step, completion rates, intervention effects,
  system-vs-human recommendations. Cohorts below a minimum size must be suppressed.

In this prototype all data lives in one browser (localStorage), so the firewall is a data-model boundary,
not yet an access-control boundary. The data model in `docs/ARCHITECTURE.md` keeps private collections
separate so a server deployment can put them behind per-user authorization and expose only aggregates to
admin roles (the Supabase backend in `docs/ROADMAP.md`).

### Controls the person has

- See the collected categories and the live feature windows (employee view, "what Synforma sees").
- Pause sensing (visible state), or turn interaction sensing off in Settings.
- Choose how Synforma helps: Just do it · Work with me · Teach me · Stay out of the way.
- Dismiss any assistance; mark it not helpful; "why this?" on every card.
- Export, import and delete everything (Settings).

### Regulatory posture (design intent, not legal advice)

Designed to stay clear of workplace emotion recognition and biometric identification. Behavioral
telemetry remains personal data: purpose limitation, minimization, transparency and retention controls
apply. Jurisdiction-specific review is required before any workplace deployment.

## Threat model

Synforma is a privileged layer that observes and acts inside enterprise software. This prototype runs
entirely in one browser against a bundled sandbox, but the design must already assume the production
threats.

### Assets

Work Graph and programs; run events and interaction windows (personal data); approval records, ledger
and audit log; the ability to act in target applications; the optional language-model API keys
(server only).

### Threats and mitigations

| Threat | Mitigation in this build | Production requirement |
|---|---|---|
| Prompt injection from page content (a page says "ignore instructions and delete records") | The model never decides authorization or executes; it returns structured JSON validated with Zod against fixed enums; page content reaches it only as labels, keys and options; actions come from the deterministic planner and require the semantic target to exist in the live snapshot | Strict tool allow-lists, policy service outside the model, content sanitization, action previews |
| Model hallucination leading to action | Actions resolve only to elements present in the live snapshot; commit actions are approval-gated; a judgment step can never become `act`; DO_NOTHING is a first-class policy outcome | Golden evaluation suite on every prompt or model change |
| Unauthorized autonomous writes | Discovery never executes commit controls; the runner's default policy asks before any commit; approvals stored with the exact payload; `commits: "auto"` only for simulations and for a commit the person just approved | Approval tokens bound to user, action, target, parameter hash, expiry; policy classes A–D enforced server-side |
| Sensitive data in telemetry | Keyboard metadata only; sensitive fields suppressed; no screenshots; labels-only outcome events; verification scripts check for typed values in events | Org deny-lists, redaction at the client, retention classes |
| Cross-tenant leakage | Single-tenant local store | `org_id` on every row, row-level security, per-user private collections |
| Compromised extension / supply chain | Not applicable (no extension yet); dependencies pinned in the lockfile | Signed releases, dependency scanning, controlled CI/CD, security review of the extension permission model |
| Key theft | No durable secrets in the browser; keys are read only inside the server-side provider registry; error messages are redacted; the status endpoint reveals provider and model only | Short-lived OAuth/OIDC tokens, managed secret store |
| Planner route abuse | Request schema and body size limits, per-process rate limit, deadline; no user content is stored server-side | Authenticated route, per-tenant quotas, shared rate limiter |
| Poisoned workflow learning | Nodes carry provenance and trust state; inferred nodes never overwrite observed facts; claims record contradictions and the runner stops on conflict | Human confirmation edges; drift verification before promotion; owner review of demonstrated workflows (governance lifecycle) |
| Over-broad autonomy | Autonomy Contract per workflow: consequential writes ask, destructive never; the UI cannot set classes C/D to automatic; the runner abandons a whole-workflow agent run on a class the contract forbids | Approval tokens bound to parameter hashes; permission and authority graph (can technically / is authorized / Synforma may / always ask) |
| Unrecoverable agent mistakes | Provenance ledger with before/after state; reversible fills can be undone in the live interface | Compensating actions through connectors; time-range rollback |
| Surveillance misuse by admins | Aggregates only in Measure; recommendation classes never single out a person | Minimum cohort size, role-based firewall tests |

### Explicit non-goals

No emotion recognition, no employee ranking from telemetry, no covert influence, no engagement
maximization. If a feature only works when hidden from the person, it is not built.

## Event schema

Events are append-only `RunEvent { id, runId, t, type, stepId?, message?, data? }`
(`lib/synforma/types.ts`). They are the only source of metrics. Timestamps are wall-clock ms; pointer
windows also carry their own duration. A production stream adds `orgId`, `sessionId`, a pseudonymous
`userId`, `monotonicMs`, `pageStateVersion`, `schemaVersion`, `clientVersion` and an idempotency key.

| type | emitted by | data |
|---|---|---|
| `run_started` | UI | actor, mode, preference; synthetic runs add persona, capabilities, `simulated: true` |
| `screen_visited` | UI (optional) | url |
| `step_entered` / `step_completed` | runner, observer | title, mode, durationMs |
| `trust_decision` | runner (when `policy.trust` is set) | decision, risk, reasons, actionClass |
| `action_executed` | runner | action (kind, label, targetName), ok, durationMs, regrounded, regroundedTo, error |
| `action_regrounded` | runner | from, to (semantic key), toName (accessible name), `change { type: "ui_element_changed", screen, affectedStep, detectedAt, risk }` |
| `action_failed` | runner | action, error / reason |
| `validation_error` | runner, observer | alerts[] (application text) |
| `backtrack` | observer | from, to |
| `hesitation` | observer (time-only fallback), synthetic runner (`simulated: true`) | idleMs / reason |
| `wrong_screen` | observer | url |
| `pointer_window` | observer | PointerWindow aggregates (no coordinates) |
| `keyboard_window` | observer | KeyboardWindow metadata (no key values) |
| `friction_inferred` | observer; synthetic runs (`simulated: true`, persona) | state, confidence, evidence[], alternatives[], ruleVersion, targetKey |
| `assistance_shown` / `assistance_dismissed` | UI | interventionId, helpful? |
| `intervention_withheld` | UI | candidates[], reason (DO_NOTHING won, or control cohort) |
| `assist_requested` / `assist_completed` | UI + runner | stepId, via (assist / get_it_done) |
| `approval_requested` / `approval_granted` / `approval_denied` | runner | payload (field → value shown to the approver) |
| `outcome_verified` | runner, observer | url, onOutcomeScreen, requirementsMet[], labels[] |
| `run_completed` / `run_abandoned` / `run_failed` | runner, observer, UI | requirementsMet, reason (approval denied · validation · conflicting sources · contract forbids autonomy · outcome screen not reached) |
| `proficiency_updated` | UI | stepId, level, unassistedSuccesses, faded |
| `note` | any | free-form, always human-readable; the runner uses it for `skippedJudgment`, `stoppedBeforeCommit`, `skipped` |

`ledger_rollback`, `demonstration_recorded` and `claim_contested` are declared in `RunEventType`; in
this build rollback and demonstration are recorded as audit entries (`components/trust/use-trust-layer.ts`)
and contested claims live in the claims collection rather than the event stream.

Struggle signals (`StruggleSignal`) are derived from events and drive the decision policy; hypotheses,
interventions, approvals, ledger entries and audit entries are separate collections (see the data model
in `docs/ARCHITECTURE.md`).
