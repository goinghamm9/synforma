// Lumen Workspace sandbox (/sandbox/assistant): chrome and seed → v1 New project wizard by hand (name validation,
// template prefill and the custom-instructions note, knowledge source, retention, Back/Next round trip, reviewer,
// acknowledgement, Create project) → outcome page values → the two small workflows (Duplicate project, Archive
// project) → vendor update (v2 via /sandbox/assistant/settings?ui=v2: Assistants, Create assistant, Data source,
// Continue/Previous, Governance tab holding Data retention, Save assistant) → not-found route → other pages →
// Reset demo data → 390 px viewport without horizontal overflow.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/sandbox-assistant.spec.js (dev server on :3000,
// or BASE_URL=http://localhost:PORT for another port).
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const APP = `${BASE}/sandbox/assistant`;
const ENTRY = `${APP}/projects`;
const OUT = path.join(__dirname, "..", ".verify");
require("fs").mkdirSync(OUT, { recursive: true });
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `sandbox-assistant-${name}.png`), fullPage: false });
}
const oneLine = (t) => (t || "").replace(/\s*\n\s*/g, " | ");
const today = new Date().toISOString().slice(0, 10);
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lumen-workspace-db") || "{}"));
const uiVersion = (page) => page.evaluate(() => localStorage.getItem("lumen-ui-version"));
/** Value of the <dd> that follows the <dt> with exactly this label, from the first visible <dl> that has it. */
const dlValue = (page, label) =>
  page.evaluate((wanted) => {
    for (const dt of Array.from(document.querySelectorAll("dl dt"))) {
      if (dt.textContent.trim() !== wanted) continue;
      if (dt.getClientRects().length === 0) continue;
      let dd = dt.nextElementSibling;
      while (dd && dd.tagName !== "DD") dd = dd.nextElementSibling;
      return dd ? dd.textContent.replace(/\s+/g, " ").trim() : "";
    }
    return null;
  }, label);
/** Labels of the "Details" definition list in document order. */
const dlLabels = (page) => page.locator('section:has(h2:text-is("Details")) dl dt').allInnerTexts();
/** Exact label match that tolerates the aria-hidden required asterisk ("Reviewer*"): the accessible name stays "Reviewer". */
const lbl = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`);
const noOverflow = (page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));

const CONTEXT = {
  projectName: "Support triage helper",
  purpose: "Drafts first replies to support tickets from the knowledge base",
  reviewer: "Priya Natarajan — Head of Support",
};
const SUPPORT_TEMPLATE_START = "You help support agents draft replies";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const nav = () => page.getByRole("navigation", { name: "Primary" });
  const navLabels = async () => (await nav().getByRole("link").allInnerTexts()).map((t) => t.trim());
  const stepText = () => page.locator("form p[aria-live=polite]").innerText();
  const alerts = async () => (await page.getByRole("alert").allInnerTexts()).map((t) => t.trim());
  const options = (label) => page.getByLabel(lbl(label)).locator("option").allInnerTexts();

  try {
    await page.goto(ENTRY, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor({ timeout: 60000 });

    // ───────── 1. Chrome and seed (v1) ─────────
    const labels1 = await navLabels();
    record(
      "v1 sidebar: Home, Projects, Knowledge, Usage, Members, Settings",
      JSON.stringify(labels1) === JSON.stringify(["Home", "Projects", "Knowledge", "Usage", "Members", "Settings"]),
      labels1.join(" · "),
    );
    const header = await page.locator("header").innerText();
    const footer = await page.locator("footer").innerText();
    record(
      "header shows Lumen Workspace, version 2.3 and the signed-in user; footer carries the replica note",
      /Lumen Workspace/.test(header) && /\b2\.3\b/.test(header) && /Maya Lindqvist/.test(header) && /Fictional replica of an enterprise AI-assistant workspace pattern, built for this demonstration; not affiliated with any vendor\./.test(footer),
      `${oneLine(header)} · ${oneLine(footer).slice(0, 80)}`,
    );
    const title = await page.title();
    const rows0 = await page.locator("table tbody tr").allInnerTexts();
    const policyRow = rows0.find((t) => /PRJ-1004/.test(t)) || "";
    record(
      "project list shows the 6 seeded projects with the page title; PRJ-1004 has custom instructions, indefinite retention and is pending review",
      rows0.length === 6 && title === "Projects · Lumen Workspace" && /Custom instructions/.test(policyRow) && /Indefinite/.test(policyRow) && /Pending review/.test(policyRow),
      `${rows0.length} rows · ${title} · ${oneLine(policyRow).slice(0, 120)}`,
    );
    const seed = await db(page);
    record(
      "localStorage lumen-workspace-db seeded: projects PRJ-1001…PRJ-1006, 4 sources, 5 members, usage rows",
      (seed.projects || []).map((p) => p.id).join(",") === "PRJ-1001,PRJ-1002,PRJ-1003,PRJ-1004,PRJ-1005,PRJ-1006" && (seed.sources || []).length === 4 && (seed.members || []).length === 5 && (seed.usage || []).length === 6,
      `${(seed.projects || []).length} / ${(seed.sources || []).length} / ${(seed.members || []).length} / ${(seed.usage || []).length}`,
    );
    await shot(page, "01-projects-v1");

    // ───────── 2. v1 wizard ─────────
    await page.getByRole("link", { name: "New project" }).click();
    await page.waitForURL(/\/sandbox\/assistant\/projects\/new$/, { timeout: 30000 });
    await page.getByText("Step 1 of 4 · Basics").waitFor({ timeout: 30000 });
    const idV1 = await page.getByLabel("Project name").getAttribute("id");
    record("New project opens the wizard at Step 1 of 4 · Basics with fld- ids", idV1 === "fld-project-name", `${page.url()} · id=${idV1}`);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    const a1 = await alerts();
    record("empty name → role=alert 'Enter a project name', aria-invalid, stays on step 1", a1.includes("Enter a project name") && (await page.getByLabel("Project name").getAttribute("aria-invalid")) === "true" && /Step 1 of 4/.test(await stepText()), a1.join(" | "));
    await page.getByLabel("Project name").fill("Support reply drafts");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a2 = await alerts();
    record("duplicate name → 'A project named Support reply drafts already exists'", a2.includes("A project named Support reply drafts already exists"), a2.join(" | "));
    await page.getByLabel("Project name").fill("Support/triage");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a3 = await alerts();
    record("name with a slash → 'Use letters, digits, spaces and hyphens only'", a3.includes("Use letters, digits, spaces and hyphens only"), a3.join(" | "));
    await page.getByLabel("Project name").fill(CONTEXT.projectName);
    await page.getByLabel("Purpose").fill(CONTEXT.purpose);
    const modelOptions = await options("Model");
    await page.getByLabel("Model", { exact: true }).selectOption("Lumen Pro");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 4 · Instructions").waitFor({ timeout: 5000 });
    record("Model offers Lumen Standard / Lumen Pro / Lumen Fast; valid basics → Step 2 of 4 · Instructions without leaving /projects/new", modelOptions.join(",") === "Lumen Standard,Lumen Pro,Lumen Fast" && /\/projects\/new$/.test(page.url()), `${modelOptions.join(",")} · ${page.url()}`);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    const a4 = await alerts();
    const templateOptions = await options("Instruction template");
    record(
      "Next without a template → 'Select an instruction template'; options in order: Select a template, three Approved templates, Custom instructions",
      a4.includes("Select an instruction template") && (await page.getByLabel(lbl("Instruction template")).getAttribute("aria-invalid")) === "true" && templateOptions.join("|") === "Select a template|Approved: Support assistant|Approved: Sales research|Approved: Internal helpdesk|Custom instructions",
      templateOptions.join(" | "),
    );
    await page.getByLabel(lbl("Instruction template")).selectOption("Approved: Support assistant");
    const prefilled = await page.getByRole("textbox", { name: "Instructions", exact: true }).inputValue();
    await page.getByLabel(lbl("Instruction template")).selectOption("Custom instructions");
    const noteCount = await page.getByRole("note").filter({ hasText: /reviewer/ }).count();
    const emptied = await page.getByRole("textbox", { name: "Instructions", exact: true }).inputValue();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a5 = await alerts();
    await page.getByLabel(lbl("Instruction template")).selectOption("Approved: Support assistant");
    const noteAfter = await page.getByRole("note").filter({ hasText: /reviewer/ }).count();
    record(
      "approved template prefills Instructions; Custom instructions shows the reviewer note and empties the text; Next then asks for the custom instructions",
      prefilled.startsWith(SUPPORT_TEMPLATE_START) && noteCount === 1 && emptied === "" && a5.includes("Enter the custom instructions") && noteAfter === 0,
      `prefilled="${prefilled.slice(0, 40)}…" note=${noteCount}→${noteAfter}`,
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 3 of 4 · Knowledge").waitFor({ timeout: 5000 });
    const restrict = page.getByRole("switch", { name: "Restrict answers to connected knowledge" });
    const sourceOptions = await options("Knowledge source");
    const retentionOptions = await options("Data retention");
    const retentionDefault = await page.getByLabel("Data retention").inputValue();
    record(
      "Step 3 Knowledge: Knowledge source options, restrict switch on by default, Data retention 7/30/90/Indefinite defaulting to 90 days",
      sourceOptions.join("|") === "Select a source|Support knowledge base|Product documentation|HR policies|Engineering wiki" && (await restrict.getAttribute("aria-checked")) === "true" && retentionOptions.join("|") === "7 days|30 days|90 days|Indefinite" && retentionDefault === "90 days",
      `${sourceOptions.join(",")} · retention=${retentionDefault}`,
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a6 = await alerts();
    record("Next without a source → 'Select a knowledge source'", a6.includes("Select a knowledge source") && (await page.getByLabel(lbl("Knowledge source")).getAttribute("aria-invalid")) === "true", a6.join(" | "));
    await page.getByLabel(lbl("Knowledge source")).selectOption("Support knowledge base");
    await page.getByLabel("Data retention").selectOption("30 days");

    // Back / Next round trip keeps the values (rollback walks back through wizards).
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByText("Step 2 of 4 · Instructions").waitFor({ timeout: 5000 });
    const keptTemplate = await page.getByLabel(lbl("Instruction template")).inputValue();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByText("Step 1 of 4 · Basics").waitFor({ timeout: 5000 });
    const keptName = await page.getByLabel("Project name").inputValue();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 4 · Instructions").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 3 of 4 · Knowledge").waitFor({ timeout: 5000 });
    const keptSource = await page.getByLabel(lbl("Knowledge source")).inputValue();
    const keptRetention = await page.getByLabel("Data retention").inputValue();
    record(
      "Back to step 1 and forward again keeps name, template, source and retention; the URL stays /projects/new",
      keptTemplate === "Approved: Support assistant" && keptName === CONTEXT.projectName && keptSource === "Support knowledge base" && keptRetention === "30 days" && /\/projects\/new$/.test(page.url()),
      `${keptName} · ${keptTemplate} · ${keptSource} · ${keptRetention}`,
    );

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor({ timeout: 5000 });
    const reviewerOptions = await options("Reviewer");
    const orgRadio = page.getByRole("radio", { name: "Organization only" });
    record(
      "Step 4 Review summarizes the values; Reviewer offers the three reviewers; Visibility defaults to Organization only",
      (await dlValue(page, "Project name")) === CONTEXT.projectName && (await dlValue(page, "Model")) === "Lumen Pro" && (await dlValue(page, "Instruction template")) === "Approved: Support assistant" && (await dlValue(page, "Knowledge source")) === "Support knowledge base" && (await dlValue(page, "Data retention")) === "30 days" && (await dlValue(page, "Visibility")) === "Organization only" && reviewerOptions.join("|") === "Select a reviewer|Priya Natarajan — Head of Support|Daniel Okafor — Security lead|Sofia Marin — Legal counsel" && (await orgRadio.isChecked()) && !(await page.getByRole("radio", { name: "Anyone with the link" }).isChecked()),
      reviewerOptions.join(" | "),
    );
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    const a7 = await alerts();
    record("Create project without a reviewer → 'Select a reviewer', stays on Review", a7.includes("Select a reviewer") && /Step 4 of 4/.test(await stepText()), a7.join(" | "));
    await page.getByLabel(lbl("Reviewer")).selectOption(CONTEXT.reviewer);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    const a8 = await alerts();
    record("Create project without the acknowledgement → 'Confirm the acknowledgement to continue'", a8.includes("Confirm the acknowledgement to continue") && (await page.getByLabel("I confirm this project follows the AI use policy").getAttribute("aria-invalid")) === "true", a8.join(" | "));
    await page.getByLabel("I confirm this project follows the AI use policy").check();
    await shot(page, "02-review-v1");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await page.waitForURL(/\/sandbox\/assistant\/projects\/PRJ-1007(\?created=1)?$/, { timeout: 30000 });
    await page.getByRole("status").filter({ hasText: "Project created" }).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => !location.search.includes("created"), null, { timeout: 10000 }).catch(() => {});
    const h1 = await page.getByRole("heading", { level: 1 }).innerText();
    record("Create project commits, lands on /projects/PRJ-1007 with the 'Project created' banner, the query stripped and the name as heading", h1.trim() === CONTEXT.projectName && !/created=1/.test(page.url()) && (await page.title()) === `${CONTEXT.projectName} · Lumen Workspace`, page.url());
    const labels = await dlLabels(page);
    record(
      "outcome definition list carries exactly the eleven labels in order",
      labels.join("|") === "Project ID|Project name|Purpose|Model|Instruction template|Instructions|Knowledge sources|Data retention|Reviewer|Visibility|Created",
      labels.join(" | "),
    );
    const outcome = {
      id: await dlValue(page, "Project ID"),
      name: await dlValue(page, "Project name"),
      purpose: await dlValue(page, "Purpose"),
      model: await dlValue(page, "Model"),
      template: await dlValue(page, "Instruction template"),
      instructions: await dlValue(page, "Instructions"),
      sources: await dlValue(page, "Knowledge sources"),
      retention: await dlValue(page, "Data retention"),
      reviewer: await dlValue(page, "Reviewer"),
      visibility: await dlValue(page, "Visibility"),
      created: await dlValue(page, "Created"),
    };
    record(
      "outcome values: PRJ-1007, name, purpose, Lumen Pro, approved template with its text, Support knowledge base, 30 days, reviewer, Organization only, created today",
      outcome.id === "PRJ-1007" && outcome.name === CONTEXT.projectName && outcome.purpose === CONTEXT.purpose && outcome.model === "Lumen Pro" && outcome.template === "Approved: Support assistant" && outcome.instructions.startsWith(SUPPORT_TEMPLATE_START) && outcome.sources === "Support knowledge base" && outcome.retention === "30 days" && outcome.reviewer === CONTEXT.reviewer && outcome.visibility === "Organization only" && outcome.created.startsWith(today),
      JSON.stringify({ ...outcome, instructions: outcome.instructions.slice(0, 30) }),
    );
    await shot(page, "03-outcome-v1");

    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor({ timeout: 30000 });
    record("project list now lists 7 projects including the new one", (await page.locator("table tbody tr").count()) === 7 && (await page.getByRole("link", { name: CONTEXT.projectName }).count()) === 1);

    // ───────── 3. Small workflow A: Duplicate project ─────────
    await page.getByRole("button", { name: `Actions for ${CONTEXT.projectName}`, exact: true }).click();
    const items = await page.getByRole("menuitem").allInnerTexts();
    await page.getByRole("menuitem", { name: "Duplicate project" }).click();
    const dupDialog = page.getByRole("dialog", { name: "Duplicate project" });
    await dupDialog.waitFor({ timeout: 5000 });
    const copyName = await dupDialog.getByLabel("Project name").inputValue();
    await dupDialog.getByLabel("Project name").fill("");
    await dupDialog.getByRole("button", { name: "Duplicate project" }).click();
    const dupAlert = await dupDialog.getByRole("alert").allInnerTexts();
    await dupDialog.getByLabel("Project name").fill(`${CONTEXT.projectName} copy`);
    await dupDialog.getByRole("button", { name: "Duplicate project" }).click();
    await page.getByRole("status").filter({ hasText: "Project duplicated" }).waitFor({ timeout: 5000 });
    const copy = ((await db(page)).projects || []).find((p) => p.id === "PRJ-1008");
    record(
      "row menu (Duplicate project, Archive project) → dialog prefilled '… copy'; empty name → alert; duplicating creates PRJ-1008 with the same template, source, retention and reviewer",
      items.map((t) => t.trim()).join(",") === "Duplicate project,Archive project" && copyName === `${CONTEXT.projectName} copy` && dupAlert.includes("Enter a project name") && Boolean(copy) && copy.template === "Approved: Support assistant" && copy.sources.join(",") === "Support knowledge base" && copy.retention === "30 days" && copy.reviewer === CONTEXT.reviewer && (await page.locator("table tbody tr").count()) === 8,
      copy ? `${copy.id} ${copy.name}` : "missing",
    );
    await shot(page, "04-duplicated");

    // ───────── 4. Small workflow B: Archive project ─────────
    await page.getByRole("button", { name: `Actions for ${CONTEXT.projectName} copy`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Archive project" }).click();
    const archiveDialog = page.getByRole("dialog", { name: "Archive project" });
    await archiveDialog.waitFor({ timeout: 5000 });
    await archiveDialog.getByRole("button", { name: "Cancel" }).click();
    await archiveDialog.waitFor({ state: "hidden", timeout: 5000 });
    const stillActive = (((await db(page)).projects || []).find((p) => p.id === "PRJ-1008") || {}).status;
    await page.getByRole("button", { name: `Actions for ${CONTEXT.projectName} copy`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Archive project" }).click();
    await archiveDialog.waitFor({ timeout: 5000 });
    await archiveDialog.getByRole("button", { name: "Archive project" }).click();
    await page.getByRole("status").filter({ hasText: "Project archived" }).waitFor({ timeout: 5000 });
    const archivedRow = await page.locator("table tbody tr").filter({ hasText: "PRJ-1008" }).innerText();
    const archivedStatus = (((await db(page)).projects || []).find((p) => p.id === "PRJ-1008") || {}).status;
    record("Archive project: Cancel keeps PRJ-1008 active; confirming archives it (row and storage)", stillActive === "Active" && /Archived/.test(archivedRow) && archivedStatus === "Archived", `${stillActive} → ${archivedStatus}`);
    await page.goto(`${APP}/projects/PRJ-1008`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: `${CONTEXT.projectName} copy` }).waitFor({ timeout: 30000 });
    const archivedBadge = await page.locator("h1 ~ span, h1 + *").filter({ hasText: "Archived" }).count();
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    const archiveItem = page.getByRole("menuitem", { name: "Archive project" });
    const archiveDisabled = await archiveItem.getAttribute("aria-disabled");
    await page.keyboard.press("Escape");
    record("archived project page shows the Archived badge and its Actions menu disables Archive project", archivedBadge >= 1 && archiveDisabled === "true", `badge=${archivedBadge} disabled=${archiveDisabled}`);
    await page.goto(`${APP}/projects/PRJ-1001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Support reply drafts" }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Duplicate project" }).click();
    const headerDup = page.getByRole("dialog", { name: "Duplicate project" });
    await headerDup.waitFor({ timeout: 5000 });
    const headerCopyName = await headerDup.getByLabel("Project name").inputValue();
    await headerDup.getByRole("button", { name: "Cancel" }).click();
    await headerDup.waitFor({ state: "hidden", timeout: 5000 });
    record("project page header Actions menu opens the Duplicate dialog prefilled; Cancel closes it without a copy", headerCopyName === "Support reply drafts copy" && ((await db(page)).projects || []).length === 8, headerCopyName);
    await shot(page, "05-detail-v1");

    // ───────── 5. Vendor update: v2 via ?ui=v2 ─────────
    await page.goto(`${APP}/settings?ui=v2`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => localStorage.getItem("lumen-ui-version") === "v2" && !location.search, null, { timeout: 15000 });
    const switchChecked = await page.getByRole("switch", { name: "Simulate vendor UI update (v2)" }).getAttribute("aria-checked");
    const version2 = await page.locator("header").getByText("2.4 preview").count();
    record("?ui=v2 on Settings switches to v2: stored, query removed, #ui-version-switch on, header shows 2.4 preview", switchChecked === "true" && version2 === 1 && (await page.locator("#ui-version-switch").count()) === 1, `lumen-ui-version=${await uiVersion(page)} · ${page.url()}`);
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Assistants" }).waitFor({ timeout: 30000 });
    const labels2 = await navLabels();
    record(
      "v2 sidebar reordered (Data sources under Usage) with 'Assistants'; button 'Create assistant'; row menu 'More options for …'",
      JSON.stringify(labels2) === JSON.stringify(["Home", "Assistants", "Usage", "Data sources", "Members", "Settings"]) && (await page.getByRole("link", { name: "Create assistant" }).count()) === 1 && (await page.getByRole("link", { name: "New project" }).count()) === 0 && (await page.getByRole("button", { name: "More options for Support reply drafts", exact: true }).count()) === 1,
      labels2.join(" · "),
    );
    await page.getByRole("link", { name: "Create assistant" }).click();
    await page.waitForURL(/\/projects\/new$/, { timeout: 30000 });
    await page.getByText("Step 1 of 4 · Basics").waitFor({ timeout: 30000 });
    const idV2 = await page.getByLabel("Project name").getAttribute("id");
    await page.getByLabel("Project name").fill("Sales research helper");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 2 of 4 · Instructions").waitFor({ timeout: 5000 });
    await page.getByLabel(lbl("Instruction template")).selectOption("Approved: Sales research");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 3 of 4 · Data sources").waitFor({ timeout: 5000 });
    const dataSourceLabel = await page.getByLabel(lbl("Data source")).count();
    const oldLabel = await page.getByLabel(lbl("Knowledge source")).count();
    const retentionOnStep3 = await page.getByLabel("Data retention").count();
    record(
      "v2 wizard: lw- ids, 'Continue' advances, step 3 is 'Data sources' with a 'Data source' select and no Data retention field",
      idV2 === "lw-project-name" && dataSourceLabel === 1 && oldLabel === 0 && retentionOnStep3 === 0 && (await page.getByRole("note").filter({ hasText: /Governance/ }).count()) === 1,
      `id=${idV2} · data source=${dataSourceLabel} · retention on step 3=${retentionOnStep3}`,
    );
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const a9 = await alerts();
    record("v2 Continue without a source → 'Select a data source'", a9.includes("Select a data source"), a9.join(" | "));
    await page.getByLabel(lbl("Data source")).selectOption("Product documentation");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor({ timeout: 5000 });
    const tabs = await page.getByRole("tab").allInnerTexts();
    await page.getByRole("tab", { name: "Governance" }).click();
    await page.getByLabel("Data retention").waitFor({ timeout: 5000 });
    const govDefault = await page.getByLabel("Data retention").inputValue();
    await page.getByLabel("Data retention").selectOption("7 days");
    await page.getByRole("tab", { name: "Summary" }).click();
    const summaryHasReviewer = await page.getByLabel(lbl("Reviewer")).count();
    record("v2 Review has Summary and Governance tabs; Governance holds Data retention (90 days by default); Summary holds the reviewer", tabs.map((t) => t.trim()).join(",") === "Summary,Governance" && govDefault === "90 days" && summaryHasReviewer === 1, tabs.join(","));
    await page.getByLabel(lbl("Reviewer")).selectOption("Daniel Okafor — Security lead");
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByText("Step 3 of 4 · Data sources").waitFor({ timeout: 5000 });
    const keptSource2 = await page.getByLabel(lbl("Data source")).inputValue();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor({ timeout: 5000 });
    await page.getByRole("tab", { name: "Governance" }).click();
    const keptRetention2 = await page.getByLabel("Data retention").inputValue();
    await page.getByRole("tab", { name: "Summary" }).click();
    record("v2 Previous/Continue keeps the source, the retention on the Governance tab and the reviewer", keptSource2 === "Product documentation" && keptRetention2 === "7 days" && (await page.getByLabel(lbl("Reviewer")).inputValue()) === "Daniel Okafor — Security lead", `${keptSource2} · ${keptRetention2}`);
    await page.getByRole("button", { name: "Save assistant", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    record("v2 'Save assistant' without the acknowledgement → role=alert", (await alerts()).includes("Confirm the acknowledgement to continue"));
    await page.getByLabel("I confirm this project follows the AI use policy").check();
    await shot(page, "06-review-v2");
    await page.getByRole("button", { name: "Save assistant", exact: true }).click();
    await page.waitForURL(/\/sandbox\/assistant\/projects\/PRJ-1009(\?created=1)?$/, { timeout: 30000 });
    await page.getByRole("status").filter({ hasText: "Project created" }).waitFor({ timeout: 30000 });
    const v2out = {
      template: await dlValue(page, "Instruction template"),
      sources: await dlValue(page, "Knowledge sources"),
      retention: await dlValue(page, "Data retention"),
      reviewer: await dlValue(page, "Reviewer"),
      visibility: await dlValue(page, "Visibility"),
    };
    record(
      "v2 outcome page PRJ-1009: Sales research template, Product documentation, 7 days, Daniel Okafor, Organization only",
      v2out.template === "Approved: Sales research" && v2out.sources === "Product documentation" && v2out.retention === "7 days" && v2out.reviewer === "Daniel Okafor — Security lead" && v2out.visibility === "Organization only",
      JSON.stringify(v2out),
    );
    await shot(page, "07-outcome-v2");

    // Unknown id inside the pre-generated range → client "not found".
    await page.goto(`${APP}/projects/PRJ-1039`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Project not found" }).waitFor({ timeout: 30000 });
    record("unknown project id (PRJ-1039) renders 'Project not found' with a link back to the list", (await page.getByRole("link", { name: /Back to Assistants/ }).count()) === 1);

    // ───────── 6. Other pages (back on v1) ─────────
    await page.goto(`${APP}/settings?ui=v1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => localStorage.getItem("lumen-ui-version") === "v1", null, { timeout: 15000 });
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Welcome back, Maya" }).waitFor({ timeout: 30000 });
    const statCards = await page.locator("main section .grid > div").count();
    const recentRows = await page.getByRole("table", { name: "Recent projects" }).locator("tbody tr").count();
    record("Home: 'Welcome back, Maya', four stat cards, recent projects table", statCards === 4 && recentRows === 5 && (await page.title()) === "Home · Lumen Workspace", `cards=${statCards} rows=${recentRows}`);
    await page.goto(`${APP}/knowledge`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Knowledge" }).waitFor({ timeout: 30000 });
    const knowledgeRows = await page.locator("table tbody tr").allInnerTexts();
    record("Knowledge lists the four sources with status and usage", knowledgeRows.length === 4 && knowledgeRows.some((t) => /Support knowledge base/.test(t) && /Connected/.test(t)) && knowledgeRows.some((t) => /Engineering wiki/.test(t) && /Syncing/.test(t)), `${knowledgeRows.length} rows`);
    await page.goto(`${APP}/usage`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Usage" }).waitFor({ timeout: 30000 });
    const usageRows = await page.locator("table tbody tr").count();
    record("Usage renders a per-project table labelled as seeded demo figures", usageRows === 6 && /seeded demo figures/i.test(await page.locator("main").innerText()), `${usageRows} rows`);
    await page.goto(`${APP}/members`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Members" }).waitFor({ timeout: 30000 });
    const memberRows = await page.locator("table tbody tr").allInnerTexts();
    record("Members lists the five members with roles", memberRows.length === 5 && memberRows.some((t) => /Maya Lindqvist/.test(t) && /Workspace admin/.test(t)) && memberRows.filter((t) => /Reviewer/.test(t)).length === 3, `${memberRows.length} rows`);
    await shot(page, "08-members");

    // ───────── 7. Reset demo data ─────────
    await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reset demo data" }).click();
    const resetDialog = page.getByRole("dialog", { name: "Reset demo data" });
    await resetDialog.waitFor({ timeout: 5000 });
    await resetDialog.getByRole("button", { name: "Reset data" }).click();
    await page.getByRole("status").filter({ hasText: "Demo data has been reset." }).waitFor({ timeout: 5000 });
    const afterReset = await db(page);
    await page.goto(`${APP}/projects/PRJ-1007`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Project not found" }).waitFor({ timeout: 30000 });
    record("Reset demo data restores the 6 seeded projects; PRJ-1007 is gone", (afterReset.projects || []).length === 6 && !(afterReset.projects || []).some((p) => p.id === "PRJ-1007"), `${(afterReset.projects || []).length} projects`);

    // ───────── 8. Mobile ─────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    const wList = await noOverflow(page);
    await page.goto(`${APP}/projects/new`, { waitUntil: "networkidle" });
    await page.getByText("Step 1 of 4 · Basics").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    const wWizard = await noOverflow(page);
    await shot(page, "09-mobile-wizard");
    await page.goto(`${APP}/projects/PRJ-1001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Support reply drafts" }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    const wDetail = await noOverflow(page);
    record("390px viewport: no horizontal overflow on the project list, the wizard with an error and a project page", wList.scroll <= wList.inner && wWizard.scroll <= wWizard.inner && wDetail.scroll <= wDetail.inner, JSON.stringify({ wList, wWizard, wDetail }));
    await shot(page, "10-mobile-detail");
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (e) {
    record("script", false, e.stack || String(e));
    try {
      await shot(page, "99-failure");
    } catch {}
  } finally {
    const pageErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
    record("zero console/page errors", pageErrors.length === 0, pageErrors.length ? pageErrors.slice(0, 5).join(" || ") : "none");
    console.log("\nConsole/page errors:", pageErrors.length ? pageErrors.slice(0, 10) : "none");
    console.log("\nSUMMARY:", results.filter((r) => r.ok).length, "passed,", results.filter((r) => !r.ok).length, "failed");
    await browser.close();
    process.exitCode = results.some((r) => !r.ok) ? 1 : 0;
  }
})();
