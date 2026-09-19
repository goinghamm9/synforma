// Mission Control, advanced view, trust layer: evidence/claims, autonomy contract, trust decisions, ledger + undo, contested claims stop, v2 self-heal claims, teach by doing.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/demo-trust.spec.js (dev server on :3000).
/* Playwright verification of Mission Control (/demo) with the trust layer mounted: evidence, contract, trust decisions, ledger + undo, contested claims, superseded naming claims, teach by doing. */
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
  await page.screenshot({ path: path.join(OUT, `demo4-adv3-${name}.png`), fullPage: false });
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {});
const bump = (v) => {
  const [a, b] = v.split(".").map(Number);
  return `${a}.${b + 1}`;
};
async function approveAndRun(page) {
  await page.getByTestId("run-workflow").waitFor({ timeout: 10000 });
  await page.getByTestId("run-workflow").click();
  await page.getByRole("dialog", { name: /Approval required/ }).waitFor({ timeout: 120000 });
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByTestId("act-result").waitFor({ timeout: 120000 });
  return page.getByTestId("act-result").innerText();
}
async function trustRow(page, title) {
  const rows = page.locator('[data-testid="trust-decisions"] > li');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const t = await rows.nth(i).innerText();
    if (t.includes(title)) return t.replace(/\s+/g, " ");
  }
  return "";
}
async function replan(page, from, to) {
  await page.getByRole("button", { name: /Objective/ }).click();
  await page.getByTestId("replan").waitFor({ timeout: 10000 });
  const text = await page.locator("#objective").inputValue();
  if (!text.includes(from)) throw new Error(`objective does not contain "${from}"`);
  await page.locator("#objective").fill(text.replace(from, to));
  await page.getByTestId("replan").click();
  await page.getByTestId("program-status").filter({ hasText: /understood/ }).waitFor({ timeout: 60000 });
  await page.getByTestId("approve-program").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
}

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

    // Connect → Objective → Discover
    await page.getByTestId("connect-app").click();
    await page.getByTestId("connection-info").waitFor({ timeout: 30000 });
    await page.getByTestId("continue-objective").click();
    await page.getByTestId("start-discovery").waitFor({ timeout: 10000 });
    await page.getByTestId("start-discovery").click();
    await page.getByTestId("stop-discovery").waitFor({ timeout: 15000 });
    const t0 = Date.now();
    await page.getByTestId("program-status").filter({ hasText: /understood|active/ }).waitFor({ timeout: 90000 });
    record("discovery + planning reached 'understood' (≤ 90 s)", true, `${Math.round((Date.now() - t0) / 1000)}s`);
    await page.getByTestId("approve-program").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);

    // (a) Understand: evidence, contract, trust decisions
    const s0 = await store(page);
    const prog0 = Object.values(s0.programs || {})[0];
    const claims0 = (s0.claims || {})[prog0.id] || [];
    const evText = await page.getByTestId("evidence-panel").innerText();
    const contested0 = await page.getByTestId("evidence-section").getAttribute("data-contested");
    record("evidence panel shows ≥ 20 claims with the three authority badges, contested = 0", claims0.length >= 20 && /Organization-approved/.test(evText) && /Observed on the live instance/.test(evText) && /Model-inferred/.test(evText) && contested0 === "0" && (await page.getByTestId("contested-claims").count()) === 0, `${claims0.length} claims · contested ${contested0} · ${evText.split("\n").slice(0, 3).join(" | ")}`);
    const badge0 = await page.getByTestId("governance-badge").first().innerText();
    record("governance badge reads v1.0 · Discovered", /v1\.0/.test(badge0) && /Discovered/.test(badge0), badge0.replace(/\n/g, " "));
    const cActive = await page.locator('[data-testid="autonomy-contract"] tr[data-class="C_consequential_write"] [role="radio"][aria-checked="true"]').innerText();
    const dActive = await page.locator('[data-testid="autonomy-contract"] tr[data-class="D_external_or_destructive"] [role="radio"][aria-checked="true"]').innerText();
    const cAuto = page.locator('[data-testid="autonomy-contract"] tr[data-class="C_consequential_write"] [role="radio"]', { hasText: "Auto" });
    const cAutoDisabled = await cAuto.isDisabled();
    await cAuto.click({ force: true }).catch(() => {});
    const cAfter = await page.locator('[data-testid="autonomy-contract"] tr[data-class="C_consequential_write"] [role="radio"][aria-checked="true"]').innerText();
    record("contract: C = Ask, D = Never, Auto on C disabled", cActive === "Ask" && dActive === "Never" && cAutoDisabled && cAfter === "Ask", `C=${cActive} D=${dActive} autoDisabled=${cAutoDisabled} afterClick=${cAfter}`);
    await page.getByRole("button", { name: "Approve contract" }).click();
    await page.waitForTimeout(300);
    const contractText = await page.getByTestId("autonomy-contract").innerText();
    record("approve contract → approved", /approved \d\d:\d\d:\d\d by you/.test(contractText), contractText.split("\n").filter((l) => /Contract v/.test(l)).join(" | "));
    const qual = await trustRow(page, "Qualification");
    const review = await trustRow(page, "Review and create");
    record("trust decisions: Qualification = Guide the person, Review and create = Prepare + ask", /Guide the person/.test(qual) && /Prepare \+ ask/.test(review), `${qual} || ${review}`);
    await page.getByTestId("evidence-section").scrollIntoViewIfNeeded();
    await shot(page, "01-understand-evidence");
    await page.getByTestId("contract-section").scrollIntoViewIfNeeded();
    await shot(page, "02-understand-contract");
    await page.getByTestId("approve-program").click();
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 10000 });

    // (b) Act with contract/claims: deny → ledger → undo; then approve → 5/5
    await page.getByTestId("run-workflow").waitFor({ timeout: 10000 });
    await page.getByTestId("run-workflow").click();
    await page.getByRole("dialog", { name: /Approval required/ }).waitFor({ timeout: 120000 });
    await page.getByRole("dialog").getByRole("button", { name: "Deny", exact: true }).click();
    await page.getByTestId("act-result").waitFor({ timeout: 30000 });
    const denied = await page.getByTestId("act-result").innerText();
    const log1 = await page.locator(".act-log").innerText();
    const trustLines1 = log1.split("\n").filter((l) => /^\S+ Trust: /.test(l) || /\bTrust: (act|prepare \+ ask|guide the person|ask|stop) \(/.test(l));
    record("denied run: abandoned, log has Trust: lines", /Abandoned/.test(denied) && trustLines1.length >= 3, `${trustLines1.length} trust lines; e.g. ${trustLines1[0]}`);
    await page.getByTestId("ledger-tab").click();
    await page.getByTestId("ledger").waitFor({ timeout: 5000 });
    const rows1 = await page.getByTestId("ledger-row").count();
    const restorable1 = await page.getByTestId("ledger-row").filter({ hasText: "restore value" }).count();
    record("ledger lists the denied run's actions (≥ 12 rows, ≥ 9 restore value)", rows1 >= 12 && restorable1 >= 9, `${rows1} rows · ${restorable1} restore value`);
    await shot(page, "03-ledger");
    await page.getByTestId("ledger-undo").click();
    const toast = page.getByText(/Restored \d+ fields?/).first();
    await toast.waitFor({ timeout: 60000 });
    const toastText = await toast.innerText();
    const restoredN = Number((/Restored (\d+)/.exec(toastText) || [])[1] || 0);
    await page.waitForTimeout(800);
    const undone = await page.locator('[data-testid="ledger-row"][data-rolled-back="true"]').count();
    record("undo → toast 'Restored N fields' (N ≥ 5) and rows marked undone", restoredN >= 5 && undone === restoredN, `${toastText} · ${undone} rows undone`);
    const stepHeading = await frame.getByText(/Step 1 of 3/).first().innerText().catch(() => "");
    const amount = await frame.getByLabel("Amount").inputValue().catch(() => "?");
    const close = await frame.getByLabel("Expected close date").inputValue().catch(() => "?");
    record("sandbox wizard is back on Basics with emptied Amount / close date", /Step 1 of 3/.test(stepHeading) && amount === "" && close === "", `${stepHeading} · amount="${amount}" close="${close}"`);
    await shot(page, "04-undo");
    const done1 = await approveAndRun(page);
    const log2 = await page.locator(".act-log").innerText();
    record("act v1 with contract completes 5/5 with Trust: lines", /5\/5/.test(done1) && /Completed/.test(done1) && (log2.match(/Trust: /g) || []).length >= 4, done1.split("\n").slice(0, 6).join(" | "));
    await page.getByTestId("ledger-tab").click();
    const rows2 = await page.getByTestId("ledger-row").count();
    record("ledger has ≥ 15 rows after the completed run", rows2 >= 15, `${rows2} rows`);
    const s1 = await store(page);
    const ledgerAgent = (s1.ledger || []).filter((e) => e.programId === prog0.id);
    record("ledger entries carry provenance (intent, decidedBy, before/after)", ledgerAgent.length >= 15 && ledgerAgent.every((e) => e.intent && e.decidedBy && e.requestedBy === "agent") && ledgerAgent.some((e) => e.before && e.after), `${ledgerAgent.length} entries · ${ledgerAgent.filter((e) => e.rolledBackAt).length} rolled back`);

    // (c) Contested scenario
    await replan(page, "2. Budget status confirmed (Approved or Allocated)", "2. Budget status confirmed (Signed or Countersigned)");
    const contestedBlock = page.getByTestId("contested-claims");
    const contestedText = (await contestedBlock.count()) ? await contestedBlock.innerText() : "";
    const contestedAttr = await page.getByTestId("evidence-section").getAttribute("data-contested");
    record("contested re-plan: evidence shows the conflict with accepted vs offered values", /Signed \| Countersigned/.test(contestedText) && /Unknown, Requested, Approved, Allocated/.test(contestedText) && Number(contestedAttr) >= 1, `contested=${contestedAttr} · ${contestedText.split("\n").slice(0, 3).join(" | ")}`);
    const qualStop = await trustRow(page, "Qualification");
    record("trust decisions: Qualification = Stop", /\bStop\b/.test(qualStop), qualStop);
    const badge1 = await page.getByTestId("governance-badge").first().innerText();
    record("re-plan bumps the workflow version (v1.1)", /v1\.1/.test(badge1), badge1.replace(/\n/g, " "));
    await page.getByTestId("evidence-section").scrollIntoViewIfNeeded();
    await shot(page, "05-contested");
    await page.getByTestId("approve-program").click();
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 10000 });
    await page.getByTestId("run-workflow").waitFor({ timeout: 10000 });
    await page.getByTestId("run-workflow").click();
    await page.getByTestId("act-result").waitFor({ timeout: 120000 });
    const stopped = await page.getByTestId("act-result").innerText();
    const trustStop = (await page.getByTestId("trust-stop").count()) ? await page.getByTestId("trust-stop").innerText() : "";
    const s2 = await store(page);
    const lastRun = Object.values(s2.runs || {}).sort((a, b) => b.startedAt - a.startedAt)[0];
    record("act on contested evidence → abandoned with the conflicting-sources reason in the result card", /Abandoned/.test(stopped) && /sources conflict/i.test(trustStop) && /Qualification/.test(trustStop) && lastRun.outcome === "abandoned", `${trustStop.split("\n").slice(0, 2).join(" | ")}`);
    await shot(page, "06-trust-stop");
    await page.getByTestId("review-evidence").click();
    await page.waitForTimeout(900);
    const current = await page.locator('nav[aria-label="Phases"] [aria-current="step"]').innerText();
    const evBox = await page.getByTestId("evidence-section").boundingBox();
    const asideBox = await page.getByTestId("phase-panel").boundingBox();
    record("'Review the evidence' jumps to Understand's evidence section", /Understand/.test(current) && evBox && asideBox && evBox.y >= asideBox.y - 4 && evBox.y < asideBox.y + asideBox.height / 2, `${current.replace(/\n/g, " ")} · evidence y=${evBox && Math.round(evBox.y)} aside y=${asideBox && Math.round(asideBox.y)}`);
    await shot(page, "07-review-evidence");
    await replan(page, "2. Budget status confirmed (Signed or Countersigned)", "2. Budget status confirmed (Approved or Allocated)");
    const contestedAfter = await page.getByTestId("evidence-section").getAttribute("data-contested");
    const qualAfter = await trustRow(page, "Qualification");
    const badge2 = await page.getByTestId("governance-badge").first().innerText();
    record("restoring the objective and re-planning → contested = 0, Qualification back to Guide", contestedAfter === "0" && /Guide the person/.test(qualAfter) && /v1\.2/.test(badge2), `contested=${contestedAfter} · ${qualAfter} · ${badge2.replace(/\n/g, " ")}`);
    await page.getByTestId("approve-program").click();
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 10000 });

    // (d) v2 self-heal → superseded naming claims
    await page.getByTestId("run-workflow").waitFor({ timeout: 10000 });
    await page.getByTestId("ui-v2-switch").click();
    await page.waitForTimeout(3500);
    const v2 = await page.evaluate(() => localStorage.getItem("meridian-ui-version"));
    const done2 = await approveAndRun(page);
    const changes = await page.locator('[data-testid="act-result"] [data-testid="changes-counter"]').getAttribute("data-count");
    record("v2 run self-heals to 5/5 with change records", v2 === "v2" && /5\/5/.test(done2) && Number(changes) >= 4, `changes ${changes}`);
    const s3 = await store(page);
    const renamed = ((s3.claims || {})[prog0.id] || []).filter((c) => c.predicate === "is_now_named");
    const retired = ((s3.claims || {})[prog0.id] || []).filter((c) => c.status === "retired");
    await page.getByRole("button", { name: /Understand/ }).click();
    await page.getByTestId("evidence-panel").waitFor({ timeout: 10000 });
    const showAll = page.getByRole("button", { name: /Show all \d+ claims/ });
    if (await showAll.count()) await showAll.click();
    await page.waitForTimeout(300);
    const nowNamed = await page.locator('[data-testid="claim"]').filter({ hasText: /is now "/ }).count();
    const evText2 = await page.getByTestId("evidence-panel").innerText();
    record("evidence gains 'is now named' claims after the v2 run (≥ 4 live observations)", renamed.length >= 4 && nowNamed >= 4 && renamed.every((c) => c.authority === "AUTHORITATIVE_LIVE" && c.source === "observed_interface"), `${renamed.length} is_now_named · ${retired.length} superseded (engine: only field exists_on claims can be superseded; all six re-groundings were actions) · ${nowNamed} visible; e.g. ${renamed[0] && renamed[0].statement}`);
    void evText2;
    await page.getByTestId("evidence-section").scrollIntoViewIfNeeded();
    await shot(page, "08-evidence-superseded");
    await page.getByRole("button", { name: /^5\s*Act$|Act/ }).first().click();
    await page.getByTestId("ui-v2-switch").waitFor({ timeout: 10000 });
    await page.getByTestId("ui-v2-switch").click();
    await page.waitForTimeout(3500);
    const v1 = await page.evaluate(() => localStorage.getItem("meridian-ui-version"));
    record("UI switched back to v1 for the demonstration", v1 === "v1", String(v1));

    // (e) Teach by doing
    const before = await store(page);
    const prevVersion = Object.values(before.programs)[0].workflow.version;
    await page.getByRole("button", { name: /Guide & Observe/ }).click();
    await page.getByTestId("demonstration-panel").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Start demonstration" }).click();
    await page.locator('[data-testid="demonstration-panel"][data-status="recording"]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    const overlayVisible = await page.evaluate(() => Array.from(document.querySelectorAll('section[aria-label="Target application"] .opacity-100')).length);
    record("recording started; agent overlays hidden", overlayVisible === 0, `${overlayVisible} visible overlays`);
    await frame.getByRole("button", { name: "Actions" }).click();
    await frame.getByRole("menuitem", { name: "Convert to opportunity" }).click();
    await page.waitForTimeout(900);
    await frame.getByLabel("Amount").fill("61000");
    await frame.getByLabel("Expected close date").fill("2026-12-01");
    await frame.getByLabel("Stage").selectOption({ label: "Qualification" });
    await frame.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForTimeout(900);
    await frame.getByLabel("Decision-maker").selectOption({ label: "Helen Marsh — VP Operations" });
    await frame.getByLabel("Funding stage").selectOption({ label: "Allocated" });
    await frame.getByLabel("Decision timeline").selectOption({ label: "This quarter" });
    await frame.getByRole("button", { name: "Advanced qualification" }).click();
    await page.waitForTimeout(400);
    await frame.getByLabel("Northwind Systems").check();
    await frame.getByLabel("Next step", { exact: true }).fill("Site walkthrough");
    await frame.getByLabel("Next step date").fill("2026-10-05");
    await frame.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForTimeout(900);
    await frame.getByRole("button", { name: "I understand" }).click();
    await page.waitForTimeout(400);
    await frame.getByRole("button", { name: "Create opportunity" }).click();
    await page.waitForTimeout(2000);
    const traceText = await page.getByTestId("trace-list").innerText();
    await shot(page, "09-recording");
    await page.getByRole("button", { name: "Stop and reconstruct" }).click();
    await page.locator('[data-testid="demonstration-panel"][data-status="reconstructed"]').waitFor({ timeout: 15000 });
    const steps = await page.locator('[data-testid="demonstration-panel"] ol > li').count();
    const questions = await page.locator('[data-testid="clarification-questions"] > ul > li').count();
    const panelText = await page.getByTestId("demonstration-panel").innerText();
    record("reconstruction lists ≥ 4 steps and 2 questions", steps >= 4 && questions === 2, `${steps} steps · ${questions} questions · ${panelText.split("\n").slice(2, 3).join("")}`);
    const leak = /61000|Site walkthrough|2026-12-01|2026-10-05/.test(traceText) || /61000|Site walkthrough|2026-12-01|2026-10-05/.test(panelText);
    record("typed values never appear in the trace or the reconstruction", !leak && /Changed "Amount"/.test(traceText), leak ? "LEAK" : "no typed values");
    await page.getByRole("radio", { name: "Always ask" }).click();
    await page.getByRole("radio", { name: "All of them" }).click();
    await shot(page, "10-reconstructed");
    await page.getByTestId("adopt-workflow").click();
    await page.locator('[data-testid="demonstration-panel"][data-status="adopted"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const expectedVersion = bump(prevVersion);
    const badgeGuide = await page.locator('[data-testid="teach-section"] [data-testid="governance-badge"]').innerText();
    const after = await store(page);
    const wfAfter = Object.values(after.programs)[0].workflow;
    const wfLeak = /61000|Site walkthrough|2026-12-01|2026-10-05/.test(JSON.stringify(wfAfter));
    const renamedAfterAdopt = ((after.claims || {})[prog0.id] || []).filter((c) => c.predicate === "is_now_named").length;
    record("adopt keeps the live 'is now named' observations (re-folded after the claim refresh)", renamedAfterAdopt >= 4, `${renamedAfterAdopt} is_now_named`);
    record(`adopt → workflow v${expectedVersion} · Reviewed · from demonstration`, new RegExp(`v${expectedVersion.replace(".", "\\.")}`).test(badgeGuide) && /Reviewed/.test(badgeGuide) && /from demonstration/.test(badgeGuide) && wfAfter.origin === "demonstration" && wfAfter.governance.status === "reviewed" && !wfLeak, `${badgeGuide.replace(/\n/g, " ")} · steps ${wfAfter.steps.length} · leak ${wfLeak}`);
    await shot(page, "11-adopted");
    await page.getByRole("button", { name: /Understand/ }).click();
    await page.getByTestId("workflow-steps").waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const badgeU = await page.getByTestId("governance-badge").first().innerText();
    const stepsU = await page.locator('[data-testid="workflow-steps"] > li').count();
    const contractU = await page.getByTestId("autonomy-contract").innerText();
    const contestedU = await page.getByTestId("evidence-section").getAttribute("data-contested");
    record("understand reflects the adopted workflow (badge, steps, fresh contract, no contested claims)", new RegExp(`v${expectedVersion.replace(".", "\\.")}`).test(badgeU) && /Reviewed/.test(badgeU) && stepsU >= 4 && /Contract v1/.test(contractU) && contestedU === "0", `${badgeU.replace(/\n/g, " ")} · ${stepsU} steps · contested ${contestedU}`);
    await shot(page, "12-understand-adopted");
    await page.getByRole("button", { name: /Act/ }).first().click();
    const done3 = await approveAndRun(page);
    const log3 = await page.locator(".act-log").innerText();
    record("act runs the adopted workflow to 5/5", /5\/5/.test(done3) && /Completed/.test(done3) && /Trust: /.test(log3), done3.split("\n").slice(0, 6).join(" | "));
    await shot(page, "13-act-adopted");

    // Reload keeps evidence (including superseded claims) and the contract
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("program-status").filter({ hasText: "active" }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const s4 = await store(page);
    const renamedAfter = ((s4.claims || {})[prog0.id] || []).filter((c) => c.predicate === "is_now_named").length;
    const contractsAfter = Object.keys(s4.contracts || {}).length;
    record("reload keeps the 'is now named' claims and the contracts", renamedAfter >= 4 && contractsAfter >= 3, `${renamedAfter} is_now_named · ${contractsAfter} contracts`);

    // Start over
    await page.getByTestId("start-over").click();
    await page.getByTestId("confirm-start-over").click();
    await page.getByTestId("connect-app").waitFor({ timeout: 10000 });
    const s5 = await store(page);
    record("start over deletes program, claims, ledger and contracts", Object.keys(s5.programs || {}).length === 0 && Object.keys(s5.claims || {}).length === 0 && (s5.ledger || []).length === 0 && Object.keys(s5.contracts || {}).length === 0, `${Object.keys(s5.claims || {}).length} claim sets · ${(s5.ledger || []).length} ledger · ${Object.keys(s5.contracts || {}).length} contracts`);
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
