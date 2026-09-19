# Synforma — notes for coding agents

- Read `docs/ARCHITECTURE.md` (layers, module map, data model, knowledge layers, design language, sandbox spec), `docs/ENGINE.md` (decision rules and the API per module) and `docs/OPERATIONS.md` (deploy, verification, privacy, threat model, event schema) before changing anything. `docs/ROADMAP.md` says what is not built yet.
- The engine (`lib/synforma`) must never reference DOM ids/classes of the sandbox; it reads generic semantics only. The sandbox (`app/sandbox/crm`) must never import from `@/lib/synforma` or `@/components/brand`.
- Discovery never commits; commits are approval-gated (`RunPolicy.commits: "ask"` is the default); judgment steps are never automated; conflicting sources stop autonomy. Keep these invariants.
- Only cite from `lib/synforma/science/citations.ts`. Never fabricate statistics; metrics come from stored events. Never infer emotion or personality. No typed text in telemetry.
- Language-model keys are read on the server only (`lib/synforma/planner/server`); the browser sees `{ configured, provider, model }` and nothing else.
- Verify with `npx tsc --noEmit -p .`, `npx eslint .`, `npm run build`, `npx --yes tsx@4 verify/provider.spec.ts`, and `node verify/engine.spec.js` (plus `friction.spec.js`, `epics.spec.js`) against a dev server on port 3000 with `CHROMIUM_PATH` set.
