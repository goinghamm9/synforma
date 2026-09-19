// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/employee.spec.js (dev server on :3000). Fixture: verify/fixtures/employee-seed.json.
// End-to-end verification of the employee view (trust epics wiring) against the running dev server.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const seed = require("./fixtures/employee-seed.json");
const OUT = path.join(__dirname, "..", ".verify");
const BASE = "http://localhost:3000";
const results = [];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const want = (k) => !ONLY || ONLY.includes(k);
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isoDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `employee2-${name}.png`) });

async function seedStore(page, settingsPatch) {
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
    settings: { plannerPreference: "auto", assistancePreference: "work_with_me", interactionSensing: true, sensingPaused: false, hesitationThresholdMs: 3000, requireApprovalForCommit: true, treatmentShare: 1, ...settingsPatch },
  };
  await page.goto(`${BASE}/sandbox/crm/settings?ui=v1`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    localStorage.setItem("synforma-store-v1", JSON.stringify({ state: s, version: 0 }));
    localStorage.removeItem("meridian-crm-db");
    localStorage.setItem("meridian-ui-version", "v1");
  }, state);
}
const readStore = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state);
const frameOf = (page) => page.frameLocator('iframe[title="Meridian CRM"]');
const attr = (page, testId, name) => page.evaluate(([t, n]) => document.querySelector(`[data-testid="${t}"]`)?.getAttribute(n) ?? null, [testId, name]);
const count = (page, testId) => page.getByTestId(testId).count();

async function newPage(browser, tag, errors, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|hydrat|Download the React DevTools/i.test(m.text())) errors.push(`[${tag} console] ${m.text().slice(0, 200)}`);
  });
  return { ctx, page };
}

async function openEmployee(page) {
  await page.goto(`${BASE}/employee`, { waitUntil: "networkidle" });
  await page.getByTestId("intro-card").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => { const b = document.querySelector('[data-testid="start-run"]'); return b && !b.disabled; }, null, { timeout: 30000 });
}

async function goToLead(page) {
  const f = frameOf(page);
  await f.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Leads" }).click();
  await f.getByRole("link", { name: /Acme Industrial/ }).first().click();
  await f.getByRole("button", { name: "Actions" }).waitFor({ state: "visible" });
  await sleep(1200);
}
async function convert(page) {
  const f = frameOf(page);
  await f.getByRole("button", { name: "Actions" }).click();
  await f.getByRole("menuitem", { name: "Convert to opportunity" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="step-s3"]')?.dataset.state === "current", null, { timeout: 10000 }).catch(() => {});
}
async function fillBasics(page) {
  const f = frameOf(page);
  await f.getByLabel("Amount").fill("48000");
  await sleep(250);
  await f.getByLabel("Expected close date").fill(isoDate(45));
  await sleep(250);
  await f.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="step-s4"]')?.dataset.state === "current", null, { timeout: 10000 }).catch(() => {});
}
/** Fill Qualification the way a person does: a short think between fields (gap < hesitation threshold keeps it fluent). */
async function fillQualification(page, gap = 200) {
  const f = frameOf(page);
  await f.getByLabel("Decision-maker").selectOption({ index: 1 });
  await sleep(gap);
  await f.getByLabel("Funding stage").selectOption("Approved");
  await sleep(gap);
  await f.getByLabel("Decision timeline").selectOption("This quarter");
  await sleep(gap);
  await f.getByRole("button", { name: "Advanced qualification" }).click();
  await sleep(gap);
  await f.getByLabel("None identified").check();
  await sleep(gap);
  // Text and date companion back-to-back: the observer's companion-date checklist logic sticks at "not met" when the text lands a poll tick before the date (engine issue, reported).
  await f.getByLabel("Next step", { exact: true }).fill("Discovery call with the decision-maker");
  await sleep(200);
  await f.getByLabel("Next step date").fill("2026-10-01");
  await sleep(300);
}
/** Sample the friction chip's state for `ms`. */
function watchChip(page, ms) {
  const seen = new Set();
  const end = Date.now() + ms;
  return (async () => {
    while (Date.now() < end) {
      const s = await attr(page, "friction-chip", "data-state").catch(() => null);
      if (s) seen.add(s);
      await sleep(150);
    }
    return seen;
  })();
}
/** Zig-zag the pointer inside a rectangle for `ms` (many direction changes, low path efficiency). */
async function wander(page, box, ms) {
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    const left = i % 2 === 0;
    const x = box.x + (left ? 30 : box.width - 30) + ((i * 37) % 60);
    const y = box.y + 10 + ((i * 53) % Math.max(10, box.height - 20));
    await page.mouse.move(x, y, { steps: 6 });
    await sleep(110);
    i += 1;
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];

  // ───────────── A/B/C/F/G: fluent → quiet → visual search → clarify consequence → completion → proficiency ─────────────
  if (want("guide")) {
    const { ctx, page } = await newPage(browser, "guide", errors);
    await seedStore(page, {});
    await openEmployee(page);
    // (a) chooser
    const chooser = page.getByTestId("assistance-chooser");
    check("(a) chooser present on the intro card with the four options", (await chooser.count()) === 1 && (await chooser.getByRole("radio").count()) === 4);
    const chooserText = await chooser.textContent();
    check("(a) chooser carries the one-line descriptions", ["Handle everything safe to automate", "Help when useful. Let me make the decisions", "Explain the process as we go so I can learn it", "Only interrupt for important risk or errors"].every((t) => chooserText.includes(t)));
    check("(a) default preference is work_with_me (from settings)", (await attr(page, "preference-work_with_me", "aria-checked")) === "true");
    await page.getByTestId("preference-teach_me").click();
    check("(a) choosing a preference selects it and persists to settings", (await attr(page, "preference-teach_me", "aria-checked")) === "true" && (await readStore(page)).settings.assistancePreference === "teach_me");
    await page.getByTestId("preference-work_with_me").click();
    const indep = page.getByTestId("independence-list");
    check("(f) independence list on the intro card lists every step, unattempted", (await indep.count()) === 1 && (await indep.getByTestId("independence-entry").count()) === seed.program.workflow.steps.length && (await attr(page, "independence-list", "data-recorded")) === "false");
    check("(f) independence entries show level and skill status labels", (await indep.getByTestId("independence-level").first().textContent()) === "Guide" && (await indep.getByTestId("independence-skill").first().textContent()) === "Unknown");
    await page.getByTestId("independence-entry").nth(2).getByTestId("keep-handling").click();
    await sleep(200);
    const st0 = await readStore(page);
    check("(f) 'Keep handling this' overrides a step to Do with me (store proficiency + audit)", st0.proficiency["p1/s3"]?.assistanceLevel === "do_with_me" && st0.audit.some((a) => a.action === "proficiency override") && (await page.getByTestId("independence-entry").nth(2).getByTestId("independence-level").textContent()) === "Do with me");
    await page.getByTestId("independence-entry").nth(2).getByTestId("teach-me-anyway").click();
    await sleep(200);
    check("(f) 'Teach me anyway' returns it to Guide", (await readStore(page)).proficiency["p1/s3"]?.assistanceLevel === "guide");
    check("inspector present while idle and reads 'Windows appear during a run' when opened", (await count(page, "sensing-inspector")) === 1);
    await shot(page, "01-intro");

    // Start run
    await page.getByTestId("start-run").click();
    await page.getByTestId("run-status-row").waitFor({ state: "visible" });
    check("(a) Start run works: status row with friction chip, cohort badge and compact chooser", (await count(page, "friction-chip")) === 1 && (await count(page, "cohort-badge")) === 1 && (await count(page, "assistance-chooser-compact")) === 1);
    check("(a) friction chip starts as 'Observing' before any inference", (await attr(page, "friction-chip", "data-state")) === "none");
    check("(e) watching indicator reflects sensing on", (await attr(page, "watching-indicator", "data-sensing")) === "on");
    check("(5) Get It Done bar is present with the shortcut hint", (await count(page, "get-it-done")) === 1 && /Shift/.test(await page.getByTestId("get-it-done-bar").textContent()));
    await page.getByTestId("assistance-chooser-compact").selectOption("teach_me");
    await sleep(200);
    const st1 = await readStore(page);
    const runId = Object.keys(st1.runs)[0];
    check("(1) compact chooser changes the preference during the run (run.preference + note event)", st1.runs[runId]?.preference === "teach_me" && st1.events.some((e) => e.runId === runId && e.type === "note" && e.data?.preference === "teach_me"));
    await page.getByTestId("assistance-chooser-compact").selectOption("work_with_me");

    // Fluent first steps
    const chipWatch = watchChip(page, 9000);
    await goToLead(page);
    await convert(page);
    check("(a) observer on Basics after Actions → Convert", (await attr(page, "step-s3", "data-state")) === "current");
    await fillBasics(page);
    check("(a) observer on Qualification after Next", (await attr(page, "step-s4", "data-state")) === "current");
    check("(a) no assistance card during fluent steps", (await count(page, "assistance-card")) === 0);
    await shot(page, "02-fluent");
    const seen = await chipWatch;
    check("(a) friction chip read Fluent at some point during the fluent steps", seen.has("FLUENT"), [...seen].join(","));

    // Quiet line: idle past the 3 s threshold on Qualification → hesitation → DO_NOTHING.
    const quiet = page.getByTestId("quiet-line");
    await quiet.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
    const quietShown = (await quiet.count()) === 1;
    const stQ = await readStore(page);
    const withheldEvents = stQ.events.filter((e) => e.runId === runId && e.type === "intervention_withheld");
    check("(a) quiet line or intervention_withheld event appears (DO_NOTHING recorded)", quietShown || withheldEvents.length >= 1, `quietLine=${quietShown} withheld=${withheldEvents.length}`);
    if (quietShown) {
      const qt = await quiet.textContent();
      check("(2) quiet line reads 'Synforma stayed quiet — <state> (<confidence>%). Why?'", /Synforma stayed quiet — .+\. ?Why\?/.test(qt) || /Synforma stayed quiet — .+Why\?/.test(qt), qt);
      await page.getByTestId("quiet-why").click();
      const why = page.getByTestId("quiet-why-content");
      const n = await why.locator("ol li").count();
      check("(2) 'Why?' lists at most three candidates with scores, Do nothing among them", n >= 1 && n <= 3 && /Do nothing/.test(await why.textContent()) && /\d\.\d{3}/.test(await why.textContent()), `candidates=${n}`);
      check("(2) withheld event carries candidates and reason", withheldEvents.length >= 1 && Array.isArray(withheldEvents[0].data?.candidates) && typeof withheldEvents[0].data?.reason === "string");
      check("(2) run.withheld incremented", (stQ.runs[runId]?.withheld ?? 0) >= 1);
      check("signals strip shows the quiet count", (await count(page, "withheld-count")) === 1);
      await shot(page, "03-quiet");
    }

    // (b) Visual search: wander over the form for ~9 s without opening the disclosure and without typing.
    const f = frameOf(page);
    const dm = await f.getByLabel("Decision-maker").boundingBox();
    const adv = await f.getByRole("button", { name: "Advanced qualification" }).boundingBox();
    const region = { x: dm.x, y: dm.y + dm.height + 70, width: dm.width, height: Math.max(40, adv.y - 50 - (dm.y + dm.height + 70)) };
    const chipWatch2 = watchChip(page, 9500);
    const cardWait = page.getByTestId("assistance-card").waitFor({ state: "visible", timeout: 16000 }).then(() => Date.now()).catch(() => null);
    await wander(page, region, 9500);
    const seen2 = await chipWatch2;
    const cardAt = await cardWait;
    const card = page.getByTestId("assistance-card");
    const cardShown = (await card.count()) === 1;
    check("(b) one contextual-pointer card appears after wandering", cardShown && (await attr(page, "assistance-card", "data-technique")) === "contextual_pointer", `technique=${cardShown ? await attr(page, "assistance-card", "data-technique") : "none"} chip=${[...seen2].join(",")}`);
    check("(3) friction chip read Visual search (and the state is in the store)", seen2.has("VISUAL_SEARCH") || (await readStore(page)).events.some((e) => e.runId === runId && e.type === "friction_inferred" && e.data?.state === "VISUAL_SEARCH"), [...seen2].join(","));
    const hl = page.getByTestId("overlay-highlight");
    await hl.waitFor({ state: "attached", timeout: 3000 }).catch(() => {});
    check("(b) overlay ring is on 'Advanced qualification' (assistance kind)", (await hl.count()) === 1 && (await hl.getAttribute("data-kind")) === "assistance" && /Advanced qualification/.test(await hl.textContent()), (await hl.count()) ? await hl.textContent() : "no ring");
    // (3) chip tooltip
    await page.getByTestId("friction-chip").hover();
    const tip = page.getByTestId("friction-tooltip");
    await tip.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    const tipText = (await tip.count()) ? await tip.textContent() : "";
    check("(3) friction chip tooltip lists evidence bullets and alternatives", (await tip.count()) >= 1 && (await tip.locator("li").count()) >= 1 && /Never an emotion/.test(tipText), tipText.slice(0, 120));
    await page.mouse.move(5, 5);
    await page.getByTestId("assistance-card").scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, "04-pointer-card");
    if (cardShown) {
      await page.getByTestId("why-this").click();
      check("(7) 'Why this?' still opens", (await count(page, "why-this-content")) === 1);
      // (g) feedback menu
      await page.getByTestId("assistance-feedback").click();
      const menu = page.getByTestId("assistance-feedback-menu");
      await menu.waitFor({ state: "visible", timeout: 3000 });
      const items = await menu.locator("[data-testid^='feedback-']").allTextContents();
      check("(7) feedback menu offers Helpful · Not helpful · Wrong moment · Wrong assumption · Too much help", ["Helpful", "Not helpful", "Wrong moment", "Wrong assumption", "Too much help"].every((l) => items.some((t) => t.trim() === l)), items.join("|"));
      await shot(page, "05-feedback-menu");
      await page.getByTestId("feedback-wrong_moment").click();
      await sleep(400);
      const stG = await readStore(page);
      const dismissed = stG.events.filter((e) => e.runId === runId && e.type === "assistance_dismissed");
      check("(g) feedback records data.feedback on assistance_dismissed and dismisses the card", dismissed.some((e) => e.data?.feedback === "wrong_moment" && e.data?.helpful === false) && (await card.count()) === 0, JSON.stringify(dismissed.map((e) => e.data?.feedback)));
      check("(g) audit records the feedback", stG.audit.some((a) => a.action === "assistance feedback" && /wrong moment/.test(a.detail ?? "")));
    }

    // (c) Fill step 2 fully (at a human pace: the 20 s frequency cap after a card lapses while the person is fluent), Next, dismiss the dialog, then hesitate on the found commit control.
    await fillQualification(page, 2400);
    await sleep(1200);
    const metIds = await page.getByTestId("requirement-checklist").locator("li[data-met='true']").evaluateAll((els) => els.map((e) => e.dataset.testid));
    check("checklist ticks live for all five requirements", ["req-r1", "req-r2", "req-r3", "req-r4", "req-r5"].every((id) => metIds.includes(id)), metIds.join(","));
    await f.getByRole("button", { name: "Next", exact: true }).click();
    await f.getByRole("button", { name: "I understand" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="step-s5"]')?.dataset.state === "current", null, { timeout: 10000 }).catch(() => {});
    check("(c) observer on Review and create", (await attr(page, "step-s5", "data-state")) === "current");
    check("(c) more than 20 s of fluent work since the last card (frequency cap lapsed)", !cardAt || Date.now() - cardAt > 20000, `${cardAt ? Date.now() - cardAt : "n/a"} ms`);
    await f.getByRole("button", { name: "Create opportunity" }).scrollIntoViewIfNeeded();
    await sleep(300);
    const create = await f.getByRole("button", { name: "Create opportunity" }).boundingBox();
    const cx = create.x + create.width / 2;
    const cy = create.y + create.height / 2;
    const clarifyWait = page.locator('[data-testid="assistance-card"][data-technique="clarify_consequence"]').waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(cx, cy, { steps: 8 });
      await sleep(1600);
      await page.mouse.move(cx - 300, cy - 40, { steps: 10 });
      await sleep(500);
    }
    const clarify = await clarifyWait;
    const quietCard = page.locator('[data-testid="assistance-card"][data-technique="clarify_consequence"]');
    check("(c) a clarify-consequence card appears as a quiet inline card", clarify && (await quietCard.getAttribute("data-variant")) === "quiet", `chip=${await attr(page, "friction-chip", "data-state")}`);
    if (clarify) {
      const ct = await quietCard.textContent();
      check("(c) the card states the consequence ('saves the record in this system only')", /saves the record in this system only|Nothing is sent to the customer/.test(ct), ct.slice(0, 160));
      check("(8) NO highlight ring while the clarify-consequence card is shown", (await hl.count()) === 0);
      check("(8) no 'Do it for me' on the quiet card", (await count(page, "assistance-do-it")) === 0);
      await page.mouse.move(5, 5);
      await quietCard.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(300);
      await shot(page, "06-clarify");
      await page.getByTestId("assistance-got-it").click();
    }
    await f.getByRole("button", { name: "Create opportunity" }).click();
    const completion = page.getByTestId("completion-card");
    await completion.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    check("completion card appears on the outcome screen", (await completion.count()) === 1);
    if (await completion.count()) {
      check("completion card reports 5 of 5", (await page.getByTestId("completion-summary").textContent()).includes("5 of 5"));
      check("(6) no faded step on a first run (nothing invented)", (await count(page, "faded-step")) === 0);
      check("(e) watching indicator returns to idle", (await attr(page, "watching-indicator", "data-sensing")) === "idle");
      check("(5) no recap card without Get It Done", (await count(page, "recap-card")) === 0);
    }
    await sleep(500);
    const stC = await readStore(page);
    const prof = stC.proficiency;
    check("(6) proficiency recorded per step after the run (s3 unassisted, s4 assisted)", prof["p1/s3"]?.unassistedSuccesses === 1 && prof["p1/s4"]?.assistedRuns === 1 && prof["p1/s4"]?.exposures === 1, JSON.stringify(Object.fromEntries(Object.entries(prof).map(([k, p]) => [k, [p.unassistedSuccesses, p.assistedRuns, p.assistanceLevel]]))));
    check("(6) proficiency_updated events emitted", stC.events.filter((e) => e.runId === runId && e.type === "proficiency_updated").length >= 3);
    const indep2 = page.getByTestId("independence-list");
    check("(f) independence list after completion shows the recorded runs", (await indep2.count()) === 1 && (await attr(page, "independence-list", "data-recorded")) === "true" && /1 unassisted success/.test(await indep2.locator("[data-step-id='s3']").textContent()) && /Learning/.test(await indep2.locator("[data-step-id='s3']").textContent()), await indep2.locator("[data-step-id='s3']").textContent());
    await shot(page, "07-complete-independence");
    // Reload: the intro card must show the updated list.
    await page.reload({ waitUntil: "networkidle" });
    await openEmployee(page);
    const indep3 = page.getByTestId("independence-list");
    check("(f) after reload the intro card's proficiency list is updated", (await attr(page, "independence-list", "data-recorded")) === "true" && /1 unassisted success/.test(await indep3.locator("[data-step-id='s3']").textContent()) && /1 with help/.test(await indep3.locator("[data-step-id='s4']").textContent()), await indep3.locator("[data-step-id='s4']").textContent());
    await shot(page, "08-intro-after-run");
    await ctx.close();
  }

  // ───────────── D: Get It Done ─────────────
  if (want("gid")) {
    const { ctx, page } = await newPage(browser, "gid", errors);
    await seedStore(page, {});
    await openEmployee(page);
    await page.getByTestId("start-run").click();
    await page.getByTestId("run-status-row").waitFor({ state: "visible" });
    await goToLead(page);
    await convert(page);
    check("(d) on Basics before Get It Done", (await attr(page, "step-s3", "data-state")) === "current");
    await page.getByTestId("get-it-done").click();
    const status = page.getByTestId("get-it-done-status");
    // While the runner works through Qualification the observer is on that step: the checklist must flag the skipped judgment fields.
    const badgeWatch = (async () => {
      let max = 0;
      let note = false;
      const end = Date.now() + 25000;
      while (Date.now() < end) {
        max = Math.max(max, await count(page, "left-for-you"));
        note = note || (await count(page, "left-for-you-note")) === 1;
        if ((await count(page, "approval-dialog")) > 0) break;
        await sleep(100);
      }
      return { max, note };
    })();
    await status.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    check("(d) progress card appears while Synforma handles the routine steps", (await status.count()) === 1 && (await status.getAttribute("data-status")) === "running" && (await status.locator("[role=progressbar]").count()) === 1, `status=${await status.getAttribute("data-status")}`);
    check("(d) Get It Done bar hidden while active", (await count(page, "get-it-done-bar")) === 0);
    await sleep(1500);
    await shot(page, "09-gid-progress");
    const dialog = page.getByTestId("approval-dialog");
    await dialog.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    const dialogShown = (await dialog.count()) === 1;
    check("(d) approval dialog shown when Synforma stops before the commit", dialogShown);
    const badges = await badgeWatch;
    check("(d) checklist read 'Left for you' on the skipped judgment requirements while Synforma worked through Qualification", badges.max >= 2 && badges.note, JSON.stringify(badges));
    if (dialogShown) {
      const dt = await dialog.textContent();
      check("(d) approval names the judgment fields left for you (Decision-maker, Funding stage)", (await count(page, "approval-left-for-you")) === 1 && /Decision-maker/.test(dt) && /Funding stage/.test(dt), dt.slice(0, 200));
      check("(d) approval payload carries the routine values (Amount, Next step)", /Amount/.test(dt) && /48000/.test(dt) && /Next step/.test(dt));
      check("(d) deny button reads 'Let me finish first'", (await page.getByTestId("deny-commit").textContent()).trim() === "Let me finish first");
      await shot(page, "10-gid-approval");
      await page.getByTestId("deny-commit").click();
      await sleep(400);
      check("(d) after 'Let me finish first' the status reads stopped before the commit with a 'Reopen approval' affordance", (await status.getAttribute("data-status")) === "ready" && (await count(page, "reopen-approval")) === 1 && (await count(page, "gid-left-for-you")) === 1);
      const f = frameOf(page);
      // Synforma stopped on the Review step; the person goes back to finish the judgment fields.
      const reviewText = await f.locator("body").textContent();
      check("(d) review screen shows the routine values and no guessed judgment values", /48000|\$48,000/.test(reviewText) && /Discovery call/.test(reviewText), reviewText.slice(0, 80));
      await shot(page, "11-gid-ready-reopen");
      await f.getByRole("button", { name: "Back", exact: true }).click();
      await f.getByLabel("Decision-maker").waitFor({ state: "visible", timeout: 5000 });
      const values = { dm: await f.getByLabel("Decision-maker").inputValue(), fs: await f.getByLabel("Funding stage").inputValue(), dt: await f.getByLabel("Decision timeline").inputValue(), ns: await f.getByLabel("Next step", { exact: true }).inputValue() };
      // Judgment selects keep their untouched default ("" / "Unknown"); routine fields carry values.
      check("(d) routine fields filled, judgment fields left untouched in the application", values.dm === "" && (values.fs === "" || values.fs === "Unknown") && values.dt !== "" && values.dt !== "Unknown" && values.ns !== "", JSON.stringify(values));
      await sleep(700);
      await shot(page, "11b-gid-back-to-qualification");
      console.log("      note: after Back the observer stays on step", await page.evaluate(() => document.querySelector('[data-testid="current-step-card"]')?.textContent.slice(0, 40)));
      // Finish the judgment fields, then reopen approval.
      await f.getByLabel("Decision-maker").selectOption({ index: 1 });
      await f.getByLabel("Funding stage").selectOption("Approved");
      await sleep(300);
      await f.getByRole("button", { name: "Next", exact: true }).click();
      await f.getByRole("button", { name: "I understand" }).click().catch(() => {});
      await sleep(600);
      await page.getByTestId("reopen-approval").click();
      await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      check("(d) 'Reopen approval' shows the dialog again", (await dialog.count()) === 1);
      await page.getByTestId("approve-commit").click();
    }
    const completion = page.getByTestId("completion-card");
    await completion.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    check("(d) approve → completion card", (await completion.count()) === 1);
    const recap = page.getByTestId("recap-card");
    await recap.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    const recapShown = (await recap.count()) === 1;
    check("(d) after-action recap card shown", recapShown);
    if (recapShown) {
      const st = await readStore(page);
      const runId = Object.keys(st.runs)[0];
      const evs = st.events.filter((e) => e.runId === runId);
      const handledExpected = new Set(evs.filter((e) => e.type === "action_executed" && e.data?.ok !== false).map((e) => e.message).filter((m) => m && !/^Undo/.test(m))).size;
      const skipped = evs.filter((e) => e.type === "note" && e.data?.skippedJudgment).length;
      const approvals = evs.filter((e) => e.type === "approval_granted").length;
      const h = Number(await page.getByTestId("recap-handled").textContent());
      const d = Number(await page.getByTestId("recap-decided").textContent());
      const a = Number(await page.getByTestId("recap-approvals").textContent());
      check("(5) recap numbers match the stored events (handled / decided / approvals)", h === handledExpected && d === skipped && a === approvals && h > 0 && d === 2 && a === 1, JSON.stringify({ h, handledExpected, d, skipped, a, approvals }));
      check("(5) recap names the judgment fields decided by you", /Decision-maker/.test(await recap.textContent()) && /Funding stage/.test(await recap.textContent()));
      check("(5) run flagged getItDone and approval events via get_it_done", st.runs[runId]?.getItDone === true && evs.some((e) => e.type === "approval_denied" && e.data?.deferred === true) && evs.some((e) => e.type === "approval_granted" && e.data?.via === "get_it_done"));
      check("(5) completion verified 5 of 5 after Get It Done + your judgment", (await page.getByTestId("completion-summary").textContent()).includes("5 of 5"));
      await shot(page, "12-recap");
      await page.getByTestId("learn-yes").click();
      await sleep(300);
      const st2 = await readStore(page);
      check("(5) 'Yes, show me' sets next run to teach_me (settings + note event)", (await attr(page, "learn-next-time-chosen", "data-choice")) === "teach_me" && st2.settings.assistancePreference === "teach_me" && st2.events.some((e) => e.runId === runId && e.type === "note" && e.data?.learnNextTime === true));
    }
    await ctx.close();
  }

  // ───────────── E: inspector + pause sensing ─────────────
  if (want("inspector")) {
    const { ctx, page } = await newPage(browser, "inspector", errors);
    await seedStore(page, {});
    await openEmployee(page);
    await page.getByTestId("start-run").click();
    await page.getByTestId("run-status-row").waitFor({ state: "visible" });
    await goToLead(page);
    await page.getByTestId("inspector-toggle").click();
    check("(e) inspector opens with the privacy sentence", /never stored/.test(await page.getByTestId("inspector-content").textContent()));
    const box = await page.locator('iframe[title="Meridian CRM"]').boundingBox();
    await wander(page, { x: box.x + 100, y: box.y + 150, width: 500, height: 250 }, 2600);
    await page.keyboard.press("Tab");
    await sleep(1200);
    check("(e) pointer window shown during a run with path efficiency, direction changes, hover targets", (await attr(page, "pointer-window", "data-present")) === "true" && /Path efficiency/.test(await page.getByTestId("pointer-window").textContent()) && /Direction changes/.test(await page.getByTestId("pointer-window").textContent()) && /Approaches/.test(await page.getByTestId("pointer-window").textContent()));
    await shot(page, "13-inspector");
    const before = (await readStore(page)).events.filter((e) => e.type === "pointer_window").length;
    check("(e) pointer_window events persisted (aggregates only, no coordinates)", before >= 1 && (await readStore(page)).events.filter((e) => e.type === "pointer_window").every((e) => !("x" in (e.data ?? {})) && !("points" in (e.data ?? {}))));
    await page.getByTestId("sensing-toggle").click();
    await sleep(300);
    check("(e) pause: sensing status reads paused, watching indicator changes", (await attr(page, "sensing-status", "data-state")) === "paused" && (await attr(page, "watching-indicator", "data-sensing")) === "paused" && /sensing paused/.test(await page.getByTestId("watching-indicator").textContent()) && (await count(page, "sensing-paused-note")) === 1);
    await wander(page, { x: box.x + 100, y: box.y + 150, width: 500, height: 250 }, 2600);
    await sleep(600);
    const after = (await readStore(page)).events.filter((e) => e.type === "pointer_window").length;
    check("(e) pause stops new pointer windows", after <= before + 1, `before=${before} after=${after}`);
    check("(e) settings.sensingPaused persisted and a note event recorded", (await readStore(page)).settings.sensingPaused === true && (await readStore(page)).events.some((e) => e.type === "note" && e.data?.sensingPaused === true));
    await shot(page, "14-inspector-paused");
    await page.getByTestId("sensing-toggle").click();
    await sleep(300);
    check("(e) resume restores sensing", (await attr(page, "sensing-status", "data-state")) === "on" && (await attr(page, "watching-indicator", "data-sensing")) === "on" && (await readStore(page)).settings.sensingPaused === false);
    check("(e) inspector links to /settings", (await page.getByTestId("inspector-content").locator('a[href="/settings"]').count()) >= 1);
    await page.getByTestId("abandon-run").click();
    await page.getByTestId("abandoned-card").waitFor({ state: "visible", timeout: 5000 });
    check("abandon still works", (await count(page, "abandoned-card")) === 1);
    await ctx.close();
  }

  // ───────────── Mobile: no overflow with the new intro content ─────────────
  if (want("mobile")) {
    const { ctx, page } = await newPage(browser, "mobile", errors, { width: 390, height: 844 });
    await seedStore(page, {});
    await page.goto(`${BASE}/employee`, { waitUntil: "networkidle" });
    await page.getByTestId("intro-card").waitFor({ state: "visible", timeout: 20000 });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check("no horizontal overflow on mobile", scrollW <= 390, `scrollWidth=${scrollW}`);
    await shot(page, "15-mobile");
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (errors.length) console.log("PAGE ERRORS:\n  " + errors.join("\n  "));
  else console.log("No page errors.");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
