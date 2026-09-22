// The decision model end to end (server on :3000; a production build for the honest numbers).
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/decider-browser.spec.js
// Part A uses the real routes with no credentials: status, 503, 400 and the Settings section.
// Part B serves a stand-in Jev from the browser (verify/fixtures/jev-mock.js): the Settings section and its probe,
// the harness acting on a confident choice for a control renamed beyond the rules' reach, and the Lumen Workspace
// demo on both UI versions with the decision counters in the result card and the audit.
const { chromium } = require("playwright");
const { mockJev } = require("./fixtures/jev-mock");
const BASE = process.env.BASE_URL || "http://localhost:3000";
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failed += 1; };
const validBody = { state: "Screen X. Looking for \"Funding stage\".", questions: { field: { type: "choice", instructions: "Which?", criteria: { f1: "\"Budget confirmation\" (combobox)", none_of_these: "none" } } } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  // ── A. Real routes, no credentials ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const status = await (await page.request.get(`${BASE}/api/decide/status`)).json();
    check("A status: not configured", status.configured === false && status.provider === "none", JSON.stringify(status));
    const probe = await (await page.request.get(`${BASE}/api/decide/status?probe=1`)).json();
    check("A status?probe=1 without credentials: probe not ok, says why", probe.probe && probe.probe.ok === false && /no decision provider/.test(probe.probe.detail), JSON.stringify(probe.probe));
    const r503 = await page.request.post(`${BASE}/api/decide`, { data: validBody });
    check("A POST valid → 503 (no provider)", r503.status() === 503, String(r503.status()));
    const r400 = await page.request.post(`${BASE}/api/decide`, { headers: { "content-type": "application/json" }, data: "{not json" });
    check("A POST malformed JSON → 400", r400.status() === 400, String(r400.status()));
    const r400b = await page.request.post(`${BASE}/api/decide`, { data: { state: "x", questions: { field: { type: "choice", criteria: { only: "one option" } } } } });
    const j400b = await r400b.json();
    check("A POST invalid question → 400 with issues", r400b.status() === 400 && Array.isArray(j400b.issues), JSON.stringify(j400b).slice(0, 120));
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    const st = page.locator('[data-testid="decisions-status"]');
    await st.waitFor({ timeout: 20000 });
    check("A settings: Decisions section says no decision model", (await st.getAttribute("data-configured")) === "false" && /No decision model/.test(await st.innerText()));
    check("A settings: no probe button without credentials", (await page.locator('[data-testid="decisions-probe"]').count()) === 0);
    await context.close();
  }

  // ── B. Stand-in Jev served from the browser ──
  {
    const log = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await mockJev(context, { "Deal deadline": "Expected close date" }, log);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));

    // Settings: status, probe, preference.
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    const st = page.locator('[data-testid="decisions-status"]');
    await st.waitFor({ timeout: 20000 });
    check("B settings: configured with the full label", (await st.getAttribute("data-configured")) === "true" && /Jev · Cloudflare Workers AI · typesafe\/jev/.test(await st.innerText()), (await st.innerText()).slice(0, 80));
    await page.locator('[data-testid="decisions-probe"]').click();
    const pr = page.locator('[data-testid="decisions-probe-result"]');
    await pr.waitFor({ timeout: 10000 });
    check("B settings: the probe reports the answer, latency and route", (await pr.getAttribute("data-ok")) === "true" && /180 ms/.test(await pr.innerText()) && /catalog/.test(await pr.innerText()) && /expected answer/.test(await pr.innerText()), (await pr.innerText()).slice(0, 120));
    await page.getByLabel("Off", { exact: false }).first().check();
    check("B settings: Off → effective 'lexical rules only (by preference)'", /lexical rules only \(by preference\)/.test(await page.locator("#decisions").innerText()));
    await page.getByLabel("Automatic", { exact: false }).last().check();

    // Harness: a control renamed beyond the rules' reach is placed by the stand-in and filled.
    await page.goto(`${BASE}/dev/engine?target=crm`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__synforma), null, { timeout: 60000 });
    await page.evaluate(async () => { await window.__synforma.driver.goto("/sandbox/crm/settings?ui=v1"); localStorage.removeItem("meridian-crm-db"); });
    await page.evaluate(() => window.__synforma.discover());
    const plan = await page.evaluate(() => window.__synforma.plan());
    const renamedAction = plan.workflow.steps.flatMap((s) => s.actions).find((a) => a.targetName === "Expected close date");
    check("B harness: the CRM plan fills 'Expected close date'", Boolean(renamedAction));
    const harness = await page.evaluate(async () => {
      const wf = JSON.parse(JSON.stringify(window.__synforma.workflow));
      for (const s of wf.steps) for (const a of s.actions) if (a.targetName === "Expected close date") { a.targetName = "Deal deadline"; a.target = "textbox:deal-deadline-gone"; }
      const r = await window.__synforma.act(window.__synforma.defaultContext(), true, { workflowOverride: wf });
      return {
        outcome: r.result.outcome, met: r.result.requirementsMet.length, decisions: r.result.decisions, regroundings: r.result.regroundings,
        decision: r.events.filter((e) => e.type === "decision").map((e) => e.message),
        regrounded: r.events.filter((e) => e.type === "action_regrounded" && e.data && e.data.decidedBy).map((e) => e.message),
        ledger: r.ledger.filter((e) => e.action && e.action.targetName === "Deal deadline").map((e) => ({ regrounded: e.regrounded, key: e.after && e.after.key, value: e.after && e.after.value })),
      };
    });
    check("B harness: the run completes with every requirement", harness.outcome === "completed" && harness.met === 5, JSON.stringify({ outcome: harness.outcome, met: harness.met }));
    check("B harness: the stand-in placed 'Deal deadline' on 'Expected close date' and the runner used it", harness.decisions.asked >= 1 && harness.decisions.accepted >= 1 && harness.regrounded.some((m) => /"Deal deadline" → "Expected close date" \(decided by Jev, p 0\.92\)/.test(m)), harness.regrounded.join(" | "));
    check("B harness: the ledger entry is flagged re-grounded and the date landed in the placed field", harness.ledger.length === 1 && harness.ledger[0].regrounded === true && /close/i.test(harness.ledger[0].key || "") && /^\d{4}-\d{2}-\d{2}$/.test(harness.ledger[0].value || ""), JSON.stringify(harness.ledger));
    console.log("  harness decisions: " + harness.decision.join(" | "));
    const rulesOnly = await page.evaluate(async () => {
      const wf = JSON.parse(JSON.stringify(window.__synforma.workflow));
      for (const s of wf.steps) for (const a of s.actions) if (a.targetName === "Expected close date") { a.targetName = "Deal deadline"; a.target = "textbox:deal-deadline-gone"; }
      const r = await window.__synforma.act(window.__synforma.defaultContext(), true, { workflowOverride: wf, noDecider: true });
      return { decisions: r.result.decisions, failed: r.events.filter((e) => e.type === "action_failed").map((e) => e.message) };
    });
    check("B harness: without the model the same rename is a failed fill (rules alone cannot place it)", rulesOnly.decisions.asked === 0 && rulesOnly.failed.some((m) => /Deal deadline/.test(m)), rulesOnly.failed.join(" | "));

    // Simple view on the Lumen Workspace: both UI versions with the stand-in answering "none" wherever the rules were unsure.
    const before = log.length;
    await page.goto(`${BASE}/demo?target=assistant`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Discover and plan/i }).waitFor({ timeout: 45000 });
    await page.getByRole("button", { name: /Discover and plan/i }).click();
    // The Run button is on the page from the start (disabled while the engine is busy): wait for the plan itself.
    const planned = page.locator('[data-testid="simple-progress"][data-stage="planned"]');
    await planned.waitFor({ timeout: 180000 });
    check("B demo: the plan line names the decision model", /decisions by Jev/.test(await planned.innerText()), (await planned.innerText()).slice(0, 120));
    const runAndRead = async (label) => {
      await page.getByRole("button", { name: label }).click();
      const approve = page.getByRole("button", { name: "Approve", exact: true });
      await approve.waitFor({ timeout: 180000 });
      await approve.click();
      await page.locator('[data-testid="simple-result"][data-outcome]').waitFor({ timeout: 180000 });
      const card = page.locator('[data-testid="simple-result"]');
      const dec = card.locator('[data-testid="simple-decisions"]');
      return { outcome: await card.getAttribute("data-outcome"), text: (await card.innerText()).replace(/\s+/g, " "), asked: (await dec.count()) ? Number(await dec.getAttribute("data-asked")) : 0, accepted: (await dec.count()) ? Number(await dec.getAttribute("data-accepted")) : 0 };
    };
    const v1 = await runAndRead(/^Run it/i);
    check("B demo v1: completed 5/5", v1.outcome === "completed" && /5\/5/.test(v1.text), v1.text.slice(0, 100));
    await page.getByRole("button", { name: /Vendor update/i }).click();
    await page.getByTestId("simple-ui-variant").waitFor({ timeout: 15000 });
    await page.waitForTimeout(2500);
    const v2 = await runAndRead(/^Run again/i);
    check("B demo v2: completed 5/5 with the stand-in answering", v2.outcome === "completed" && /5\/5/.test(v2.text), v2.text.slice(0, 140));
    const demoRows = log.slice(before);
    const runnerRows = demoRows.filter((l) => l.question === "field" || l.question === "control");
    const discoveryRows = demoRows.filter((l) => /^c\d+$/.test(l.question));
    const planningRows = demoRows.filter((l) => l.question === "mapping" || /^q\d+$/.test(l.question));
    console.log(`  demo: ${runnerRows.length} run question(s) across both runs, ${discoveryRows.length} menu items assessed during discovery, ${planningRows.length} planning questions; v2 card ${v2.asked ? `${v2.accepted}/${v2.asked} used` : "no decision counter"}; run answers: ${runnerRows.map((l) => `${l.expected} → ${l.chosen ?? "none"} (${l.options} options)`).join(" | ") || "none asked"}`);
    check("B demo v2: the card's decision counter matches the run questions the stand-in received", v2.asked === runnerRows.length - (v1.asked || 0), `card ${v2.accepted}/${v2.asked}, stand-in ${runnerRows.length} (v1 ${v1.asked})`);
    check("B demo: planning asked the judgment question for every field requirement", planningRows.filter((l) => /^q\d+$/.test(l.question)).length === 5, `${planningRows.length} planning rows`);
    const store = await page.evaluate(() => JSON.parse(localStorage.getItem("synforma-store-v1") || "{}").state || {});
    const decisionEvents = (store.events || []).filter((e) => e.type === "decision");
    const auditRows = (store.audit || []).filter((a) => /Decision by Jev|Jev unavailable/.test(a.action));
    check("B demo: every run question is a decision event and an audit row", decisionEvents.length === runnerRows.length && auditRows.length === runnerRows.length, `events ${decisionEvents.length}, audit ${auditRows.length}, asked ${runnerRows.length}`);
    const planAudit = (store.audit || []).find((a) => /planner/.test(a.detail || "") && /Jev/.test(a.detail || ""));
    const discoveryAudit = (store.audit || []).find((a) => a.action === "Discovery completed");
    check("B demo: the audit names the model's part in discovery and planning", Boolean(discoveryAudit) && (discoveryRows.length === 0 || /Jev assessed/.test(discoveryAudit.detail || "")) && (planningRows.length === 0 || Boolean(planAudit)), `${discoveryAudit ? discoveryAudit.detail : "no discovery audit"} | ${planAudit ? planAudit.detail : "no plan audit with Jev"}`);
    check("B demo: the audit says the run's decisions came from Jev", (store.audit || []).some((a) => a.action === "Run started" && /decisions by Jev/.test(a.detail || "")));
    if (errors.length) console.log("  page errors: " + errors.join(" | "));
    check("B: no page errors", errors.length === 0);
    await context.close();
  }

  // ── C. Discovery, planning and navigation decisions on the CRM (harness, stand-in) ──
  {
    const log = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await mockJev(context, { "Lead tools": "Actions", "Promote": "Convert to opportunity", "When they expect to buy, noted (not Unknown)": "Decision timeline", __commit: ["Mark as nurturing"] }, log);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
    await page.goto(`${BASE}/dev/engine?target=crm`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__synforma), null, { timeout: 60000 });
    await page.evaluate(async () => { await window.__synforma.driver.goto("/sandbox/crm/settings?ui=v1"); localStorage.removeItem("meridian-crm-db"); });
    const disc = await page.evaluate(async () => {
      const r = await window.__synforma.discover();
      const g = window.__synforma.graph;
      const items = g.nodes.filter((n) => n.type === "action" && n.data && n.data.menu === "Actions").map((n) => ({ label: n.label, commit: n.data.commit, p: n.data.commitProbability, by: n.data.decidedBy, confidence: n.confidence }));
      return { stats: r.stats, items, logs: r.logs.filter((l) => /Jev/.test(l)), screens: r.states.length };
    });
    const commitRows = log.filter((l) => /^c\d+$/.test(l.question));
    check("C discovery: the items of the lead's Actions menu were put to the model before any was tried", disc.stats.decisions.asked === 3 && commitRows.length === 3 && commitRows.every((l) => /Convert to opportunity|Mark as nurturing|Assign owner/.test(l.expected)), JSON.stringify({ decisions: disc.stats.decisions, rows: commitRows.map((l) => `${l.expected} ${l.noul}`) }));
    const nurturing = disc.items.find((i) => i.label === "Mark as nurturing");
    const convert = disc.items.find((i) => i.label === "Convert to opportunity");
    check("C discovery: the item the stand-in marked (p 0.97) is a commit in the Work Graph with that confidence and was not tried", disc.stats.decisions.commits === 1 && nurturing && nurturing.commit === true && nurturing.p === 0.97 && nurturing.by === "Jev" && nurturing.confidence === 0.97 && !disc.logs.some((l) => /Mark as nurturing.*revealed|Actions → Mark as nurturing/.test(l)), JSON.stringify(nurturing));
    check("C discovery: an item the model cleared keeps its calibrated probability and the wizard behind it was still discovered", convert && convert.commit === false && convert.p === 0.05 && convert.confidence === 0.95 && disc.screens >= 12, JSON.stringify({ convert, screens: disc.screens }));
    check("C discovery: the log tells what was assessed and what was not tried", disc.logs.some((l) => /Jev assessed 3 items of "Actions"/.test(l) && /not tried: "Mark as nurturing" \(p 0\.97\)/.test(l)), disc.logs.join(" | ").slice(0, 200));

    const plan = await page.evaluate(async () => {
      const objective = window.__synforma.target.objective.replace("3. A decision timeline (not Unknown)", "3. When they expect to buy, noted (not Unknown)");
      const r = await window.__synforma.plan(objective);
      const decided = r.parsed.requirements.filter((q) => q.decided);
      return { requirements: r.parsed.requirements.map((q) => ({ id: q.id, text: q.text, judgment: q.judgment, decided: q.decided })), decisions: r.decisions, steps: r.workflow.steps.length, mapped: new Set(r.workflow.steps.flatMap((s) => s.requirementIds)).size, decidedCount: decided.length, edges: window.__synforma.graph.edges.filter((e) => e.type === "fulfills" && /Jev/.test(e.label || "")).map((e) => ({ to: e.to, label: e.label, weight: e.weight })) };
    });
    const timeline = plan.requirements.find((q) => /expect to buy/.test(q.text));
    const mappingRows = log.filter((l) => l.question === "mapping");
    check("C planning: only the requirement no field matches by its words was put to the model, with candidate fields", mappingRows.length === 1 && mappingRows[0].expected === "When they expect to buy, noted (not Unknown)" && mappingRows[0].options >= 2, JSON.stringify(mappingRows));
    check("C planning: the model's choice placed it on \"Decision timeline\" (p 0.92) and the plan maps every requirement", Boolean(timeline && timeline.decided && timeline.decided.fieldName === "Decision timeline" && timeline.decided.probability === 0.92) && plan.mapped === 5 && plan.decisions.mappings.some((m) => m.accepted), JSON.stringify({ timeline: timeline && timeline.decided, mapped: plan.mapped, decisions: plan.decisions.mappings }));
    check("C planning: the fulfils edge carries the probability and the model's name", plan.edges.length === 1 && plan.edges[0].weight === 0.92 && /p 0\.92 · Jev/.test(plan.edges[0].label), JSON.stringify(plan.edges));
    const judgmentRows = log.filter((l) => /^q\d+$/.test(l.question));
    check("C planning: every field requirement got a judgment probability; the flag was only ever added", judgmentRows.length === 5 && plan.requirements.filter((q) => q.decided && typeof q.decided.judgmentProbability === "number").length === 5 && plan.decisions.judgment.every((j) => !j.applied || plan.requirements.find((q) => q.id === j.requirementId).judgment === true), JSON.stringify(plan.decisions.judgment));
    console.log(`  plan: ${plan.decisions.judgment.map((j) => `${j.requirementId} judgment p ${j.probability}${j.applied ? " (flagged)" : ""}`).join(", ")}`);

    const nav = await page.evaluate(async () => {
      const wf = JSON.parse(JSON.stringify(window.__synforma.workflow));
      for (const s of wf.steps) for (const a of s.actions) {
        if (a.targetName === "Actions" && a.kind === "click") { a.targetName = "Lead tools"; a.target = "button:lead-tools-gone"; }
        if (a.targetName === "Convert to opportunity" && a.kind === "click") { a.targetName = "Promote"; a.target = "menuitem:promote-gone"; }
      }
      const r = await window.__synforma.act(window.__synforma.defaultContext(), true, { workflowOverride: wf });
      return { outcome: r.result.outcome, met: r.result.requirementsMet.length, decisions: r.result.decisions, regrounded: r.events.filter((e) => e.type === "action_regrounded" && e.data && e.data.decidedBy).map((e) => e.message), decision: r.events.filter((e) => e.type === "decision").map((e) => e.message), planActions: wf.steps.flatMap((s) => s.actions.map((a) => `${a.kind}:${a.targetName ?? a.url ?? ""}`)), tail: r.events.slice(-10).map((e) => `${e.type}${e.stepId ? `@${e.stepId}` : ""}: ${e.message ?? ""}`) };
    });
    console.log("  navigation plan actions: " + nav.planActions.join(" | "));
    if (nav.outcome !== "completed") console.log("  navigation trail:\n   " + nav.tail.join("\n   "));
    const controlRows = log.filter((l) => l.question === "control");
    const toolsRow = controlRows.find((l) => l.expected === "Lead tools");
    const promoteRow = controlRows.find((l) => l.expected === "Promote");
    check("C navigation: the menu button the plan knew as \"Lead tools\", which the rules would guess by its role alone, was put to the model first among the screen's controls", Boolean(toolsRow && toolsRow.chosen && /"Actions"/.test(toolsRow.chosen)) && nav.decision.some((m) => /"Lead tools" is now "Actions" \(p 0\.92\) \(the rules would have guessed by role alone\)/.test(m)), JSON.stringify({ toolsRow, decisions: nav.decision }));
    check("C navigation: the menu item the plan knew as \"Promote\", which shares no word with any item, was put to the model among the menu's items", Boolean(promoteRow && promoteRow.chosen && /"Convert to opportunity"/.test(promoteRow.chosen)) && promoteRow.options === 3, JSON.stringify(promoteRow));
    check("C navigation: both decided controls were performed and the run completed with every requirement", nav.outcome === "completed" && nav.met === 5 && nav.decisions.asked === 2 && nav.decisions.accepted === 2 && nav.regrounded.some((m) => /"Lead tools" → "Actions" \(decided by Jev, p 0\.92\)/.test(m)) && nav.regrounded.some((m) => /"Promote" → "Convert to opportunity" \(decided by Jev, p 0\.92\)/.test(m)), JSON.stringify({ outcome: nav.outcome, met: nav.met, decisions: nav.decisions, regrounded: nav.regrounded }));
    console.log("  navigation decisions: " + nav.decision.join(" | "));
    const navRulesOnly = await page.evaluate(async () => {
      await window.__synforma.driver.goto("/sandbox/crm/settings?ui=v1");
      const wf = JSON.parse(JSON.stringify(window.__synforma.workflow));
      for (const s of wf.steps) for (const a of s.actions) {
        if (a.targetName === "Actions" && a.kind === "click") { a.targetName = "Lead tools"; a.target = "button:lead-tools-gone"; }
        if (a.targetName === "Convert to opportunity" && a.kind === "click") { a.targetName = "Promote"; a.target = "menuitem:promote-gone"; }
      }
      const r = await window.__synforma.act(window.__synforma.defaultContext(), true, { workflowOverride: wf, noDecider: true });
      return { outcome: r.result.outcome, decisions: r.result.decisions, failed: r.events.filter((e) => e.type === "action_failed" || e.type === "run_failed").map((e) => e.message || e.type), regrounded: r.events.filter((e) => e.type === "action_regrounded").map((e) => e.message) };
    });
    check("C navigation: without the model the rules guess \"Actions\" for \"Lead tools\" by its role alone, then fail the run at \"Promote\"", navRulesOnly.outcome === "failed" && navRulesOnly.decisions.asked === 0 && navRulesOnly.regrounded.some((m) => /^Re-grounded "Lead tools" → "Actions"$/.test(m)) && navRulesOnly.failed.some((m) => /Promote/.test(m)), JSON.stringify(navRulesOnly));
    if (errors.length) console.log("  page errors: " + errors.join(" | "));
    check("C: no page errors", errors.length === 0);
    await context.close();
  }

  console.log(failed ? `\nFAIL ${failed}` : "\nALL PASS");
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
