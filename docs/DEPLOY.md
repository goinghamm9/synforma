# Try it: run locally or deploy in a few clicks

Synforma is a plain Next.js app with no database and no required secrets. All state lives in the
browser (localStorage). The bundled target application (Meridian CRM) is part of the same site, so a
single deployment is the whole demo.

## Run locally (2 minutes)

```bash
git clone https://github.com/goinghamm9/Experimentation.git
cd Experimentation
git checkout claude/synforma-loop-website-3d-ooqg1a   # until the PR is merged
cd synforma
npm install
npm run dev
```

Open http://localhost:3000/demo and follow `docs/DEMO_SCRIPT.md`. Node 20 or newer.

## Deploy to Vercel (5 minutes, free tier)

1. Sign in at vercel.com and choose **Add New → Project**, then import `goinghamm9/Experimentation`.
2. Set **Root Directory** to `synforma`. Framework preset: Next.js (detected). Build command and output
   are the defaults (`next build`).
3. Environment variables: none required. Optional: `GEMINI_API_KEY` (and `GEMINI_MODEL`) to enable the
   LLM planner; without it the heuristic planner runs and the UI says so.
4. Deploy. The production URL serves the site at `/`, Mission Control at `/demo`, the employee view at
   `/employee`, the Work Graph at `/graph`, and the sandbox CRM at `/sandbox/crm`.

Any other Node host (Netlify, Render, Fly, a VM with `npm run build && npm run start`) works the same way.
The app needs a Node runtime only for the optional `/api/planner` route.

## What to expect

- Discovery takes about 10 seconds and drives the embedded CRM visibly.
- Everything is per browser: two people opening the same URL each get their own state. Use Settings →
  Export / Import to move a program between browsers.
- The 3D Work Graph needs WebGL (any current laptop browser).

## Production build check

```bash
cd synforma && npm run build && npm run start   # http://localhost:3000
```
