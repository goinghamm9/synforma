# Contributing

Synforma develops on GitHub alone: the repository is the system of record, GitHub Actions is the only
pipeline, and the container image CI publishes is the only thing that gets deployed.

## The loop

1. Branch from `main`. Keep branches short-lived; one concern per pull request.
2. Run the checks locally before you push (below). They are the same ones CI runs.
3. Open a pull request. The template asks what changed, how it was verified, and which invariants you
   checked. CODEOWNERS assigns the reviewer.
4. CI must be green: static checks and unit specs, four end-to-end shards, the container build, CodeQL.
   A red check on a pull request you opened is yours to fix; "flaky" is a diagnosis, not a resolution.
5. Squash-merge. The merge commit carries the pull request title and a body a reader can follow.

## The checks

```bash
npm ci
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run test:unit        # verify/*.spec.ts with tsx (no browser, no keys)
npm run build            # next build
npm run test:e2e         # verify/*.spec.js against `next start` on :3000 (needs a Chromium: see below)
```

`npm run verify` runs all of them. The browser specs need Chromium: `npx playwright install --with-deps chromium`
once, or point `CHROMIUM_PATH` at a binary. `node scripts/ci/run-e2e.mjs --only demo-simple` runs one spec;
`--shard 2/4` runs the same slice CI runs on its second runner; `--base http://localhost:3000` uses a server
you started yourself (a dev server works for most specs). Logs and screenshots land in `.verify/`.

## The container

```bash
docker build -t synforma:local .
docker run --rm -p 3000:3000 synforma:local
```

The image is the production artifact: `SYNFORMA_STANDALONE=1 next build` inside a multi-stage Dockerfile,
served by Node as a non-root user, with a health check on `/api/planner/status`. CI builds it on every
run, pushes it to `ghcr.io/goinghamm9/synforma` on `main` and on `v*` tags, and attaches a signed build
provenance attestation. Configuration is environment variables only (`.env.example`); keys are read on the
server at request time and never baked into the image.

## Releases and deploys

- Tag `v<major>.<minor>.<patch>` on `main` and publish a GitHub Release; CI builds the image for the tag,
  and the Deploy workflow releases it to the `production` environment, which waits for its required
  reviewers. `Deploy` can also be run by hand for `staging` with any image tag CI produced.
- The runtime host is configured per environment with variables, not code (`DEPLOY_TARGET`, `FLY_APP`,
  `APP_URL`) and a secret (`FLY_API_TOKEN`). Adding another host means adding its steps to
  `.github/workflows/deploy.yml`.

## Invariants that do not move

Discovery never commits; commits are approval-gated; judgment steps are never automated; conflicting
sources stop autonomy. The engine reads generic semantics only. No fabricated statistics, citations only
from `lib/synforma/science/citations.ts`, no emotion or personality inference, no raw typed text in
telemetry. Keys stay on the server. `CLAUDE.md` says the same to coding agents; the pull request template
asks you to confirm it.
