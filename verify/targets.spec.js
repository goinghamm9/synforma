// Engine on every target application: discover → plan → Act (v1) → vendor update → Act (v2, self-heal).
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/targets.spec.js [crm,billing,data,erp,assistant] (dev server on :3000).
// DECIDER_MOCK=1 serves a stand-in decision model from the browser (verify/fixtures/jev-mock.js): the runs then show how
// often the rules were unsure, and that a "none" answer never breaks a run.
const { chromium } = require("playwright");
const { mockJev } = require("./fixtures/jev-mock");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ids = (process.argv[2] || "crm,billing,data,erp,assistant").split(",");
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const summary = [];
  for (const id of ids) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const decisionLog = [];
    if (process.env.DECIDER_MOCK) await mockJev(context, {}, decisionLog);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    console.log(`\n=== ${id} ===`);
    try {
      await page.goto(`${BASE}/dev/engine?target=${id}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.__synforma), null, { timeout: 60000 });
      const disc = await page.evaluate(async () => { const r = await window.__synforma.discover(); return { screens: r.states.length, actions: r.stats.actions ?? null, fields: r.stats.fields ?? null, stats: r.stats }; });
      console.log("DISCOVER", JSON.stringify(disc).slice(0, 300));
      const plan = await page.evaluate(async () => { const r = await window.__synforma.plan(); return { outcome: r.workflow.outcomeRoutePattern ?? null, requirements: r.parsed.requirements.map((q) => q.text), steps: r.workflow.steps.map((s) => `${s.index + 1}. ${s.title} [${s.mode}]${s.commit ? " (commit)" : ""}`) }; });
      console.log("OUTCOME PATTERN", plan.outcome);
      console.log("REQUIREMENTS", JSON.stringify(plan.requirements));
      console.log("STEPS", JSON.stringify(plan.steps));
      const ctxPatch = id === "erp" ? { deliveryDate: inDays(14) } : {};
      const act1 = await page.evaluate(async (patch) => { const ctx = { ...window.__synforma.defaultContext(), ...patch }; const r = await window.__synforma.act(ctx, true); const tail = r.events.slice(-8).map((e) => `${e.type}${e.stepId ? `@${e.stepId}` : ""}: ${e.message ?? ""}`); return { outcome: r.result.outcome, met: r.result.requirementsMet, failed: r.result.failedStepId ?? null, error: r.result.error ?? null, url: r.result.outcomeUrl ?? null, tail }; }, ctxPatch);
      console.log("ACT v1", JSON.stringify({ ...act1, tail: undefined }));
      if (act1.outcome !== "completed") console.log("  last events:\n   " + act1.tail.join("\n   "));
      await page.evaluate(async () => { await window.__synforma.vendorUpdate("v2"); });
      const act2 = await page.evaluate(async (patch) => { const ctx = { ...window.__synforma.defaultContext(), ...patch }; const r = await window.__synforma.act(ctx, true); const heals = r.events.filter((e) => e.type === "action_regrounded").length; const tail = r.events.slice(-10).map((e) => `${e.type}${e.stepId ? `@${e.stepId}` : ""}: ${e.message ?? ""}`); const decisionEvents = r.events.filter((e) => e.type === "decision").map((e) => e.message); return { outcome: r.result.outcome, met: r.result.requirementsMet, regroundings: r.result.regroundings, heals, decisions: r.result.decisions, decisionEvents, failed: r.result.failedStepId ?? null, error: r.result.error ?? null, tail }; }, ctxPatch);
      console.log("ACT v2", JSON.stringify({ ...act2, tail: undefined, decisionEvents: undefined }));
      if (act2.decisionEvents.length) console.log("  decisions:\n   " + act2.decisionEvents.join("\n   "));
      if (act2.outcome !== "completed") console.log("  last events:\n   " + act2.tail.join("\n   "));
      await page.evaluate(async () => { await window.__synforma.vendorUpdate("v1"); });
      summary.push({ id, screens: disc.screens, steps: plan.steps.length, v1: `${act1.outcome} ${act1.met.length}/${plan.requirements.length}`, v2: `${act2.outcome} ${act2.met.length}/${plan.requirements.length} · ${act2.regroundings} re-grounded`, decisions: process.env.DECIDER_MOCK ? `${act2.decisions?.accepted ?? 0}/${act2.decisions?.asked ?? 0} used (v2) · ${decisionLog.length} asked in both runs` : undefined, errors: errors.length });
    } catch (e) {
      console.log("ERROR", String(e).slice(0, 400));
      summary.push({ id, error: String(e).slice(0, 120), errors: errors.length });
    }
    if (errors.length) console.log("console/page errors:", errors.slice(0, 5));
    await context.close();
  }
  console.log("\nSUMMARY");
  for (const row of summary) console.log(JSON.stringify(row));
  // Gate: every target completes both runs with every requirement verified.
  const bad = summary.filter((row) => row.error || !/^completed (\d+)\/\1\b/.test(row.v1) || !/^completed (\d+)\/\1\b/.test(row.v2));
  console.log(bad.length ? `FAIL: ${bad.map((row) => row.id).join(", ")}` : "PASS: all targets 5/5 on both UI versions");
  process.exitCode = bad.length ? 1 : 0;
  await browser.close();
})();
