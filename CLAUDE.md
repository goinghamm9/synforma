# Synforma — notes for coding agents

- Read `docs/ARCHITECTURE.md`, `docs/ENGINE.md`, `docs/ENGINE_API.md`, `docs/DESIGN.md` before changing anything.
- The engine (`lib/synforma`) must never reference DOM ids/classes of the sandbox; it reads generic semantics only.
- Discovery never commits; commits are approval-gated; judgment steps are never automated. Keep these invariants.
- Only cite from `lib/synforma/science/citations.ts`. Never fabricate statistics; metrics come from stored events.
- Verify with `npx tsc --noEmit -p .`, `npx eslint .`, `npm run build`, and `node verify/engine.spec.js` against a dev server on port 3000.
