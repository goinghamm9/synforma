# Event schema

Events are append-only `RunEvent { id, runId, t, type, stepId?, message?, data? }` (`lib/synforma/types.ts`).
They are the only source of metrics. All timestamps are wall-clock ms; pointer windows also carry their own
duration. A production stream adds `orgId`, `sessionId`, pseudonymous `userId`, `monotonicMs`,
`pageStateVersion`, `schemaVersion`, `clientVersion` and an idempotency key.

| type | emitted by | data |
|---|---|---|
| `run_started` | UI | actor, mode, preference |
| `screen_visited` | UI (optional) | url |
| `step_entered` / `step_completed` | runner, observer | title, mode, durationMs |
| `action_executed` | runner | action (kind, label, targetName), ok, durationMs, regrounded, error |
| `action_regrounded` | runner | from, to, `change { type: "ui_element_changed", screen, affectedStep, detectedAt, risk }` |
| `action_failed` | runner | action, error |
| `validation_error` | runner, observer | alerts[] (application text) |
| `backtrack` | observer | from, to |
| `hesitation` | observer (time-only fallback), synthetic runner (`simulated: true`) | idleMs / reason |
| `wrong_screen` | observer | url |
| `pointer_window` | observer | PointerWindow aggregates (no coordinates) |
| `keyboard_window` | observer | KeyboardWindow metadata (no key values) |
| `friction_inferred` | observer | state, confidence, evidence[], alternatives[], ruleVersion, targetKey |
| `assistance_shown` / `assistance_dismissed` | UI | interventionId, helpful? |
| `intervention_withheld` | UI | candidates[], reason (DO_NOTHING won, or control cohort) |
| `assist_requested` / `assist_completed` | UI + runner | stepId, routineOnly |
| `approval_requested` / `approval_granted` / `approval_denied` | runner | payload (field → value shown to the approver) |
| `outcome_verified` | runner, observer | url, onOutcomeScreen, requirementsMet[], labels[] |
| `run_completed` / `run_abandoned` / `run_failed` | runner, observer, UI | requirementsMet, reason |
| `proficiency_updated` | UI | stepId, level, unassistedSuccesses, faded |
| `note` | any | free-form, always human-readable |

Struggle signals (`StruggleSignal`) are derived from events and drive the decision policy; hypotheses,
interventions, approvals and audit entries are separate collections (see `docs/ARCHITECTURE.md`).
