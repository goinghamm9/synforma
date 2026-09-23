## What this changes and why

<!-- One paragraph a reviewer can read without the diff. Link the issue if there is one. -->

## How it was verified

<!-- What ran, against what (dev server / production build / container), and the result. CI runs the same
     checks; say here what CI cannot see (a live model, a real host, a manual walkthrough). -->

## Invariants

- [ ] Discovery never commits; commits stay approval-gated; judgment steps stay human.
- [ ] The engine reads generic semantics only (no sandbox ids, classes or hooks); the sandbox imports nothing from `@/lib/synforma`.
- [ ] No fabricated statistics, no citations outside `lib/synforma/science/citations.ts`, no emotion or personality inference, no typed text in telemetry.
- [ ] Keys stay on the server; nothing new reaches the browser but `{ configured, provider, model }`.
- [ ] Docs updated where behaviour changed (README, ARCHITECTURE, ENGINE, OPERATIONS, ROADMAP).
