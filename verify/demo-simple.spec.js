// Mission Control, simple view: auto-connect → Discover and plan → Run it → Undo → Vendor update → Run again (self-healed) → Details → advanced → mobile width → Start over.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/demo-simple.spec.js (dev server on :3000).
/* Playwright verification of Mission Control's simple view (/demo, settings.demoView = "simple", the default):
   fresh localStorage → simple view → auto-connect → Discover and plan → steps → Run it (deny → Undo restores the
   wizard fields; approve → 5/5) → trust line → Vendor update → Run again (self-healed changes) → Details link lands in
   advanced Understand at the evidence panel → back to Simple keeps the program → reload keeps it → mobile: no overflow. */
const path = require("path");
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "..", ".verify");
require("fs").mkdirSync(OUT, { recursive: true });
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `demo4-simple-${name}.png`), fullPage: false });
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {});
const oneLine = (t) => t.replace(/\s*\n\s*/g, " | ");

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const frame = page.frameLocator("iframe");
  const approve = async (decision) => {
    const dialog = page.getByRole("dialog", { name: /Approval required/ });
    await dialog.waitFor({ timeout: 120000 });
    await dialog.getByRole("button", { name: decision, exact: true }).click();
  };
  try {
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    // 1. Default view + auto-connect
    await page.getByTestId("simple-view").waitFor({ timeout: 60000 });
    const view0 = await page.getByTestId("demo-view-toggle").getAttribute("data-view");
    // The store persists on its first write (the auto-connect audit entry); give a slow connect a moment.
    let s0 = await store(page);
    for (let i = 0; i < 60 && !(s0.settings || {}).demoView; i++) {
      await page.waitForTimeout(250);
      s0 = await store(page);
    }
    record("fresh localStorage → simple view is the default", view0 === "simple" && (s0.settings || {}).demoView === "simple" && (await page.locator('nav[aria-label="Phases"]').count()) === 0, `toggle=${view0} · settings.demoView=${(s0.settings || {}).demoView} · phase rail hidden`);
    await page.getByTestId("simple-connect-status").filter({ hasText: "Connected" }).waitFor({ timeout: 30000 });
    const connectText = await page.getByTestId("simple-connect").innerText();
    record("connect stage auto-connects and shows app name, version, Connected", /Meridian CRM/.test(connectText) && /v4\.2/.test(connectText) && /Connected/.test(connectText), oneLine(connectText).slice(0, 120));
    const s1 = await store(page);
    record("auto-connect records the audit entry", (s1.audit || []).some((a) => a.action === "Connected application"), `${(s1.audit || []).length} audit entries`);
    const trust0 = await page.getByTestId("simple-trust-line").innerText();
    record("trust line before a program: 0 claims, contract pending", /Evidence: 0 claims · 0 contested · Contract pending/.test(trust0), oneLine(trust0));

    // 2. Objective → Discover and plan
    const objective = await page.getByTestId("simple-objective-text").inputValue();
    record("objective textarea holds the default objective", /properly qualified opportunity/.test(objective), objective.slice(0, 60));
    record("context fields are collapsed behind Details", (await page.locator("#simple-ctx-amount").count()) === 0 && (await page.getByTestId("simple-objective-details").getAttribute("aria-expanded")) === "false");
    await page.getByTestId("simple-objective-details").click();
    const ctxAmount = await page.locator("#simple-ctx-amount").inputValue();
    record("Details reveals the context fields", ctxAmount === "48000", `amount=${ctxAmount}`);
    await page.getByTestId("simple-objective-details").click();
    await page.getByTestId("simple-discover").click();
    await page.locator('[data-testid="simple-progress"][data-stage="discovering"]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(3000);
    const progressText = await page.getByTestId("simple-progress").innerText();
    record("progress line shows screens found, actions, fields while exploring", /screens found/.test(progressText) && /actions/.test(progressText) && /fields/.test(progressText), oneLine(progressText));
    const t0 = Date.now();
    await page.locator('[data-testid="simple-progress"][data-stage="planned"]').waitFor({ timeout: 90000 });
    const planned = await page.getByTestId("simple-progress").innerText();
    record("discovery + planning finished (≤ 90 s) with 'N steps · planner'", /\d+ steps · (heuristic|Claude|Gemini) planner/.test(planned), `${Math.round((Date.now() - t0) / 1000)}s · ${oneLine(planned)}`);
    const status1 = await page.getByTestId("program-status").innerText();
    const stepRows = page.locator('[data-testid="simple-steps"] > li');
    const stepCount = await stepRows.count();
    const stepTexts = await stepRows.allInnerTexts();
    const chips = stepTexts.filter((t) => /Guide|Assist|Act/.test(t)).length;
    record("steps listed as a numbered list with mode chips", status1 === "understood" && stepCount >= 3 && chips === stepCount && /^1\./.test(stepTexts[0]), `${stepCount} steps · ${stepTexts.map(oneLine).join(" || ").slice(0, 160)}`);
    const trust1 = await page.getByTestId("simple-trust-line").innerText();
    record("trust line after planning: claims derived, contract v1 pending", /Evidence: \d+ claims · 0 contested · Contract v1 pending/.test(trust1) && Number(await page.getByTestId("simple-trust-line").getAttribute("data-claims")) >= 20, oneLine(trust1));
    await shot(page, "01-before-run");

    // 3. Run it: deny → Undo restores the wizard fields in the iframe
    await page.getByTestId("simple-run").click();
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 10000 });
    record("Run it approves the program (active) and starts the agent run", true);
    await approve("Deny");
    await page.locator('[data-testid="simple-result"][data-outcome="abandoned"]').waitFor({ timeout: 60000 });
    const denied = await page.getByTestId("simple-result").innerText();
    record("denied run → result card Abandoned with Undo available", /Abandoned/.test(denied) && !(await page.getByTestId("simple-undo").isDisabled()), oneLine(denied).slice(0, 120));
    await page.getByTestId("simple-undo").click();
    const toast = page.getByText(/Restored \d+ fields?/).first();
    await toast.waitFor({ timeout: 60000 });
    const restoredN = Number((/Restored (\d+)/.exec(await toast.innerText()) || [])[1] || 0);
    await page.waitForTimeout(800);
    const stepHeading = await frame.getByText(/Step 1 of 3/).first().innerText().catch(() => "");
    const amount = await frame.getByLabel("Amount").inputValue().catch(() => "?");
    const close = await frame.getByLabel("Expected close date").inputValue().catch(() => "?");
    record("Undo restores the fields in the iframe (wizard back on Basics, Amount / close date emptied)", restoredN >= 5 && /Step 1 of 3/.test(stepHeading) && amount === "" && close === "", `restored ${restoredN} · ${stepHeading} · amount="${amount}" close="${close}"`);
    const s2 = await store(page);
    record("ledger rows marked undone", (s2.ledger || []).filter((e) => e.rolledBackAt).length === restoredN, `${(s2.ledger || []).filter((e) => e.rolledBackAt).length} rolled back`);

    // 4. Run again → approve → completed 5/5
    const runLabel = await page.getByTestId("simple-run").innerText();
    record("run button now reads 'Run again'", /Run again/.test(runLabel), runLabel);
    await page.getByTestId("simple-run").click();
    await approve("Approve");
    await page.locator('[data-testid="simple-result"][data-outcome="completed"]').waitFor({ timeout: 120000 });
    const done1 = await page.getByTestId("simple-result").innerText();
    const log1 = await page.locator(".act-log").innerText();
    record("approved run → completed 5/5 with a live log (Trust: lines, Run completed)", /Completed/.test(done1) && /5\/5/.test(done1) && /0 re-groundings/.test(done1) && /Trust: /.test(log1) && /Run completed/.test(log1), oneLine(done1).slice(0, 140));
    const stepsDone = await page.locator('[data-testid="simple-steps"] > li svg.text-verdant').count();
    record("steps list shows completed steps", stepsDone >= 3, `${stepsDone} completed markers`);
    const trust2 = await page.getByTestId("simple-trust-line").innerText();
    record("trust line shows claims and the contract after the run", /Evidence: \d+ claims · 0 contested · Contract v1 (approved|pending)/.test(trust2), oneLine(trust2));
    await page.getByTestId("simple-undo").click();
    await page.getByText("Nothing could be restored").first().waitFor({ timeout: 60000 });
    record("Undo after a committed run reports that nothing could be restored (same as advanced)", true);
    await page.getByTestId("simple-result").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, "02-after-run");

    // 5. Vendor update → Run again → self-healed
    await page.getByTestId("simple-vendor-update").click();
    await page.getByTestId("simple-ui-variant").waitFor({ timeout: 15000 });
    await page.waitForTimeout(2500);
    const v2 = await page.evaluate(() => localStorage.getItem("meridian-ui-version"));
    const s3 = await store(page);
    record("Vendor update switches the sandbox to v2 and audits it", v2 === "v2" && (s3.audit || []).some((a) => a.action === "Simulated vendor UI update"), `meridian-ui-version=${v2}`);
    await page.getByTestId("simple-run").click();
    await approve("Approve");
    await page.locator('[data-testid="simple-result"][data-outcome="completed"]').waitFor({ timeout: 120000 });
    await page.getByTestId("simple-self-healed").waitFor({ timeout: 5000 });
    const healed = await page.getByTestId("simple-self-healed").innerText();
    const healedCount = Number(await page.getByTestId("simple-self-healed").getAttribute("data-count"));
    const changeRows = await page.locator('[data-testid="simple-self-healed"] li').count();
    const done2 = await page.getByTestId("simple-result").innerText();
    const log2 = await page.locator(".act-log").innerText();
    record("v2 run completes 5/5 and lists 'Self-healed N changes'", /5\/5/.test(done2) && healedCount >= 4 && changeRows === healedCount && new RegExp(`Self-healed ${healedCount} changes`).test(healed) && (log2.match(/Self-healed/g) || []).length >= 4 && /UI change detected on /.test(log2), `${healedCount} changes · ${oneLine(healed).slice(0, 160)}`);
    const s4 = await store(page);
    const v2runs = Object.values(s4.runs || {}).filter((r) => r.uiVariant === "v2" && r.actor === "agent");
    record("v2 run stored with regroundings; 'is now named' claims added", v2runs.some((r) => r.outcome === "completed" && r.regroundings >= 4) && Object.values(s4.claims || {})[0].some((c) => c.predicate === "is_now_named"), JSON.stringify(v2runs.map((r) => ({ outcome: r.outcome, regroundings: r.regroundings }))));
    await page.getByTestId("simple-self-healed").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, "03-after-vendor-update");

    // 6. Details → advanced Understand with the evidence panel in view
    await page.getByTestId("simple-details").click();
    await page.getByTestId("phase-panel").waitFor({ timeout: 10000 });
    await page.getByTestId("evidence-panel").waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);
    const view1 = await page.getByTestId("demo-view-toggle").getAttribute("data-view");
    const current = await page.locator('nav[aria-label="Phases"] [aria-current="step"]').innerText();
    const evBox = await page.getByTestId("evidence-section").boundingBox();
    const asideBox = await page.getByTestId("phase-panel").boundingBox();
    const s5 = await store(page);
    record("Details link lands in advanced Understand with the evidence section in view", view1 === "advanced" && (s5.settings || {}).demoView === "advanced" && /Understand/.test(current) && evBox && asideBox && evBox.y >= asideBox.y - 4 && evBox.y < asideBox.y + asideBox.height / 2, `${oneLine(current)} · evidence y=${evBox && Math.round(evBox.y)} aside y=${asideBox && Math.round(asideBox.y)}`);
    await shot(page, "04-details-advanced");

    // 7. Back to Simple keeps the program state
    await page.getByTestId("demo-view-toggle").getByRole("radio", { name: "Simple" }).click();
    await page.getByTestId("simple-view").waitFor({ timeout: 10000 });
    const stepsBack = await page.locator('[data-testid="simple-steps"] > li').count();
    const plannedBack = await page.getByTestId("simple-progress").innerText();
    const titleBack = await page.getByTestId("program-title").innerText();
    const trustBack = await page.getByTestId("simple-trust-line").innerText();
    record("toggle back to Simple keeps program state (steps, plan line, title, trust line)", stepsBack === stepCount && /\d+ steps · /.test(plannedBack) && /qualified/i.test(titleBack) && /Evidence: \d+ claims/.test(trustBack) && (await page.getByTestId("simple-connect-status").innerText()) === "Connected", `${stepsBack} steps · ${titleBack} · ${oneLine(trustBack)}`);

    // 8. Reload keeps the simple view and the program
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("simple-view").waitFor({ timeout: 30000 });
    await page.getByTestId("simple-connect-status").filter({ hasText: "Connected" }).waitFor({ timeout: 30000 });
    const stepsReload = await page.locator('[data-testid="simple-steps"] > li').count();
    record("reload restores the simple view, reconnects and lists the steps", stepsReload === stepCount && (await page.getByTestId("program-status").innerText()) === "active", `${stepsReload} steps`);

    // 9. Mobile: no horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    record("390px viewport: document.documentElement.scrollWidth <= window.innerWidth", widths.scroll <= widths.inner, JSON.stringify(widths));
    await page.evaluate(() => document.querySelector('[data-testid="simple-view"]')?.scrollIntoView());
    await shot(page, "05-mobile");
    await page.setViewportSize({ width: 1440, height: 900 });

    // 10. Start over → back to a fresh simple view that reconnects by itself
    await page.getByTestId("start-over").click();
    await page.getByTestId("confirm-start-over").click();
    await page.getByTestId("simple-connect-status").filter({ hasText: "Connected" }).waitFor({ timeout: 30000 });
    const s6 = await store(page);
    record("start over deletes the program and the simple view reconnects", Object.keys(s6.programs || {}).length === 0 && (await page.locator('[data-testid="simple-steps"]').count()) === 0, `${Object.keys(s6.programs || {}).length} programs`);
  } catch (e) {
    record("script", false, e.stack || String(e));
    try {
      await shot(page, "99-failure");
    } catch {}
  } finally {
    const pageErrors = consoleErrors.filter((e) => !/Download the React DevTools|hydrat/i.test(e));
    console.log("\nConsole/page errors:", pageErrors.length ? pageErrors.slice(0, 10) : "none");
    console.log("\nSUMMARY:", results.filter((r) => r.ok).length, "passed,", results.filter((r) => !r.ok).length, "failed");
    await browser.close();
  }
})();
