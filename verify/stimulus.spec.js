// Stimulus analysis (research): the Science page section (disclaimer wording, import of the synthetic fixture, list, small
// multiples, per-step table, persistence across a reload, removal, invalid file rejected) and the advanced Act panel's
// Record screen button (present; either enabled, or disabled with a stated reason when the browser offers no screen capture).
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/stimulus.spec.js (dev server on :3000).
// Fixture: verify/fixtures/stimulus-analysis.example.json (synthetic values, checkpoint says so).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const seed = require("./fixtures/employee-seed.json");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "..", ".verify");
fs.mkdirSync(OUT, { recursive: true });
const FIXTURE = path.join(__dirname, "fixtures", "stimulus-analysis.example.json");
const fixture = require(FIXTURE);
const DISCLAIMER =
  "Predicted response of an average subject's cortex to the recorded screen content (TRIBE v2 encoding model). A property of the screens, not a measurement of any person. Research use; the model is licensed CC BY-NC 4.0.";
const CLI = "python -m tribe_bridge.analyze --video run.webm --steps run-steps.json --out analysis.json";
const RECORD_NOTE = "The recording stays on your computer. Use it with the TRIBE bridge for a stimulus analysis (research).";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `stimulus-${name}.png`), fullPage: false });
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
  let recordState = "unknown";
  try {
    // ───────── Science page ─────────
    await page.goto(`${BASE}/science`, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    const section = page.locator("section#stimulus");
    await section.waitFor({ timeout: 30000 });
    const heading = await section.locator("h2").innerText();
    record("science page has the Research section", /Predicted cortical response to screens/.test(heading), heading);
    const disclaimer = (await page.getByTestId("stimulus-disclaimer").innerText()).trim();
    record("disclaimer shown verbatim", disclaimer === DISCLAIMER, disclaimer.slice(0, 80));
    const sectionText = await section.innerText();
    record("section never describes the data as a measurement of a person", !/what the user's brain|engagement|emotion|neuro-signature/i.test(sectionText) && /average subject/.test(sectionText) && /property of the screens/.test(sectionText));
    record("license and research-use labels present", /CC BY-NC 4\.0/.test(sectionText) && /Research use/.test(sectionText));
    await page.getByTestId("stimulus-empty").waitFor({ timeout: 10000 });
    const cli = (await page.getByTestId("stimulus-cli").innerText()).trim();
    record("empty state explains record → analyse → import with the CLI line", cli === CLI && /Record/.test(sectionText) && /Analyse offline/.test(sectionText) && /Import/.test(sectionText), cli);
    await shot(page, "01-empty");

    // Invalid file → readable error, nothing stored.
    const badFile = path.join(os.tmpdir(), "synforma-bad-analysis.json");
    fs.writeFileSync(badFile, JSON.stringify({ version: 1, id: "x", createdAt: 1, source: { fileName: "x.webm", durationS: 1, sampleS: 1, lagS: 0 }, model: { name: "m", checkpoint: "c", subject: "average", license: "l" }, systems: [], steps: [], disclaimer: "d" }));
    await page.getByTestId("stimulus-import").setInputFiles(badFile);
    const err = await page.getByTestId("stimulus-import-error").innerText({ timeout: 10000 });
    record("invalid file shows the parser's error and stores nothing", /systems/.test(err) && Object.keys((await store(page)).analyses || {}).length === 0, err);

    // Valid fixture → list entry, chart, table.
    await page.getByTestId("stimulus-import").setInputFiles(FIXTURE);
    const entry = page.getByTestId("stimulus-entry");
    await entry.first().waitFor({ timeout: 10000 });
    const entryText = oneLine(await entry.first().innerText());
    record("list entry shows file, model, checkpoint, duration, run", /example\.webm/.test(entryText) && /TRIBE v2/.test(entryText) && /example-fixture \(synthetic values for the import test\)/.test(entryText) && /1m 00s/.test(entryText) && /run_example1/.test(entryText), entryText.slice(0, 200));
    record("import error cleared after a valid import", (await page.getByTestId("stimulus-import-error").count()) === 0);
    await page.getByTestId("stimulus-chart").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    const facets = await page.locator('[data-testid="stimulus-chart"] figure[data-system]').count();
    const facetIds = await page.locator('[data-testid="stimulus-chart"] figure[data-system]').evaluateAll((els) => els.map((e) => e.getAttribute("data-system")));
    const paths = await page.locator('[data-testid="stimulus-chart"] path.recharts-line-curve').count();
    record("chart renders six small multiples with one line each", facets === 6 && paths === 6 && facetIds.join(",") === "visual,language,attention,motor,default,other", `${facets} facets, ${paths} lines: ${facetIds.join(",")}`);
    const chartText = await page.getByTestId("stimulus-chart").innerText();
    record("facets are titled by system label and step bands carry the step title", /Visual cortex/.test(chartText) && /Language network/.test(chartText) && /Default-mode \(medial\)/.test(chartText) && /Basics/.test(chartText) && /Qualification/.test(chartText), oneLine(chartText).slice(0, 160));
    const bands = await page.locator('[data-testid="stimulus-chart"] .recharts-reference-area').count();
    record("each facet shades the two step windows", bands === 12, `${bands} reference areas`);
    const rows = page.getByTestId("stimulus-step-row");
    const rowCount = await rows.count();
    const highest = await page.locator('[data-testid="stimulus-step-table"] td[data-highest="true"]').count();
    const rowTexts = (await rows.allInnerTexts()).map(oneLine);
    record("per-step table has one row per step with the highest system marked", rowCount === 2 && highest === 2 && /Basics/.test(rowTexts[0]) && /Qualification/.test(rowTexts[1]) && rowTexts.every((t) => /highest/.test(t)), rowTexts.join(" || ").slice(0, 240));
    // The marked cell is the system with the largest mean in that row (checked against the fixture, computed like stepTable()).
    const expected = fixture.steps.map((st) => {
      const from = Math.max(0, Math.floor(st.startS / fixture.source.sampleS));
      const to = Math.min(fixture.systems[0].values.length, Math.ceil(st.endS / fixture.source.sampleS));
      const means = fixture.systems.map((s) => ({ id: s.id, m: s.values.slice(from, to).reduce((a, b) => a + b, 0) / (to - from) }));
      return means.reduce((b, e) => (e.m > b.m ? e : b)).id;
    });
    const columns = ["visual", "language", "attention", "motor", "default", "other"];
    const marked = await rows.evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).findIndex((td) => td.getAttribute("data-highest") === "true") - 2));
    record("highest marks agree with the fixture's per-step means", marked.map((i) => columns[i]).join(",") === expected.join(","), `ui ${marked.map((i) => columns[i]).join(",")} · expected ${expected.join(",")}`);
    const detailDisclaimer = (await page.getByTestId("stimulus-detail-disclaimer").innerText()).trim();
    record("disclaimer repeated verbatim under the data", detailDisclaimer.startsWith(DISCLAIMER) && !/differs from this wording/.test(detailDisclaimer));
    await shot(page, "02-imported");
    const s1 = await store(page);
    record("analysis persisted in the store's analyses collection", s1.analyses && s1.analyses[fixture.id] && s1.analyses[fixture.id].model.subject === "average", Object.keys(s1.analyses || {}).join(","));

    // Reload keeps it.
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("stimulus-entry").first().waitFor({ timeout: 30000 });
    await page.getByTestId("stimulus-chart").waitFor({ timeout: 15000 });
    record("reload restores the imported analysis, chart and table", (await page.getByTestId("stimulus-entry").count()) === 1 && (await page.getByTestId("stimulus-step-row").count()) === 2);

    // Remove.
    await page.getByTestId("stimulus-remove").first().click();
    await page.getByTestId("stimulus-empty").waitFor({ timeout: 10000 });
    const s2 = await store(page);
    record("remove clears the list and the store", (await page.getByTestId("stimulus-entry").count()) === 0 && Object.keys(s2.analyses || {}).length === 0 && (await page.getByTestId("stimulus-chart").count()) === 0);
    await shot(page, "03-removed");

    // ───────── Mission Control, advanced Act panel ─────────
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate((s) => {
      localStorage.clear();
      localStorage.setItem("meridian-ui-version", "v1");
      const state = {
        programs: { [s.program.id]: s.program },
        graphs: { [s.graph.id]: s.graph },
        discoveries: { [s.program.id]: s.states },
        runs: {},
        events: [],
        signals: [],
        hypotheses: {},
        interventions: {},
        audit: [],
        approvals: {},
        proficiency: {},
        claims: {},
        ledger: [],
        contracts: {},
        analyses: {},
        activeProgramId: s.program.id,
        settings: { demoView: "advanced" },
      };
      localStorage.setItem("synforma-store-v1", JSON.stringify({ state, version: 0 }));
    }, seed);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("run-workflow").waitFor({ timeout: 60000 });
    record("advanced view opens the Act panel for the seeded active program", (await page.getByTestId("demo-view-toggle").getAttribute("data-view")) === "advanced" && /Act/.test(await page.locator('nav[aria-label="Phases"] [aria-current="step"]').innerText()));
    const button = page.getByTestId("record-screen");
    await button.waitFor({ timeout: 10000 });
    const note = await page.getByTestId("record-screen-note").innerText();
    record("record button present with the local-only note", /Record screen/.test(await button.innerText()) && note.trim() === RECORD_NOTE, note);
    const disabled = await button.isDisabled();
    const reason = await button.getAttribute("data-unavailable-reason");
    const hasApi = await page.evaluate(() => typeof navigator.mediaDevices?.getDisplayMedia === "function" && typeof MediaRecorder !== "undefined" && window.isSecureContext);
    if (disabled) {
      recordState = `disabled: ${reason}`;
      await page.getByTestId("record-screen-wrap").hover();
      await page.waitForTimeout(500);
      const tip = await page.getByRole("tooltip").innerText().catch(() => "");
      record("record button is disabled with a stated reason (tooltip)", Boolean(reason) && tip.trim() === reason && !hasApi, `${reason} · api present: ${hasApi}`);
    } else {
      recordState = "enabled (getDisplayMedia exists in this browser)";
      record("record button is enabled because getDisplayMedia exists", hasApi && reason === null && (await button.getAttribute("data-recording")) === "false", `api present: ${hasApi}`);
    }
    record("nothing recorded without a click", (await page.getByTestId("recording-indicator").count()) === 0 && !(await store(page)).audit.some((a) => /Screen recording/.test(a.action)));
    await shot(page, "04-act-record");

    // The employee view has no recording control.
    await page.goto(`${BASE}/employee`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1500);
    record("employee view offers no recording control", (await page.getByTestId("record-screen").count()) === 0 && !/Record screen/.test(await page.locator("body").innerText()));
  } catch (e) {
    record("script", false, e.stack || String(e));
    try {
      await shot(page, "99-failure");
    } catch {}
  } finally {
    const pageErrors = consoleErrors.filter((e) => !/Download the React DevTools|hydrat/i.test(e));
    console.log("\nRecord button state observed:", recordState);
    console.log("Console/page errors:", pageErrors.length ? pageErrors.slice(0, 10) : "none");
    console.log("\nSUMMARY:", results.filter((r) => r.ok).length, "passed,", results.filter((r) => !r.ok).length, "failed");
    await browser.close();
    process.exitCode = results.some((r) => !r.ok) || pageErrors.length ? 1 : 0;
  }
})();
