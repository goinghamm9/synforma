// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/employee-guide.spec.js (dev server on :3000). Fixture: verify/fixtures/employee-seed.json.
// Supplementary employee-view checks for the use-guide-run split (run alongside ../employee2/e2e.js).
// Covers what that script does not: planner badge, step-kind overlay ring on the current step,
// assist completing a step, hesitation -> recorded decision, and the approve path of Get It Done.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const seed = require("./fixtures/employee-seed.json");
const OUT = path.join(__dirname, "..", ".verify");
const BASE = "http://localhost:3000";
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

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
const readStore = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state);
const frameOf = (page) => page.frameLocator('iframe[title="Meridian CRM"]');
const attr = (page, testId, name) => page.evaluate(([t, n]) => document.querySelector(`[data-testid="${t}"]`)?.getAttribute(n) ?? null, [testId, name]);
const count = (page, testId) => page.getByTestId(testId).count();
const stepState = (page, id) => attr(page, `step-${id}`, "data-state");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });

  await seedStore(page);
  await page.goto(`${BASE}/employee`, { waitUntil: "networkidle" });
  await page.getByTestId("intro-card").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => { const b = document.querySelector('[data-testid="start-run"]'); return b && !b.disabled; }, null, { timeout: 30000 });
  check("page loads with the intro card and an enabled Start button", (await count(page, "intro-card")) === 1);
  check("no console or page errors on load", pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].join(" | "));
  const badge = page.getByTestId("planner-badge");
  await badge.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  const badgeText = (await badge.count()) ? (await badge.first().textContent()).trim() : "";
  check("planner badge renders with a label", (await badge.count()) >= 1 && badgeText.length > 0, badgeText);
  await shot(page, "01-intro");

  // Start
  await page.getByTestId("start-run").click();
  await page.getByTestId("run-status-row").waitFor({ state: "visible", timeout: 10000 });
  const st0 = await readStore(page);
  const runId = Object.keys(st0.runs)[0];
  check("Start guide run: a run exists with a run_started event", Boolean(runId) && st0.events.some((e) => e.runId === runId && e.type === "run_started"), runId);
  check("run status row shown during the run (planner badge belongs to the idle panel only)", (await count(page, "run-status-row")) === 1);

  // Navigate to the lead: step 1 completes on the lead record and the ring moves to the current step's control.
  const f = frameOf(page);
  await f.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Leads" }).click();
  await f.getByRole("link", { name: /Acme Industrial/ }).first().click();
  await f.getByRole("button", { name: "Actions" }).waitFor({ state: "visible" });
  const hl = page.getByTestId("overlay-highlight");
  await hl.waitFor({ state: "attached", timeout: 8000 }).catch(() => {});
  const hlKind = (await hl.count()) ? await hl.getAttribute("data-kind") : null;
  const hlText = (await hl.count()) ? (await hl.textContent()).trim() : "";
  check("overlay ring (step kind) highlights the current step's control on the lead record", hlKind === "step" && hlText.length > 0, `kind=${hlKind} label=${hlText} s1=${await stepState(page, "s1")} s2=${await stepState(page, "s2")}`);
  check("step 1 (open the lead record) is behind the person once the lead record is open (done or passed)", ["done", "passed"].includes(await stepState(page, "s1")), await stepState(page, "s1"));
  await shot(page, "02-lead-ring");

  // Convert: Basics becomes current.
  await f.getByRole("button", { name: "Actions" }).click();
  await f.getByRole("menuitem", { name: "Convert to opportunity" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="step-s3"]')?.dataset.state === "current", null, { timeout: 10000 }).catch(() => {});
  check("observer on Basics after Actions → Convert", (await stepState(page, "s3")) === "current", await stepState(page, "s3"));

  // Assist: Synforma does Basics (mode assist -> "Do this step for me" is offered).
  const assistBtn = page.getByTestId("assist-step");
  await assistBtn.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("'Do this step for me' offered on the assist-mode step", (await assistBtn.count()) === 1);
  await assistBtn.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="assist-step"]')?.hasAttribute("disabled"), null, { timeout: 3000 }).catch(() => {});
  const cursorSeen = (async () => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if ((await count(page, "overlay-cursor")) > 0) return true;
      if ((await stepState(page, "s3")) === "done") return false;
      await sleep(80);
    }
    return false;
  })();
  await page.waitForFunction(() => document.querySelector('[data-testid="step-s3"]')?.dataset.state === "done", null, { timeout: 25000 }).catch(() => {});
  const sawCursor = await cursorSeen;
  await page.waitForFunction(() => document.querySelector('[data-testid="step-s4"]')?.dataset.state === "current", null, { timeout: 10000 }).catch(() => {});
  // The observer marks the step done from the page before the runner resolves: wait for the assist_completed record.
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state?.events ?? []).some((e) => e.type === "assist_completed" && e.stepId === "s3"), null, { timeout: 15000 }).catch(() => {});
  const stA = await readStore(page);
  const assistEvents = stA.events.filter((e) => e.runId === runId && e.stepId === "s3" && (e.type === "assist_requested" || e.type === "assist_completed"));
  check("assist completes the step (s3 done, s4 current)", (await stepState(page, "s3")) === "done" && (await stepState(page, "s4")) === "current", `s3=${await stepState(page, "s3")} s4=${await stepState(page, "s4")}`);
  check("assist recorded: assist_requested + assist_completed(completed) via assist, audit entries", assistEvents.some((e) => e.type === "assist_requested" && e.data?.via === "assist") && assistEvents.some((e) => e.type === "assist_completed" && e.data?.outcome === "completed") && stA.audit.some((a) => a.action === "assist requested") && stA.audit.some((a) => a.action === "assist completed"), JSON.stringify(assistEvents.map((e) => [e.type, e.data?.outcome])));
  check("Synforma's cursor overlay showed while assisting", sawCursor);
  check("assist button released after the step", (await count(page, "assist-step")) === 0 || !(await page.getByTestId("assist-step").isDisabled()));
  await shot(page, "03-after-assist");

  // Typing into the sandbox advances the checklist.
  const metBefore = await page.getByTestId("requirement-checklist").locator("li[data-met='true']").count();
  await f.getByLabel("Decision-maker").selectOption({ index: 1 });
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="requirement-checklist"] li[data-met="true"]').length > n, metBefore, { timeout: 5000 }).catch(() => {});
  const metAfter = await page.getByTestId("requirement-checklist").locator("li[data-met='true']").count();
  check("typing into the sandbox iframe advances the checklist", metAfter > metBefore, `${metBefore} -> ${metAfter}`);

  // Hesitation: idle past the threshold on Qualification -> a struggle signal and a recorded decision (quiet line or card).
  await page.mouse.move(5, 5);
  await sleep(4800);
  const quietShown = (await count(page, "quiet-line")) === 1;
  const cardShown = (await count(page, "assistance-card")) === 1;
  const stH = await readStore(page);
  const hesitations = stH.signals.filter((s) => s.runId === runId && s.stepId === "s4");
  const decided = stH.events.filter((e) => e.runId === runId && e.stepId === "s4" && (e.type === "intervention_withheld" || e.type === "assistance_shown"));
  check("hesitation produces a struggle signal and a recorded decision (quiet or shown)", hesitations.length >= 1 && decided.length >= 1 && (quietShown || cardShown), `signals=${hesitations.length} decided=${decided.map((e) => e.type).join(",")} quiet=${quietShown} card=${cardShown}`);
  await shot(page, "04-hesitation");
  if (cardShown) {
    await page.getByTestId("assistance-got-it").click();
    await sleep(300);
    check("dismissing the card records assistance_dismissed", (await readStore(page)).events.some((e) => e.runId === runId && e.type === "assistance_dismissed"));
  }

  // Get It Done from Qualification: routine steps, stop before the commit, approve, commit, complete.
  await page.getByTestId("get-it-done").click();
  const status = page.getByTestId("get-it-done-status");
  await status.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("Get It Done: progress card shows running", (await status.count()) === 1 && (await status.getAttribute("data-status")) === "running", await status.getAttribute("data-status"));
  const dialog = page.getByTestId("approval-dialog");
  await dialog.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  const dialogShown = (await dialog.count()) === 1;
  const stG = await readStore(page);
  check("Get It Done stops before the commit and asks for approval", dialogShown && stG.audit.some((a) => a.action === "get it done stopped before commit") && stG.events.some((e) => e.runId === runId && e.type === "approval_requested" && e.data?.via === "get_it_done"), `dialog=${dialogShown}`);
  check("no commit before approval (no 'get it done committed' audit yet)", !stG.audit.some((a) => a.action === "get it done committed"));
  check("routine steps handled were recorded (assist_completed via get_it_done)", stG.events.some((e) => e.runId === runId && e.type === "assist_completed" && e.data?.via === "get_it_done" && e.data?.outcome === "completed"));
  await shot(page, "05-gid-approval");
  if (dialogShown) await page.getByTestId("approve-commit").click();
  const completion = page.getByTestId("completion-card");
  await completion.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const stC = await readStore(page);
  const run = stC.runs[runId];
  check("approval commits: 'get it done committed' audit + approval_granted via get_it_done", stC.audit.some((a) => a.action === "get it done committed") && stC.events.some((e) => e.runId === runId && e.type === "approval_granted" && e.data?.via === "get_it_done"));
  check("run completes: completion card, run.outcome completed, run_completed event, proficiency updated", (await completion.count()) === 1 && run?.outcome === "completed" && stC.events.some((e) => e.runId === runId && e.type === "run_completed") && stC.events.some((e) => e.runId === runId && e.type === "proficiency_updated"), `outcome=${run?.outcome}`);
  check("recap card shown after Get It Done", (await count(page, "recap-card")) === 1);
  check("planner badge renders after completion", (await count(page, "planner-badge")) >= 1);
  await shot(page, "06-complete");

  // Start another run from the completion card, then abandon it.
  const again = page.getByRole("button", { name: /another run/i });
  if (await again.count()) {
    await again.first().click();
    await page.getByTestId("run-status-row").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const st2 = await readStore(page);
    check("'Start another run' starts a second run", Object.keys(st2.runs).length === 2 && (await count(page, "run-status-row")) === 1, `runs=${Object.keys(st2.runs).length}`);
    await page.getByTestId("abandon-run").click();
    await page.getByTestId("abandoned-card").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const st3 = await readStore(page);
    check("abandon records run_abandoned and the abandoned card", (await count(page, "abandoned-card")) === 1 && Object.values(st3.runs).some((r) => r.outcome === "abandoned") && st3.events.some((e) => e.type === "run_abandoned"));
  } else {
    check("'Start another run' control present on the completion card", false, "button not found");
  }

  check("zero console errors during the whole run", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("zero page errors during the whole run", pageErrors.length === 0, pageErrors.join(" | "));

  await ctx.close();
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
