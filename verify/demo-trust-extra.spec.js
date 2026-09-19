// Mission Control, advanced view: contract regeneration after reload, employee link, claims kept.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/demo-trust-extra.spec.js (dev server on :3000).
/* Extra checks: Guide's employee link is a Next Link (href resolves to /employee), a program restored without a
   contract gets the default one on reload, and the evidence/contract survive a reload. */
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
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {});
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`console: ${m.text().slice(0, 300)}`); });
  try {
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    // The simple view is the default (and connects by itself); these regressions exercise the advanced view, so seed it before the reload.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("synforma-store-v1", JSON.stringify({ state: { settings: { demoView: "advanced" } }, version: 0 }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("connect-app").waitFor({ timeout: 60000 });
    record("advanced view selected via settings.demoView", (await page.getByTestId("demo-view-toggle").getAttribute("data-view")) === "advanced");
    await page.getByTestId("connect-app").click();
    await page.getByTestId("connection-info").waitFor({ timeout: 30000 });
    await page.getByTestId("continue-objective").click();
    await page.getByTestId("start-discovery").waitFor({ timeout: 10000 });
    await page.getByTestId("start-discovery").click();
    await page.getByTestId("program-status").filter({ hasText: /understood|active/ }).waitFor({ timeout: 90000 });
    await page.getByTestId("approve-program").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const s0 = await store(page);
    const prog = Object.values(s0.programs || {})[0];
    record("contract created after planning", Object.keys(s0.contracts || {}).includes(prog.workflow.id), Object.keys(s0.contracts || {}).join(","));
    // Approve and open Guide: the employee link must be a Next Link with href /employee opening a new tab.
    await page.getByTestId("approve-program").click();
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /Guide & Observe/ }).click();
    const link = page.getByTestId("open-employee");
    await link.waitFor({ timeout: 10000 });
    const href = await link.getAttribute("href");
    const target = await link.getAttribute("target");
    const rel = await link.getAttribute("rel");
    record("Guide's employee link is a Next Link to /employee (new tab)", href === "/employee" && target === "_blank" && rel === "noreferrer", `${href} ${target} ${rel}`);
    // Remove the contract (data from before the trust layer) and reload: Understand must still show a contract table.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("synforma-store-v1"));
      raw.state.contracts = {};
      localStorage.setItem("synforma-store-v1", JSON.stringify(raw));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /Understand/ }).click();
    await page.getByTestId("autonomy-contract").waitFor({ timeout: 10000 });
    const s1 = await store(page);
    const claims1 = (s1.claims || {})[prog.id] || [];
    record("reload without a stored contract regenerates the default contract and keeps the claims", Object.keys(s1.contracts || {}).includes(prog.workflow.id) && claims1.length >= 20, `${Object.keys(s1.contracts || {}).length} contracts · ${claims1.length} claims`);
    const cActive = await page.locator('[data-testid="autonomy-contract"] tr[data-class="C_consequential_write"] [role="radio"][aria-checked="true"]').innerText();
    record("regenerated contract has C = Ask", cActive === "Ask", cActive);
    await page.screenshot({ path: path.join(OUT, "demo4-adv3-14-contract-regenerated.png") });
    await page.getByTestId("start-over").click();
    await page.getByTestId("confirm-start-over").click();
    await page.getByTestId("connect-app").waitFor({ timeout: 10000 });
  } catch (e) {
    record("script", false, e.stack || String(e));
    try { await page.screenshot({ path: path.join(OUT, "demo4-adv3-99-extra-failure.png") }); } catch {}
  } finally {
    const pageErrors = consoleErrors.filter((e) => !/Download the React DevTools|hydrat/i.test(e));
    console.log("\nConsole/page errors:", pageErrors.length ? pageErrors.slice(0, 10) : "none");
    console.log("\nSUMMARY:", results.filter((r) => r.ok).length, "passed,", results.filter((r) => !r.ok).length, "failed");
    await browser.close();
  }
})();
