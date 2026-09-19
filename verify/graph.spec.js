// Work Graph process map (/graph): sample graph in the map with lenses, search, layers, intent flow and the 3D toggle;
// the seeded discovered graph (Workflow, Application, Evidence lenses, mobile dialog); runs produced by Mission Control's
// simple view (Discover and plan → Run it → approve → Vendor update → Run again) shown as traffic and self-heal badges.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/graph.spec.js (dev server on :3000). Fixture: verify/fixtures/employee-seed.json.
const path = require("path");
const { chromium } = require("playwright");
const seed = require("./fixtures/employee-seed.json");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "..", ".verify");
require("fs").mkdirSync(OUT, { recursive: true });
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `graph-${name}.png`), fullPage: false });
const oneLine = (t) => String(t).replace(/\s*\n\s*/g, " | ");
const errors = [];

async function newPage(browser, tag, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|hydrat|Download the React DevTools/i.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 300)}`);
  });
  return { context, page };
}

const nodes = (page) => page.locator('[data-testid="map-node"]');
const nodeCount = (page) => nodes(page).count();
const typeCounts = (page) =>
  nodes(page).evaluateAll((els) =>
    els.reduce((acc, el) => {
      const t = el.getAttribute("data-node-type");
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {}),
  );
const trustCounts = (page) =>
  nodes(page).evaluateAll((els) =>
    els.reduce((acc, el) => {
      const t = el.getAttribute("data-trust") || "none";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {}),
  );
const viewportTransform = (page) => page.locator(".react-flow__viewport").evaluate((el) => el.style.transform);
async function waitMap(page) {
  await page.getByTestId("process-map").waitFor({ timeout: 60000 });
  await page.waitForTimeout(900);
}
async function lens(page, value) {
  await page.getByTestId(`graph-lens-${value}`).click();
  await page.waitForTimeout(700);
}
async function seedStore(page) {
  const state = {
    programs: { [seed.program.id]: seed.program },
    graphs: { [seed.graph.id]: seed.graph },
    discoveries: { [seed.program.id]: seed.states },
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
    activeProgramId: seed.program.id,
    settings: { plannerPreference: "auto", assistancePreference: "work_with_me", interactionSensing: true, sensingPaused: false, hesitationThresholdMs: 3000, requireApprovalForCommit: true, treatmentShare: 1 },
  };
  await page.goto(`${BASE}/sandbox/crm/settings?ui=v1`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    localStorage.setItem("synforma-store-v1", JSON.stringify({ state: s, version: 0 }));
    localStorage.removeItem("meridian-crm-db");
    localStorage.setItem("meridian-ui-version", "v1");
  }, state);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  // ── (a) Empty storage: the sample graph in the map ──
  {
    const { context, page } = await newPage(browser, "sample");
    try {
      await page.goto(`${BASE}/graph`, { waitUntil: "networkidle", timeout: 120000 });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle", timeout: 120000 });
      await waitMap(page);
      const banner = await page.getByTestId("graph-sample-banner").innerText();
      const title = await page.getByTestId("graph-title").innerText();
      const counts = await page.getByTestId("graph-counts").innerText();
      record("(a) empty storage renders the sample graph in the map with the sample banner", /Illustrative sample/.test(banner) && title === "Illustrative sample" && /45 nodes/.test(counts) && (await page.getByTestId("graph-view-toggle").getAttribute("data-view")) === "map", `${oneLine(banner).slice(0, 60)} · ${counts}`);
      const t0 = await typeCounts(page);
      const stepIdx = await page.locator('[data-node-type="step"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-step-index")).join(","));
      record("(a) Workflow lens is the default: numbered steps, objective and outcome on the map", (await page.getByTestId("graph-lens").getAttribute("data-lens")) === "workflow" && stepIdx === "1,2,3,4" && t0.objective >= 1 && t0.outcome >= 1 && t0.screen === 2, JSON.stringify(t0));
      const n0 = await nodeCount(page);
      await shot(page, "01-sample-workflow");
      await lens(page, "application");
      const n1 = await nodeCount(page);
      const t1 = await typeCounts(page);
      record("(a) Application lens changes the node count and shows every sample screen", n1 !== n0 && t1.screen === 3 && t1.application >= 1 && !t1.step, `${n0} → ${n1} · ${JSON.stringify(t1)}`);
      await lens(page, "runs");
      record("(a) Runs lens on the sample says to run the demo first", (await page.getByTestId("graph-runs-empty").count()) === 1 && /Mission Control/.test(await page.getByTestId("graph-runs-empty").innerText()));
      await lens(page, "evidence");
      const tr = await trustCounts(page);
      record("(a) Evidence lens marks every sample node illustrative", tr.illustrative === (await nodeCount(page)) && (await page.getByTestId("graph-legend-tone-inferred").count()) === 1, JSON.stringify(tr));
      await lens(page, "workflow");
      const before = await viewportTransform(page);
      await page.getByTestId("graph-search").fill("Qualify");
      await page.getByTestId("graph-search-result").first().click();
      await page.waitForTimeout(900);
      const after = await viewportTransform(page);
      const selected = page.locator('[data-testid="map-node"][data-selected="true"]');
      const detail = await page.getByTestId("node-detail").innerText();
      record("(a) search result selects the node, pans the map to it and opens its detail", (await selected.count()) === 1 && /Qualify the opportunity/.test(await selected.getAttribute("aria-label")) && before !== after && /Qualify the opportunity/.test(detail) && /Illustrative/.test(detail), `${before} → ${after}`);
      await shot(page, "02-sample-search");
      await page.getByTestId("graph-show-all").click();
      await page.waitForTimeout(700);
      const t2 = await typeCounts(page);
      record("(a) Show all screens adds the screens the workflow does not touch", t2.screen === 3 && (await page.getByTestId("graph-show-all").getAttribute("aria-pressed")) === "true", JSON.stringify(t2));
      await page.getByTestId("graph-layer-requirement").click();
      await page.waitForTimeout(500);
      const t3 = await typeCounts(page);
      await page.getByTestId("graph-layer-requirement").click();
      await page.waitForTimeout(500);
      const t4 = await typeCounts(page);
      record("(a) layer toggle hides and restores a node type", !t3.requirement && t4.requirement === 5, `${JSON.stringify(t3)} → requirements ${t4.requirement}`);
      await page.getByTestId("graph-show-all").click();
      // 3D toggle
      await page.getByTestId("graph-view-toggle-3d").click();
      await page.getByTestId("work-graph-3d").waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      const stored3d = await page.evaluate(() => localStorage.getItem("synforma-graph-view"));
      record("(a) 3D toggle mounts the 3D scene in place of the map and remembers the choice", (await page.getByTestId("process-map").count()) === 0 && (await page.getByTestId("work-graph-3d").count()) === 1 && stored3d === "3d" && (await page.getByTestId("graph-page").getAttribute("data-view")) === "3d", `stored=${stored3d} · fallback=${await page.getByTestId("work-graph-fallback").count()}`);
      await shot(page, "03-sample-3d");
      await page.getByTestId("graph-view-toggle-map").click();
      await waitMap(page);
      record("(a) back to Map restores the process map and the preference", (await page.getByTestId("work-graph-3d").count()) === 0 && (await nodeCount(page)) > 0 && (await page.evaluate(() => localStorage.getItem("synforma-graph-view"))) === "map");
      await page.reload({ waitUntil: "networkidle", timeout: 120000 });
      await waitMap(page);
      record("(a) reload keeps the remembered view", (await page.getByTestId("graph-page").getAttribute("data-view")) === "map" && (await page.getByTestId("process-map").count()) === 1);

      // (e) intent flow playback runs to the end, each hop selecting a node
      await page.getByTestId("graph-play-flow").click();
      await page.getByTestId("graph-flow-caption").waitFor({ timeout: 5000 });
      const cap0 = await page.getByTestId("graph-flow-caption").innerText();
      const total = Number((/hop \d+ of (\d+)/i.exec(cap0) || [])[1] || 0);
      const midSelected = await page.locator('[data-testid="map-node"][data-selected="true"]').count();
      await page.getByTestId("graph-flow-caption").filter({ hasText: "complete" }).waitFor({ timeout: total * 1400 + 8000 });
      const capEnd = await page.getByTestId("graph-flow-caption").innerText();
      const endSelected = page.locator('[data-testid="map-node"][data-selected="true"]');
      record("(e) intent flow plays every hop to the end and lands on the outcome", total >= 6 && midSelected === 1 && new RegExp(`hop ${total} of ${total}`, "i").test(capEnd) && /outcome/i.test(capEnd) && (await endSelected.getAttribute("data-node-type")) === "outcome", `${total} hops · ${oneLine(capEnd).slice(0, 100)}`);
      await shot(page, "04-sample-flow-end");
    } catch (e) {
      record("(a) script", false, e.stack || String(e));
      await shot(page, "99-a-failure").catch(() => {});
    } finally {
      await context.close();
    }
  }

  // ── (b) Seeded discovered graph ──
  {
    const { context, page } = await newPage(browser, "seed");
    try {
      await seedStore(page);
      await page.goto(`${BASE}/graph`, { waitUntil: "networkidle", timeout: 120000 });
      await waitMap(page);
      const title = await page.getByTestId("graph-title").innerText();
      const steps = await page.locator('[data-node-type="step"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("data-step-index")}:${e.getAttribute("aria-label")}`));
      const expected = seed.program.workflow.steps.map((s) => `${s.index + 1}:Step ${s.index + 1}: ${s.title}`);
      const stepsOk = steps.length === expected.length && steps.every((s, i) => s.startsWith(expected[i]));
      const t = await typeCounts(page);
      const outcome = await page.locator('[data-node-type="outcome"]').first().getAttribute("aria-label");
      record("(b) Workflow lens: program title, the five numbered steps in order, the objective and the outcome", title === seed.program.title && stepsOk && t.objective === 1 && t.outcome === 1 && /Success is every new opportunity/.test(outcome) && t.requirement === 5 && t.screen === 2 && (await page.getByTestId("graph-sample-banner").count()) === 0, `${steps.join(" || ").slice(0, 200)} · ${oneLine(outcome)}`);
      const hidden = Number(await page.getByTestId("graph-hidden-screens").getAttribute("data-count"));
      await shot(page, "05-seed-workflow");
      await page.getByTestId("graph-show-all").click();
      await page.waitForTimeout(700);
      const tAll = await typeCounts(page);
      record("(b) 11 screens hidden on the workflow lens; Show all screens reveals all 13", hidden === 11 && tAll.screen === 13, `hidden=${hidden} · ${JSON.stringify(tAll)}`);
      await page.getByTestId("graph-show-all").click();
      await lens(page, "application");
      const tApp = await typeCounts(page);
      const navLabels = await page.locator('[data-testid="map-edge-label"]').count();
      const dialogs = await page.locator('[data-node-type="screen"]').evaluateAll((els) => els.filter((e) => /^Dialog:/.test(e.getAttribute("aria-label") || "")).length);
      const screenCounts = await page.locator('[data-testid="map-screen-counts"]').first().innerText();
      record("(b) Application lens: the application and all 13 discovered screens by navigation, with action/field counts and labelled navigation", tApp.application === 1 && tApp.screen === 13 && !tApp.step && navLabels >= 5 && dialogs === 3 && /\d+ actions? · \d+ fields?/.test(screenCounts), `${JSON.stringify(tApp)} · ${navLabels} labels · ${dialogs} dialogs · ${screenCounts}`);
      await shot(page, "06-seed-application");
      await lens(page, "evidence");
      const tr = await trustCounts(page);
      record("(b) Evidence lens colours nodes by trust: organization-approved, observed and model-inferred present", tr.approved >= 6 && tr.inferred === 6 && tr.observed === 2 && !tr.illustrative && (await page.locator('[data-testid^="graph-legend-tone-"]').count()) === 5, JSON.stringify(tr));
      const inferred = page.locator('[data-node-type="step"]').first();
      await inferred.click();
      await page.waitForTimeout(400);
      const trustBadge = await page.getByTestId("trust-badge").first().innerText();
      record("(b) a model-inferred step's detail carries the engine's trust label", trustBadge === "Model-inferred" && (await page.getByTestId("node-provenance").getAttribute("data-trust")) === "MODEL_INFERRED", trustBadge);
      await shot(page, "07-seed-evidence");
      await lens(page, "runs");
      record("(b) Runs lens without runs shows the empty-state note", (await page.getByTestId("graph-runs-empty").count()) === 1);
      await lens(page, "workflow");
      const pane = await page.locator(".react-flow__pane").boundingBox();
      await page.mouse.click(pane.x + 6, pane.y + pane.height - 6); // bottom-left corner: clear of the legend strip and the controls
      await page.waitForTimeout(300);
      record("(b) clicking empty canvas clears the selection", (await page.locator('[data-testid="map-node"][data-selected="true"]').count()) === 0 && (await page.getByTestId("node-detail-empty").count()) === 1);

      // (d) 390 px viewport
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(1200);
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth, map: document.querySelector('[data-testid="process-map"]')?.getBoundingClientRect().width }));
      record("(d) 390px viewport: no horizontal page overflow and the map fits the viewport", widths.scroll <= widths.inner && widths.map > 0 && widths.map <= widths.inner, JSON.stringify(widths));
      await page.locator('[data-node-type="step"]').nth(2).click();
      const dialog = page.getByRole("dialog", { name: "Node details" });
      await dialog.waitFor({ timeout: 5000 });
      const dialogText = await dialog.innerText();
      record("(d) tapping a node opens the detail in the Dialog", /Basics/.test(dialogText) && /How Synforma knows this/i.test(dialogText), oneLine(dialogText).slice(0, 80));
      await shot(page, "08-seed-mobile");
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1440, height: 900 });
    } catch (e) {
      record("(b) script", false, e.stack || String(e));
      await shot(page, "99-b-failure").catch(() => {});
    } finally {
      await context.close();
    }
  }

  // ── (c) Runs from Mission Control's simple view, then the Runs lens ──
  {
    const { context, page } = await newPage(browser, "runs");
    const approve = async (decision) => {
      const dialog = page.getByRole("dialog", { name: /Approval required/ });
      await dialog.waitFor({ timeout: 120000 });
      await dialog.getByRole("button", { name: decision, exact: true }).click();
    };
    try {
      await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 120000 });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle", timeout: 120000 });
      await page.getByTestId("simple-view").waitFor({ timeout: 60000 });
      await page.getByTestId("simple-connect-status").filter({ hasText: "Connected" }).waitFor({ timeout: 30000 });
      await page.getByTestId("simple-discover").click();
      await page.locator('[data-testid="simple-progress"][data-stage="planned"]').waitFor({ timeout: 90000 });
      await page.getByTestId("simple-run").click();
      await approve("Approve");
      await page.locator('[data-testid="simple-result"][data-outcome="completed"]').waitFor({ timeout: 120000 });
      record("(c) Mission Control: discovery, plan and an approved run completed", /Completed/.test(await page.getByTestId("simple-result").innerText()));
      await page.getByTestId("simple-vendor-update").click();
      await page.getByTestId("simple-ui-variant").waitFor({ timeout: 15000 });
      await page.waitForTimeout(2500);
      await page.getByTestId("simple-run").click();
      await approve("Approve");
      await page.locator('[data-testid="simple-result"][data-outcome="completed"]').waitFor({ timeout: 120000 });
      await page.getByTestId("simple-self-healed").waitFor({ timeout: 5000 });
      const healed = Number(await page.getByTestId("simple-self-healed").getAttribute("data-count"));
      record("(c) Vendor update → Run again self-healed the changes", healed >= 4, `${healed} changes`);

      await page.goto(`${BASE}/graph`, { waitUntil: "networkidle", timeout: 120000 });
      await waitMap(page);
      record("(c) /graph shows the discovered program, not the sample", (await page.getByTestId("graph-sample-banner").count()) === 0 && /qualified/i.test(await page.getByTestId("graph-title").innerText()));
      await lens(page, "runs");
      const traffic = await page.locator('[data-testid="map-edge-traffic"]').evaluateAll((els) => els.map((e) => ({ happy: e.getAttribute("data-happy"), count: Number(e.getAttribute("data-count")) })));
      const happy = traffic.filter((t) => t.happy === "true");
      const stepsVisited = await page.locator('[data-node-type="step"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-visits"))));
      record("(c) Runs lens: traffic labels > 0 on every happy-path edge and visits on every step", happy.length >= 5 && happy.every((t) => t.count > 0) && stepsVisited.length >= 3 && stepsVisited.every((v) => v >= 2) && (await page.getByTestId("graph-runs-empty").count()) === 0, `${JSON.stringify(traffic)} · visits ${stepsVisited.join(",")}`);
      const heal = page.locator('[data-testid="map-self-heal"]');
      const healCounts = await heal.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-count"))));
      record("(c) at least one self-heal badge after the v2 run", healCounts.length >= 1 && healCounts.reduce((a, b) => a + b, 0) >= 4, healCounts.join(","));
      const healedStep = page.locator('[data-testid="map-node"]').filter({ has: page.locator('[data-testid="map-self-heal"]') }).first();
      await healedStep.click();
      await page.waitForTimeout(400);
      const stats = await page.getByTestId("node-run-stats").innerText();
      record("(c) selecting a self-healed step shows its run statistics in the detail panel", /Runs entered/.test(stats) && /Self-healed/.test(stats) && /Median time/.test(stats), oneLine(stats).slice(0, 160));
      await shot(page, "09-runs-lens");
      const outcome = await page.locator('[data-node-type="outcome"]').first().getAttribute("aria-label");
      record("(c) the outcome node counts completed runs", /2 completed/.test(outcome), oneLine(outcome));
    } catch (e) {
      record("(c) script", false, e.stack || String(e));
      await shot(page, "99-c-failure").catch(() => {});
    } finally {
      await context.close();
    }
  }

  console.log("\nConsole/page errors:", errors.length ? errors.slice(0, 10) : "none");
  record("zero console/page errors", errors.length === 0, `${errors.length}`);
  console.log("\nSUMMARY:", results.filter((r) => r.ok).length, "passed,", results.filter((r) => !r.ok).length, "failed");
  await browser.close();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})();
