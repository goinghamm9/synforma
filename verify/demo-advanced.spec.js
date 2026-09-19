// Mission Control, advanced view: Connect → Objective → Discover → Understand → Approve → Act → vendor update (self-heal) → synthetic users → Adapt → Measure → drawer/audit → persistence → mobile → Start over.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/demo-advanced.spec.js (dev server on :3000).
/* Playwright verification of Mission Control (/demo) after the decide/provenance/change integration. */
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
  await page.screenshot({ path: path.join(OUT, `demo4-adv2-${name}.png`), fullPage: false });
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console: ${m.text().slice(0, 300)}`);
  });
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
    record("page renders Connect phase", true);
    const prefLink = page.getByTestId("assistance-preference");
    const prefHref = await prefLink.getAttribute("href");
    const prefText = await prefLink.innerText();
    record("header shows assistance preference linking to /settings", prefHref === "/settings" && /Work with me/.test(prefText), `${prefHref} · ${prefText.replace(/\n/g, " ")}`);

    // 1. Connect
    await page.getByTestId("connect-app").click();
    await page.getByTestId("connection-info").waitFor({ timeout: 30000 });
    const infoText = await page.getByTestId("connection-info").innerText();
    record("connect shows semantic snapshot", /actions/i.test(infoText) && /fields/i.test(infoText));
    await shot(page, "01-connect");

    // 2. Objective
    await page.getByTestId("continue-objective").click();
    await page.getByTestId("start-discovery").waitFor({ timeout: 10000 });
    const badge = await page.getByTestId("planner-badge").innerText();
    record("planner badge shown", /planner/i.test(badge), badge);
    await shot(page, "02-objective");
    await page.getByTestId("start-discovery").click();

    // 3. Discover
    await page.getByTestId("stop-discovery").waitFor({ timeout: 15000 });
    await page.waitForTimeout(4000);
    await shot(page, "03-discover");
    const t0 = Date.now();
    await page.getByTestId("program-status").filter({ hasText: /understood|active/ }).waitFor({ timeout: 90000 });
    record("discovery + planning reached 'understood' (≤ 90 s)", true, `${Math.round((Date.now() - t0) / 1000)}s`);
    const s0 = await store(page);
    const prog0 = Object.values(s0.programs || {})[0];
    record("work context stored on Program.context", Boolean(prog0 && prog0.context && prog0.context.entryUrl), JSON.stringify(prog0 && prog0.context));
    const prefs0 = await page.evaluate(() => JSON.parse(localStorage.getItem("synforma-demo-ui-v1") || "{}"));
    const prefEntry = prog0 ? prefs0[prog0.id] : null;
    record("demo prefs no longer carry the context", Boolean(prefEntry) && prefEntry.context === undefined && prefEntry.phase !== undefined, JSON.stringify(prefEntry));

    // 4. Understand: trust badges
    await page.getByTestId("approve-program").waitFor({ timeout: 10000 });
    const reqCount = await page.locator('[data-testid="requirements"] > li').count();
    const stepCount = await page.locator('[data-testid="workflow-steps"] > li').count();
    record("understand shows requirements and steps", reqCount >= 5 && stepCount >= 3, `${reqCount} requirements, ${stepCount} steps`);
    const badges = await page.locator('[data-testid="trust-badge"]').evaluateAll((els) => els.map((e) => ({ trust: e.getAttribute("data-trust"), text: e.textContent.trim() })));
    const approved = badges.filter((b) => b.text === "Organization-approved").length;
    const inferred = badges.filter((b) => /^Model-inferred · (heuristic|Gemini)$/.test(b.text)).length;
    const observed = badges.filter((b) => b.text === "Observed on the live interface").length;
    const none = badges.filter((b) => b.trust === "none").length;
    record("understand shows trust badges (approved / inferred / observed)", approved >= 5 && inferred >= 3 && observed >= 5 && none === 0, `${badges.length} badges: ${approved} organization-approved, ${inferred} model-inferred, ${observed} observed, ${none} missing`);
    const reqProv = await page.locator('[data-testid="requirement-provenance"]').first().innerText();
    record("requirement row lists its fulfilling field with provenance", /Organization-approved/.test(reqProv) && /Observed on the live interface/.test(reqProv), reqProv.replace(/\n/g, " | "));
    await page.locator('[data-testid="trust-badge"]').first().hover();
    await page.waitForTimeout(500);
    const tip = await page.getByRole("tooltip").innerText().catch(() => "");
    record("trust badge tooltip explains how Synforma knows", /How Synforma knows this/.test(tip), tip.replace(/\n/g, " | "));
    await shot(page, "04-understand");
    await page.getByTestId("approve-program").click();
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 10000 });
    record("approve program → active", true);

    // 5. Act (v1)
    await page.getByTestId("run-workflow").waitFor({ timeout: 10000 });
    await page.getByTestId("run-workflow").click();
    await page.getByRole("dialog", { name: /Approval required/ }).waitFor({ timeout: 120000 });
    const payloadRows = await page.getByRole("dialog").locator("tbody tr").count();
    record("approval dialog lists payload", payloadRows > 0, `${payloadRows} rows`);
    await shot(page, "05-approval");
    await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByTestId("act-result").waitFor({ timeout: 120000 });
    const resultText = await page.getByTestId("act-result").innerText();
    record("act result shows 5/5 requirements", /5\/5/.test(resultText) && /Completed/.test(resultText), resultText.split("\n").slice(0, 8).join(" | "));
    const changes1 = await page.getByTestId("changes-counter").first().getAttribute("data-count");
    record("v1 run: 0 changes detected", changes1 === "0", `counter ${changes1}`);
    await shot(page, "06-act-v1");
    const s1 = await store(page);
    const runs1 = Object.values(s1.runs || {});
    record("run persisted in localStorage", runs1.length >= 1 && runs1.some((r) => r.actor === "agent" && r.outcome === "completed"), `${runs1.length} runs; audit ${(s1.audit || []).length}; approvals ${Object.keys(s1.approvals || {}).length}`);

    await page.getByTestId("open-outcome").click();
    await page.waitForTimeout(2500);
    const frameUrl = await page.evaluate(() => document.querySelector("iframe")?.contentWindow?.location?.pathname);
    record("open outcome navigates iframe", /opportunities\//.test(frameUrl ?? ""), frameUrl);

    // 6. v2 + run again
    await page.getByTestId("ui-v2-switch").click();
    await page.waitForTimeout(3500);
    const v2 = await page.evaluate(() => localStorage.getItem("meridian-ui-version"));
    record("v2 switch sets sandbox UI version", v2 === "v2", String(v2));
    await page.getByTestId("run-workflow").waitFor({ timeout: 10000 });
    await page.getByTestId("run-workflow").click();
    await page.getByRole("dialog", { name: /Approval required/ }).waitFor({ timeout: 120000 });
    await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByTestId("act-result").waitFor({ timeout: 120000 });
    const logText = await page.locator(".act-log").innerText();
    const heals = (logText.match(/Self-healed/g) || []).length;
    const changeLines = logText.split("\n").filter((l) => /UI change detected on /.test(l));
    const wellFormed = changeLines.filter((l) => /UI change detected on \S+: '.+' is now '.+' · (low|medium|high) risk · re-verified by execution/.test(l));
    record("v2 run shows self-healed lines", heals > 0, `${heals} self-healed lines`);
    record("v2 run logs ≥ 4 'UI change detected' lines", changeLines.length >= 4 && wellFormed.length === changeLines.length, `${changeLines.length} lines, ${wellFormed.length} well-formed; e.g. ${changeLines[0]}`);
    const changeLevel = await page.locator('.act-log li[data-level="change"]').count();
    record("change lines use the 'change' log level", changeLevel === changeLines.length, `${changeLevel} li[data-level=change]`);
    const resultText2 = await page.getByTestId("act-result").innerText();
    const counter2 = await page.locator('[data-testid="act-result"] [data-testid="changes-counter"]').getAttribute("data-count");
    record("v2 result card shows the Changes counter", Number(counter2) >= 4 && /5\/5/.test(resultText2), `counter ${counter2}; ${resultText2.split("\n").slice(0, 6).join(" | ")}`);
    const changeList = await page.locator('[data-testid="change-list"] li').count();
    record("result card lists each detected change", changeList === Number(counter2), `${changeList} rows`);
    await page.locator('[data-testid="act-result"] [data-testid="changes-counter"]').hover();
    await page.waitForTimeout(500);
    const driftTip = await page.getByRole("tooltip").innerText().catch(() => "");
    record("Changes counter tooltip mentions configuration-drift detection", /configuration-drift detection/i.test(driftTip), driftTip.slice(0, 80));
    await shot(page, "07-act-v2");
    const s2 = await store(page);
    const v2runs = Object.values(s2.runs || {}).filter((r) => r.uiVariant === "v2");
    const changeEvents = (s2.events || []).filter((e) => e.type === "action_regrounded" && e.data && e.data.change);
    record("v2 run recorded with regroundings and change events", v2runs.length >= 1 && v2runs.some((r) => r.regroundings > 0) && changeEvents.length >= 4, JSON.stringify(v2runs.map((r) => ({ outcome: r.outcome, req: r.requirementsMet.length, regroundings: r.regroundings }))) + ` · ${changeEvents.length} change events`);
    const changeAudit = (s2.audit || []).filter((a) => a.action === "UI change detected").length;
    record("audit records UI change detections", changeAudit >= 4, `${changeAudit} entries`);

    // 7. Guide & Observe → synthetic users
    await page.getByRole("button", { name: /Guide & Observe/ }).click();
    await page.getByTestId("run-synthetic").waitFor({ timeout: 10000 });
    await shot(page, "08-guide-empty");
    await page.getByTestId("run-synthetic").click();
    const t1 = Date.now();
    await page.getByTestId("run-synthetic").filter({ hasText: /Run synthetic users again/ }).waitFor({ timeout: 300000 });
    await page.waitForTimeout(500);
    const rows = await page.locator('[data-testid="observe-results"] tbody tr').count();
    record("synthetic users produced 4 runs", rows >= 4, `${rows} rows in ${Math.round((Date.now() - t1) / 1000)}s`);
    const prefCells = await page.locator('[data-testid="run-preference"]').allInnerTexts();
    record("runs list shows the run preference", prefCells.length >= 4 && prefCells.every((t) => /Work with me/.test(t)), prefCells.join(" | "));
    const decisionCells = await page.locator('[data-testid="run-decisions"]').allInnerTexts();
    record("runs list shows proposed / quiet counts", decisionCells.length >= 4 && decisionCells.every((t) => /proposed/.test(t) && /quiet/.test(t)), decisionCells.map((t) => t.replace(/\s+/g, " ")).join(" | "));
    const s3 = await store(page);
    const synthRuns = Object.values(s3.runs || {}).filter((r) => r.actor === "synthetic");
    const withheldEvents = (s3.events || []).filter((e) => e.type === "intervention_withheld");
    const proposedEvents = (s3.events || []).filter((e) => e.type === "note" && e.data && e.data.decision === "intervene");
    const frictionEvents = (s3.events || []).filter((e) => e.type === "friction_inferred" && e.data && e.data.simulated);
    const withheldOk = withheldEvents.every((e) => e.data.selected === "do_nothing" && Array.isArray(e.data.candidates) && typeof e.data.reason === "string" && "frictionState" in e.data);
    record("decide() recorded do-nothing and proposal events", (withheldEvents.length > 0 || proposedEvents.length > 0) && withheldOk, `${withheldEvents.length} intervention_withheld (well-formed: ${withheldOk}) · ${proposedEvents.length} proposals · ${frictionEvents.length} simulated friction events`);
    const withheldOnRuns = synthRuns.reduce((a, r) => a + (r.withheld || 0), 0);
    record("run.withheld counters match do-nothing events", withheldOnRuns === withheldEvents.length && synthRuns.every((r) => r.preference === "work_with_me"), `${withheldOnRuns} on runs vs ${withheldEvents.length} events`);
    const guideDecisions = await page.getByTestId("guide-decisions").innerText().catch(() => "");
    record("guide panel shows the decision tally", /do-nothing/.test(guideDecisions) && /proposed in simulation/.test(guideDecisions), guideDecisions.replace(/\s+/g, " "));
    await shot(page, "09-guide-results");

    // 8. Adapt
    await page.getByRole("button", { name: /Adapt/ }).click();
    await page.waitForTimeout(500);
    const cards = await page.getByTestId("intervention-card").count();
    record("adapt shows at least one intervention", cards >= 1, `${cards} interventions`);
    const frictionStates = await page.locator('[data-testid="intervention-card"] [data-testid="friction-state"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
    record("intervention card shows the observed friction state", frictionStates.length >= 1 && frictionStates.some((s) => s && s !== "none"), frictionStates.join(", "));
    const summary = await page.getByTestId("decisions-summary").innerText();
    record("adapt shows the decisions summary", /stayed quiet \d+ time/.test(summary) && /DO_NOTHING is a first-class policy action/.test(summary) && /false-intervention rate/.test(summary), summary.split("\n").slice(0, 3).join(" | "));
    if (cards) {
      await page.getByText("Why this?").first().click();
      await page.waitForTimeout(300);
    }
    await shot(page, "10-adapt");

    // 9. Measure
    await page.getByRole("button", { name: /Measure/ }).click();
    await page.getByTestId("itor-hero").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const diagClass = await page.getByTestId("diagnosis-card").getAttribute("data-class");
    const diagHead = await page.getByTestId("diagnosis-headline").innerText();
    const diagText = await page.getByTestId("diagnosis-card").innerText();
    record("diagnosis card is not 'Still learning' with ≥ 3 people runs", diagClass !== "INSUFFICIENT_EVIDENCE" && !/Still learning/.test(diagHead), `${diagClass}: ${diagHead}`);
    const diagBadge = await page.getByTestId("diagnosis-class").innerText();
    record("diagnosis card has class badge, evidence, unlikely-to-help, confidence", /Interface problem|Assistance need|Learning need|Policy problem|Automation opportunity/.test(diagBadge) && /evidence/i.test(diagText) && /unlikely to help/i.test(diagText) && /confidence/i.test(diagText) && (await page.getByTestId("diagnosis-evidence").locator("li").count()) >= 1 && (await page.getByTestId("diagnosis-unlikely").locator("li").count()) >= 1, `${diagBadge} · ${diagText.split("\n").slice(2, 4).join(" | ")}`);
    const distRows = await page.locator('[data-testid="friction-distribution"] li').count();
    record("diagnosis shows friction distribution bars", distRows >= 1, `${distRows} states`);
    const hero = await page.getByTestId("itor-hero").innerText();
    record("ITOR hero counts people only (4 of 5 needed → Still learning)", /Still learning/.test(hero) && /4 of 5 finished runs by people/.test(hero) && /Agent runs do not count/.test(hero), hero.split("\n").slice(0, 2).join(" | "));
    const tiles = await Promise.all(["cohort-people", "cohort-simulation", "cohort-agent"].map((id) => page.getByTestId(id).innerText()));
    record("three cohort tiles People / Simulation / Agent", tiles.length === 3 && /people/i.test(tiles[0]) && /0 runs/.test(tiles[0]) && /simulation/i.test(tiles[1]) && /4 runs/.test(tiles[1]) && /completion/.test(tiles[1]) && /agent/i.test(tiles[2]) && /2 runs/.test(tiles[2]) && /completion/.test(tiles[2]), tiles.map((t) => t.replace(/\n/g, " ")).join(" || "));
    const burden = await Promise.all(["burden-interventions", "burden-do-nothing"].map((id) => page.getByTestId(id).innerText()));
    record("assistance burden tiles show — with no human runs", burden.every((t) => /—/.test(t)), burden.map((t) => t.replace(/\n/g, " ")).join(" || "));
    await shot(page, "11-measure");

    // 9b. Second synthetic batch → ≥ 5 people runs → the rate is reported.
    await page.getByRole("button", { name: /Guide & Observe/ }).click();
    await page.getByTestId("run-synthetic").click();
    await page.getByTestId("run-synthetic").filter({ hasText: /Simulating/ }).waitFor({ timeout: 10000 });
    await page.getByTestId("run-synthetic").filter({ hasText: /Run synthetic users again/ }).waitFor({ timeout: 300000 });
    await page.getByRole("button", { name: /Measure/ }).click();
    await page.getByTestId("itor-hero").waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    const hero2 = await page.getByTestId("itor-hero").innerText();
    const s5 = await store(page);
    const people = Object.values(s5.runs || {}).filter((r) => r.actor !== "agent" && r.outcome);
    const fieldReqs = (Object.values(s5.programs || {})[0].parsed.requirements || []).filter((r) => r.kind === "field").length;
    const successes = people.filter((r) => r.outcome === "completed" && r.requirementsMet.length >= fieldReqs).length;
    const expected = `${Math.round((successes / people.length) * 100)}%`;
    record("ITOR hero reports the people-only rate after 8 people runs", hero2.startsWith(expected) && new RegExp(`of ${people.length} finished runs by people \\(0 human · ${people.length} labeled simulation\\)`).test(hero2) && /Agent runs are reported separately/.test(hero2), `${hero2.split("\n").slice(0, 2).join(" | ")} (expected ${expected} = ${successes}/${people.length})`);
    const tiles2 = await Promise.all(["cohort-people", "cohort-simulation", "cohort-agent"].map((id) => page.getByTestId(id).innerText()));
    record("cohort tiles after second batch", /0 runs/.test(tiles2[0]) && /8 runs/.test(tiles2[1]) && /2 runs/.test(tiles2[2]), tiles2.map((t) => t.replace(/\n/g, " ")).join(" || "));
    await shot(page, "11b-measure-rate");
    await page.getByRole("tab", { name: "Runs" }).click();
    const runRows = await page.getByTestId("run-row").count();
    record("runs table lists runs", runRows >= 10, `${runRows} rows`);
    await page.getByTestId("run-row").first().click();
    await page.getByRole("dialog", { name: /Run timeline/ }).waitFor({ timeout: 5000 });
    await shot(page, "12-run-drawer");
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Audit log" }).click();
    const auditRows = await page.locator('[data-testid="audit-log"] > li').count();
    record("audit log has entries", auditRows > 10, `${auditRows} entries shown`);
    await shot(page, "13-audit");

    // 10. Reload restores state
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 30000 });
    const title = await page.getByTestId("program-title").innerText();
    const current = await page.locator('nav[aria-label="Phases"] [aria-current="step"]').innerText();
    record("reload restores program and phase", /qualified/i.test(title) && /Measure/.test(current), `${title} / ${current.replace(/\n/g, " ")}`);
    await page.getByTestId("diagnosis-card").waitFor({ timeout: 10000 });
    const diagAfter = await page.getByTestId("diagnosis-card").getAttribute("data-class");
    record("reload restores diagnosis from stored events", diagAfter === diagClass, `${diagAfter}`);
    await page.waitForTimeout(3000);
    await shot(page, "14-reload");
    await page.getByRole("button", { name: /Objective/ }).click();
    const ctxAmount = await page.locator("#ctx-amount").inputValue();
    record("objective panel shows the context from Program.context", ctxAmount === "48000", ctxAmount);

    // 11. Mobile layout
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    record("no horizontal overflow on mobile", !overflow);
    await shot(page, "15-mobile");
    await page.setViewportSize({ width: 1440, height: 900 });

    // 12. Start over
    await page.getByTestId("start-over").click();
    await page.getByTestId("confirm-start-over").click();
    await page.getByTestId("connect-app").waitFor({ timeout: 10000 });
    const s4 = await store(page);
    record("start over deletes program", Object.keys(s4.programs || {}).length === 0, `${Object.keys(s4.runs || {}).length} runs remain`);
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
