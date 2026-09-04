# Privacy model

Synforma observes people at work. If people believe it is management spyware, the product fails. Privacy
is therefore architecture, not a legal page.

## What is collected (this prototype)

| Category | Collected | Never collected |
|---|---|---|
| Semantic screen state | roles, accessible names, headings, dialog titles, alert text, table headers, definition-list labels | screenshots, full DOM, page text bodies |
| Navigation | route patterns, step transitions, backtracks, abandonment | URLs of non-program applications |
| Validation | alert text shown by the application | field values that failed |
| Pointer | 1-second aggregates: distance, path efficiency, direction changes, hover dwell per semantic element, approaches/withdrawals to the current target | raw coordinates or movement traces |
| Keyboard | 1-second METADATA aggregates: counts by category (character, backspace, enter, escape, shortcut, navigation), median inter-key interval, bursts | key values, typed text, clipboard, anything on password / secret / card / token fields (those emit only a suppressed count) |
| Outcome verification | labels present on the outcome screen and which requirements were met | record values (except in the approval payload the person explicitly approved) |
| Gaze / webcam / physiology | nothing (a provider interface exists; nothing implements it) | — |

Enforced in code: `lib/synforma/interaction/telemetry.ts` (`isSensitiveField`, `classifyKey`; key values are
classified and discarded synchronously), `snapshot.ts` (no text bodies), `runner.ts` / `observer.ts`
(outcome events carry labels only). `verify/engine.spec.js` and `verify/privacy.spec.js` assert that typed
values never appear in event payloads.

## What is inferred, and what is not

Synforma infers **interaction states** with uncertainty: fluent, visual search, decision uncertainty,
knowledge gap, policy uncertainty, error recovery, workflow friction, unknown. Every inference stores its
evidence and alternatives.

Synforma never infers, stores or displays: emotion, stress, personality, intelligence, motivation as a
trait, mental health, neurodivergence, "performer" rankings, or any employee-worth score. Interaction
features exist only to improve the current person's interaction with the current task. They are never
used to identify, authenticate or rank a person.

## The behavioral firewall

- **Employee-private**: assistance preference, proficiency per step, interaction windows, individual
  friction history, "why this appeared" records.
- **Employer-visible**: aggregate friction by workflow step, completion rates, intervention effects,
  system-vs-human recommendations. Cohorts below a minimum size must be suppressed.

In this prototype all data lives in one browser (localStorage), so the firewall is a data-model boundary,
not yet an access-control boundary. The server design in `docs/ARCHITECTURE.md` keeps private
collections behind per-user authorization and exposes only aggregates to admin roles.

## Controls the person has

- See the collected categories and the live feature windows (employee view, "what Synforma sees").
- Pause sensing (visible state), or turn interaction sensing off in Settings.
- Choose how Synforma helps: Just do it · Work with me · Teach me · Stay out of the way.
- Dismiss any assistance; mark it not helpful; "why this?" on every card.
- Export, import and delete everything (Settings).

## Regulatory posture (design intent, not legal advice)

Designed to stay clear of workplace emotion recognition and biometric identification. Behavioral
telemetry remains personal data: purpose limitation, minimization, transparency and retention controls
apply. Jurisdiction-specific review is required before any workplace deployment.
