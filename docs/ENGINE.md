# The Synforma decision engine

This document explains how Synforma decides things, in enough detail to audit or replace any part.
Every rule below is implemented in `lib/synforma`; nothing is hidden inside a prompt.

## 1. Seeing the application (Universal Interaction Layer)

`snapshotDocument(doc, url)` turns a live DOM into a `PageModel`:

- **Elements**: every interactive control (`a[href]`, `button`, inputs, selects, textareas, ARIA roles
  button/link/menuitem/tab/checkbox/radio/switch/combobox/option/textbox) that is visible.
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
| name similarity | 0.6 × sim | sim = 0.55·overlap + 0.35·Jaccard + 0.15·containment over canonicalized tokens |
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

The Gemini planner does the same task with a language model and must return the same Zod-validated shape.

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

Values at run time (`resolveValue`): context first; then accepted values that exist as options; for
people-requirements, an option with a decision-making title (VP, Director, Chief, Head…); dates within
the requirement's window; sensible defaults otherwise.

## 6. Execution (`runner.ts`)

For each step: emit `step_entered`; for each action resolve the live field (re-grounding by meaning if
the key is gone), resolve the value, perform, emit `action_executed` (+ `action_regrounded`). If a click
does not advance and alerts appear → `validation_error`, repair invalid fields once (dates → ISO,
selects → first real option) and retry. Before a commit click → `approval_requested` with the collected
payload; denial → `run_abandoned`. After the last step, the outcome screen is snapshotted and
`verifyRequirements` checks each requirement against the definition list (label similarity, accepted /
rejected values, date windows) → `outcome_verified`, `run_completed` with `requirementsMet`.

**Synthetic users** run the same code with capabilities off: `synonyms` (literal reader), `expand`
(surface skimmer), `fixValidation` and `fillOptional` (hurried closer). Their runs are labeled synthetic
and excluded from human timing statistics.

## 7. Observation (`observer.ts`)

Every 500 ms: snapshot; if the outcome route is reached → verify and complete. Otherwise infer the
current step from anchors (route pattern + step heading, matched even behind a modal). Transitions emit
`step_entered` / `step_completed`; a lower index → `backtrack`; no matching step for 8 s → `wrong_screen`;
new `role=alert` text → `validation_error`; no input/click/keydown for the hesitation threshold (doubling
after each fire) while the step's requirements are unmet → `hesitation`. A live checklist re-reads the
mapped fields (accepted / rejected values, date windows; checkbox groups stay met once any option is).

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

**Select** a technique from the registry with an explainable score:

```
total = 0.35·barrierFit + 0.20·contextFit + 0.15·evidenceWeight + 0.30·previousSuccess
        − repetitionPenalty − burdenPenalty
```

- barrierFit: hypothesis confidence if the technique targets the primary barrier; 0.6 × alternative confidence otherwise.
- contextFit: 0 for Act on judgment steps (excluded); boosted for pointers when fields are hidden; capped for Act on commit steps.
- evidenceWeight: strong 1.0 · promising 0.75 · theoretical 0.5 · experimental 0.35 · philosophical 0.3.
- previousSuccess: 0.5 neutral prior; once ≥3 treated and ≥3 control human runs exist on this step, 0.5 + (treated completion − control completion).
- repetitionPenalty: 0.15 per prior use on the step (max 0.3). burdenPenalty: 0.4 × technique burden.

All components and their explanations are stored on the intervention ("Why this?").

**Experiment**: human runs are assigned deterministically to control / treatment by hashing the run id
against the treatment share; control runs record `assistance withheld`. **Learn**: `evaluateIntervention`
reports treated vs control completion and lift only when both arms reach `minRunsPerArm`.

## 9. Measurement (`metrics.ts`)

- **Intent-to-Outcome Rate** = finished runs that completed **and** verified every requirement ÷ finished runs; `null` until 5 finished runs.
- Per-step: entered, completed, median human duration, errors, hesitations, backtracks, assistance shown, assist requested, friction index (needs ≥3 entries).
- Cohorts: completion and median duration for control vs treatment.
- Self-healing: total re-groundings.

Nothing is extrapolated. The UI shows "Still learning" until `sufficient` is true.
