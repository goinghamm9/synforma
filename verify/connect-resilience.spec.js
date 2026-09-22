// The Connect stage against what a browser may carry over from earlier versions of the demo: an unreadable
// Synforma store, stored slices of the wrong shape, and sandbox records that crash the application's page.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/connect-resilience.spec.js (server on :3000).
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const CRASHING_CRM_DB = JSON.stringify({ version: 1, accounts: [], contacts: [], leads: [], opportunities: [], activities: [null] });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  async function fresh(seed, arg) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
    if (seed) await page.evaluate(seed, arg);
    return { context, page, errors };
  }
  const status = (page) => page.getByTestId("simple-connect-status");
  const audit = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {}).audit || []);

  // ── A. A clean browser: Preparing / Connecting → Connected, once ──
  {
    const { context, page, errors } = await fresh(null);
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    await status(page).filter({ hasText: "Connected" }).waitFor({ timeout: 90000 });
    const rows = await audit(page);
    const connects = rows.filter((a) => a.action === "Connected application");
    check("A: a clean browser connects and the audit records it once, on the first attempt", connects.length === 1 && !/second attempt/.test(connects[0].detail), JSON.stringify(connects.map((a) => a.detail)));
    check("A: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ── B. An unreadable Synforma store (not JSON) ──
  {
    const { context, page, errors } = await fresh(() => localStorage.setItem("synforma-store-v1", "{this is not json"));
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    await status(page).filter({ hasText: "Connected" }).waitFor({ timeout: 90000 });
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("synforma-store-v1")));
    const kept = keys.find((k) => /^synforma-store-v1\.unreadable\.\d+$/.test(k));
    const keptValue = kept ? await page.evaluate((k) => localStorage.getItem(k), kept) : null;
    check("B: an unreadable store does not stop the demo: it connects", true);
    check("B: the unreadable value is kept under another key and the store starts empty", Boolean(kept) && keptValue === "{this is not json" && keys.includes("synforma-store-v1"), keys.join(", "));
    check("B: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ── C. Stored slices of the wrong shape ──
  {
    const { context, page, errors } = await fresh(() => localStorage.setItem("synforma-store-v1", JSON.stringify({ state: { programs: "not an object", settings: [1, 2, 3], activeProgramId: "p_gone", runs: null, audit: { not: "an array" } }, version: 0 })));
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    await status(page).filter({ hasText: "Connected" }).waitFor({ timeout: 90000 });
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {});
    check("C: mis-shaped slices are ignored and the defaults are kept; an id of a program that no longer exists is harmless", state.programs && typeof state.programs === "object" && !Array.isArray(state.programs) && Array.isArray(state.audit) && state.settings && !Array.isArray(state.settings) && state.runs && typeof state.runs === "object", JSON.stringify({ programs: typeof state.programs, audit: Array.isArray(state.audit), settings: typeof state.settings, runs: typeof state.runs, active: state.activeProgramId }));
    check("C: no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ── D. Sandbox records that crash the CRM's home page ──
  {
    const { context, page, errors } = await fresh((db) => localStorage.setItem("meridian-crm-db", db), CRASHING_CRM_DB);
    // The application on its own: the error page, in its own words, with the reset offer.
    await page.goto(`${BASE}/sandbox/crm`, { waitUntil: "networkidle", timeout: 120000 });
    const heading = page.getByRole("heading", { name: /Meridian CRM hit an error/ });
    await heading.waitFor({ timeout: 30000 });
    check("D: the crashed CRM shows its own error page instead of a blank frame", await heading.isVisible());
    check("D: the error page offers to reset the application's data", await page.getByRole("button", { name: /Reset its demo data and reload/ }).isVisible());
    // Mission Control: the Connect stage recognises the error page, explains it and offers the reset.
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    const errorNote = page.getByTestId("simple-connect-error");
    await errorNote.waitFor({ timeout: 90000 });
    const text = await errorNote.innerText();
    check("D: the Connect stage names the application's error page and the likely cause", (await errorNote.getAttribute("data-crashed")) === "true" && /hit an error/.test(text) && /earlier version/.test(text), text.replace(/\s+/g, " ").slice(0, 200));
    check("D: the crash was not retried blindly", (await status(page).innerText()).includes("Not connected"));
    await page.getByTestId("simple-connect-reset-data").click();
    await status(page).filter({ hasText: "Connected" }).waitFor({ timeout: 90000 });
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem("meridian-crm-db") || "null"));
    const rows = await audit(page);
    check("D: Reset application data and retry reseeds the CRM and connects", db && Array.isArray(db.activities) && db.activities.length > 0 && db.activities.every((a) => a && typeof a === "object"), `activities=${db ? db.activities.length : "none"}`);
    check("D: the reset is in the audit with the keys removed", rows.some((a) => a.action === "Reset application data" && /meridian-crm-db/.test(a.detail)) && rows.some((a) => a.action === "Connected application"), JSON.stringify(rows.map((a) => a.action)));
    check("D: the application's error was logged, no Synforma page error", errors.every((e) => !/synforma/i.test(e)), errors.join(" | "));
    await context.close();
  }

  await browser.close();
  console.log(failures ? `FAIL ${failures}` : "ALL PASS");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
