// Nimbus Data Console sandbox (/sandbox/data): chrome → v1 New table wizard (snake_case validation, columns, RLS on,
// policy, Back/Next round trip, acknowledgement, Create table) → outcome page values → v2 via ?ui=v2 (Tables, Create
// table, RLS protection, Policies tab, Previous, Save table) → not-found route → Invite member (Editor) → Rotate the
// service key with a reason → Reset demo data → 390 px viewport without horizontal overflow.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/sandbox-data.spec.js (dev server on :3000).
const path = require("path");
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const APP = `${BASE}/sandbox/data`;
const PROJECT = `${APP}/projects/PRJ-2001`;
const ENTRY = `${PROJECT}/tables`;
const OUT = path.join(__dirname, "..", ".verify");
require("fs").mkdirSync(OUT, { recursive: true });
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `sandbox-data-${name}.png`), fullPage: false });
}
const oneLine = (t) => t.replace(/\s*\n\s*/g, " | ");
const today = new Date().toISOString().slice(0, 10);

/** Reads the "Details" definition list on a table page into { label: value }. */
async function readDetails(page) {
  return page.locator('section:has(h2:text-is("Details")) dl').evaluate((el) => {
    const out = {};
    el.querySelectorAll("dt").forEach((dt) => {
      out[dt.textContent.trim()] = (dt.nextElementSibling ? dt.nextElementSibling.textContent : "").trim();
    });
    return out;
  });
}

async function noOverflow(page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
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
  const nav = () => page.getByRole("navigation", { name: "Primary" });
  const navLabels = async () => (await nav().getByRole("link").allInnerTexts()).map((t) => t.trim());
  const stepText = () => page.locator("form p[aria-live=polite]").innerText();
  const alerts = () => page.getByRole("alert").allInnerTexts();

  try {
    await page.goto(ENTRY, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Table editor" }).waitFor({ timeout: 60000 });

    // ───────── 1. Chrome (v1) ─────────
    const labels1 = await navLabels();
    record(
      "v1 sidebar: Home, Table editor, SQL editor, Authentication, Storage, API keys, Team, Settings",
      JSON.stringify(labels1) === JSON.stringify(["Home", "Table editor", "SQL editor", "Authentication", "Storage", "API keys", "Team", "Settings"]),
      labels1.join(" · "),
    );
    const projectBtn = await page.getByRole("button", { name: "Acme Ops (PRJ-2001)" }).count();
    const version1 = await page.locator("header").getByText("2.14").count();
    const footer = await page.locator("footer").innerText();
    const user = await page.locator("header").innerText();
    record(
      "project selector, header version 2.14, signed-in user chip, replica footer",
      projectBtn === 1 && version1 === 1 && /Replica of a developer-console pattern built for demonstration\. Not affiliated with any vendor\./.test(footer) && /Dana Whitfield/.test(user),
      `selector=${projectBtn} · version=${version1} · ${oneLine(footer).slice(0, 90)}`,
    );
    const title = await page.title();
    const rows0 = await page.locator("table tbody tr").count();
    const enabled0 = await page.locator("table tbody").getByText("Enabled").count();
    const unrestricted0 = await page.locator("table tbody").getByText("Unrestricted").count();
    record("table editor lists the 6 seeded tables (5 RLS enabled, 1 unrestricted) with the page title", rows0 === 6 && enabled0 === 5 && unrestricted0 === 1 && title === "Table editor · Nimbus Data Console", `${rows0} rows · ${title}`);
    const seed = await page.evaluate(() => JSON.parse(localStorage.getItem("nimbus-data-db") || "{}"));
    record("localStorage nimbus-data-db seeded (6 tables, 5 members, 3 keys, auth users)", (seed.tables || []).length === 6 && (seed.members || []).length === 5 && (seed.apiKeys || []).length === 3 && (seed.authUsers || []).length >= 3, `${(seed.tables || []).map((t) => t.id).join(",")}`);
    await shot(page, "01-tables-v1");

    // ───────── 2. v1 wizard ─────────
    await page.getByRole("link", { name: "New table" }).click();
    await page.waitForURL(/\/projects\/PRJ-2001\/tables\/new$/, { timeout: 30000 });
    await page.getByText("Step 1 of 4 · Name and description").waitFor({ timeout: 30000 });
    record("New table opens the wizard at Step 1 of 4 · Name and description", true, page.url());

    await page.getByLabel("Table name").fill("Customer Notes");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    const alerts1 = await alerts();
    const invalid1 = await page.getByLabel("Table name").getAttribute("aria-invalid");
    record("wrong table name format → role=alert 'Use snake_case…' and aria-invalid, stays on step 1", alerts1.includes("Use snake_case: lowercase letters, digits and underscores") && invalid1 === "true" && /Step 1 of 4/.test(await stepText()), alerts1.join(" | "));

    await page.getByLabel("Table name").fill("customer_notes");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("Free-text notes agents attach to a customer");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 4 · Columns").waitFor({ timeout: 5000 });
    const colName = await page.getByLabel("Column name").first().inputValue();
    const colType = await page.getByLabel("Type").first().inputValue();
    const pk = await page.getByLabel("Primary key").first().isChecked();
    const nullable = await page.getByLabel("Nullable").first().isChecked();
    record("Step 2 Columns: default row id / uuid / Primary key checked / not nullable", colName === "id" && colType === "uuid" && pk && !nullable, `${colName} ${colType} pk=${pk} nullable=${nullable}`);
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("Column name").nth(1).waitFor({ timeout: 5000 });
    await page.getByLabel("Column name").nth(1).fill("user_id");
    await page.getByLabel("Type").nth(1).selectOption("uuid");
    const colCount = await page.getByLabel("Column name").count();
    record("Add column adds a second row (Column name, Type, Nullable, Primary key)", colCount === 2 && (await page.getByLabel("Primary key").count()) === 2 && (await page.getByLabel("Nullable").count()) === 2, `${colCount} rows`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 3 of 4 · Security").waitFor({ timeout: 5000 });

    const rls = page.getByRole("switch", { name: "Row level security" });
    const rlsBefore = await rls.getAttribute("aria-checked");
    const policyBefore = await page.getByLabel("Policy name").count();
    await rls.click();
    await page.getByLabel("Policy name").waitFor({ timeout: 5000 });
    const rlsAfter = await rls.getAttribute("aria-checked");
    record("Step 3 Security: 'Row level security' switch is off by default; switching it on reveals the policy form", rlsBefore === "false" && policyBefore === 0 && rlsAfter === "true", `before=${rlsBefore} after=${rlsAfter}`);
    const usingPrefill = await page.getByLabel("Using expression").inputValue();
    const roleDefault = await page.getByLabel("Role").inputValue();
    const commandDefault = await page.getByLabel("Command").inputValue();
    const roleOptions = await page.getByLabel("Role").locator("option").allInnerTexts();
    const commandOptions = await page.getByLabel("Command").locator("option").allInnerTexts();
    record(
      "policy form: Using expression prefilled auth.uid() = user_id; Role anon/authenticated/service_role; Command SELECT/INSERT/UPDATE/DELETE",
      usingPrefill === "auth.uid() = user_id" && roleDefault === "anon" && commandDefault === "SELECT" && roleOptions.join(",") === "anon,authenticated,service_role" && commandOptions.join(",") === "SELECT,INSERT,UPDATE,DELETE",
      `using="${usingPrefill}" role=${roleDefault} command=${commandDefault}`,
    );
    await page.getByLabel("Policy name").fill("Users read own rows");
    await page.getByLabel("Role").selectOption("authenticated");
    await page.getByLabel("Command").selectOption("SELECT");

    // Back / Next round trip keeps the values (rollback walks back through wizards).
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByText("Step 2 of 4 · Columns").waitFor({ timeout: 5000 });
    const keptColumn = await page.getByLabel("Column name").nth(1).inputValue();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByText("Step 1 of 4 · Name and description").waitFor({ timeout: 5000 });
    const keptName = await page.getByLabel("Table name").inputValue();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 4 · Columns").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 3 of 4 · Security").waitFor({ timeout: 5000 });
    const keptRls = await rls.getAttribute("aria-checked");
    const keptPolicy = await page.getByLabel("Policy name").inputValue();
    const keptRole = await page.getByLabel("Role").inputValue();
    record("Back to step 1 and forward again keeps table name, columns, RLS and the policy", keptColumn === "user_id" && keptName === "customer_notes" && keptRls === "true" && keptPolicy === "Users read own rows" && keptRole === "authenticated", `${keptName} · ${keptColumn} · rls=${keptRls} · ${keptPolicy}/${keptRole}`);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor({ timeout: 5000 });
    const review = await page.locator("form dl").innerText();
    record("Step 4 Review summarizes name, primary key, RLS and the policy", /customer_notes/.test(review) && /Primary key\s+id/.test(review) && /Row level security\s+Enabled/.test(review) && /Users read own rows · authenticated · SELECT/.test(review), oneLine(review).slice(0, 200));
    await page.getByRole("button", { name: "Create table", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    const ackAlert = await alerts();
    record("Create table without the acknowledgement → role=alert, stays on Review", ackAlert.includes("Confirm the acknowledgement to continue") && /Step 4 of 4/.test(await stepText()), ackAlert.join(" | "));
    await page.getByLabel("I understand new tables must keep row level security on").check();
    await shot(page, "02-review-v1");
    await page.getByRole("button", { name: "Create table", exact: true }).click();
    await page.waitForURL(/\/projects\/PRJ-2001\/tables\/TBL-4007(\?created=1)?$/, { timeout: 30000 });
    await page.getByRole("status").filter({ hasText: "Table created" }).waitFor({ timeout: 30000 });
    record("Create table commits and lands on /tables/TBL-4007 with the 'Table created' banner", true, page.url());
    await page.waitForFunction(() => !location.search.includes("created"), null, { timeout: 10000 }).catch(() => {});
    const details1 = await readDetails(page);
    record(
      "outcome page details: Table name, Description, Primary key id, Row level security Enabled, Policies, Created today",
      details1["Table name"] === "customer_notes" &&
        details1["Description"] === "Free-text notes agents attach to a customer" &&
        details1["Primary key"] === "id" &&
        details1["Row level security"] === "Enabled" &&
        details1["Policies"] === "Users read own rows · authenticated · SELECT" &&
        details1["Created"].startsWith(today),
      JSON.stringify(details1),
    );
    const h1 = await page.getByRole("heading", { level: 1 }).innerText();
    const title2 = await page.title();
    record("heading is the table name and the ?created flag is removed from the URL", h1.trim() === "customer_notes" && title2 === "customer_notes · Nimbus Data Console" && !/created=1/.test(page.url()), `${h1} · ${page.url()}`);
    await page.getByRole("tab", { name: "Policies" }).click();
    const policyRows = await page.getByRole("tabpanel").locator("table tbody tr").allInnerTexts();
    await page.getByRole("tab", { name: "Columns" }).click();
    const columnRows = await page.getByRole("tabpanel").locator("table tbody tr").allInnerTexts();
    record("Columns tab lists id and user_id; Policies tab lists the policy with role and command", columnRows.length === 2 && /^id\s+uuid/.test(columnRows[0]) && /^user_id\s+uuid/.test(columnRows[1]) && policyRows.length === 1 && /Users read own rows\s+authenticated\s+SELECT/.test(policyRows[0]), oneLine(policyRows.join(" || ")));
    await shot(page, "03-outcome-v1");

    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Table editor" }).waitFor({ timeout: 30000 });
    const rows1 = await page.locator("table tbody tr").count();
    record("table editor now lists 7 tables including customer_notes", rows1 === 7 && (await page.getByRole("link", { name: "customer_notes" }).count()) === 1, `${rows1} rows`);

    // ───────── 3. v2 via ?ui=v2 ─────────
    await page.goto(`${APP}/settings?ui=v2`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => localStorage.getItem("nimbus-ui-version") === "v2" && !location.search, null, { timeout: 15000 });
    const switchChecked = await page.getByRole("switch", { name: "Simulate vendor UI update (v2)" }).getAttribute("aria-checked");
    const version2 = await page.locator("header").getByText("2.15 preview").count();
    record("?ui=v2 on Settings switches to v2: stored, query removed, switch on, header shows 2.15 preview", switchChecked === "true" && version2 === 1, `nimbus-ui-version=v2 · ${page.url()}`);
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Tables" }).waitFor({ timeout: 30000 });
    const labels2 = await navLabels();
    const rlsHeader = await page.locator("table thead").innerText();
    record(
      "v2 sidebar reordered with 'Tables'; list header column reads 'RLS protection'; button 'Create table'",
      JSON.stringify(labels2) === JSON.stringify(["Home", "Tables", "Authentication", "SQL editor", "Storage", "Team", "API keys", "Settings"]) && /RLS protection/i.test(rlsHeader) && (await page.getByRole("link", { name: "Create table" }).count()) === 1 && (await page.getByRole("link", { name: "New table" }).count()) === 0,
      labels2.join(" · "),
    );
    await page.getByRole("link", { name: "Create table" }).click();
    await page.waitForURL(/\/tables\/new$/, { timeout: 30000 });
    await page.getByText("Step 1 of 4 · Name and description").waitFor({ timeout: 30000 });
    const idV2 = await page.getByLabel("Table name").getAttribute("id");
    await page.getByLabel("Table name").fill("Support Tickets");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    record("v2 wizard: DOM ids use the nb- prefix; 'Continue' validates snake_case", idV2 === "nb-table-name" && (await alerts()).includes("Use snake_case: lowercase letters, digits and underscores"), `id=${idV2}`);
    await page.getByLabel("Table name").fill("support_tickets");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("Tickets raised by customers through the help center");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 2 of 4 · Columns").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("Column name").nth(1).fill("user_id");
    await page.getByLabel("Type").nth(1).selectOption("uuid");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 3 of 4 · Security").waitFor({ timeout: 5000 });
    const rls2 = page.getByRole("switch", { name: "RLS protection" });
    const oldName2 = await page.getByRole("switch", { name: "Row level security" }).count();
    await rls2.click();
    await page.waitForTimeout(200);
    const policyOnStep3 = await page.getByLabel("Policy name").count();
    record("v2 Security step: switch is named 'RLS protection' (not 'Row level security'); the policy form is no longer on this step", (await rls2.getAttribute("aria-checked")) === "true" && oldName2 === 0 && policyOnStep3 === 0, `policy fields on step 3: ${policyOnStep3}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor({ timeout: 5000 });
    const tabs = await page.getByRole("tab").allInnerTexts();
    await page.getByRole("tab", { name: "Policies" }).click();
    await page.getByLabel("Policy name").waitFor({ timeout: 5000 });
    record("v2 Review step has Summary and Policies tabs; the Policies tab holds the policy form", tabs.map((t) => t.trim()).join(",") === "Summary,Policies" && (await page.getByLabel("Using expression").inputValue()) === "auth.uid() = user_id", tabs.join(","));
    await page.getByLabel("Policy name").fill("Ticket owners read own tickets");
    await page.getByLabel("Role").selectOption("authenticated");
    await page.getByLabel("Command").selectOption("SELECT");
    // Previous / Continue keeps the policy typed on the tab.
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByText("Step 3 of 4 · Security").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor({ timeout: 5000 });
    await page.getByRole("tab", { name: "Policies" }).click();
    const keptPolicy2 = await page.getByLabel("Policy name").inputValue();
    await page.getByRole("tab", { name: "Summary" }).click();
    const review2 = await page.locator("form dl").innerText();
    record("v2 Previous/Continue keeps the policy; Summary shows RLS protection Enabled and the policy", keptPolicy2 === "Ticket owners read own tickets" && /RLS protection\s+Enabled/.test(review2) && /Ticket owners read own tickets · authenticated · SELECT/.test(review2), oneLine(review2).slice(0, 200));
    await page.getByRole("button", { name: "Save table", exact: true }).click();
    await page.getByRole("alert").first().waitFor({ timeout: 5000 });
    record("v2 'Save table' without the acknowledgement → role=alert", (await alerts()).includes("Confirm the acknowledgement to continue"));
    await page.getByLabel("I understand new tables must keep row level security on").check();
    await shot(page, "04-review-v2");
    await page.getByRole("button", { name: "Save table", exact: true }).click();
    await page.waitForURL(/\/projects\/PRJ-2001\/tables\/TBL-4008(\?created=1)?$/, { timeout: 30000 });
    await page.getByRole("status").filter({ hasText: "Table created" }).waitFor({ timeout: 30000 });
    const details2 = await readDetails(page);
    record(
      "v2 outcome page TBL-4008: same labelled values with 'RLS protection' Enabled",
      details2["Table name"] === "support_tickets" && details2["Description"] === "Tickets raised by customers through the help center" && details2["Primary key"] === "id" && details2["RLS protection"] === "Enabled" && details2["Policies"] === "Ticket owners read own tickets · authenticated · SELECT" && details2["Created"].startsWith(today),
      JSON.stringify(details2),
    );
    await shot(page, "05-outcome-v2");

    // Unknown id inside the pre-generated range → client "not found".
    await page.goto(`${PROJECT}/tables/TBL-4039`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Table not found" }).waitFor({ timeout: 30000 });
    record("unknown table id (TBL-4039) renders 'Table not found' with a link back to the list", (await page.getByRole("link", { name: /Back to Tables/ }).count()) === 1);

    // Existing table: the RLS switch can be turned off only through a confirmation dialog.
    await page.goto(`${PROJECT}/tables/TBL-4001?ui=v1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => localStorage.getItem("nimbus-ui-version") === "v1", null, { timeout: 15000 });
    await page.getByRole("heading", { level: 1, name: "customers" }).waitFor({ timeout: 30000 });
    const headerSwitch = page.getByRole("switch", { name: "Row level security" });
    await headerSwitch.click();
    const disableDialog = page.getByRole("dialog", { name: "Disable row level security?" });
    await disableDialog.waitFor({ timeout: 5000 });
    await disableDialog.getByRole("button", { name: "Cancel" }).click();
    await disableDialog.waitFor({ state: "hidden", timeout: 5000 });
    record("existing table: turning the RLS switch off asks for confirmation; Cancel keeps it enabled", (await headerSwitch.getAttribute("aria-checked")) === "true" && (await readDetails(page))["Row level security"] === "Enabled");

    // ───────── 4. Invite a team member with the Editor role ─────────
    await page.goto(`${PROJECT}/team`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Team" }).waitFor({ timeout: 30000 });
    const members0 = await page.locator("table tbody tr").count();
    await page.getByRole("button", { name: "Invite member" }).click();
    const inviteDialog = page.getByRole("dialog", { name: "Invite member" });
    await inviteDialog.waitFor({ timeout: 5000 });
    await inviteDialog.getByRole("button", { name: "Send invite" }).click();
    const inviteAlert = await inviteDialog.getByRole("alert").allInnerTexts();
    await inviteDialog.getByLabel("Email").fill("sam.ortega@acme-ops.example");
    await inviteDialog.getByLabel("Role").selectOption("Editor");
    await inviteDialog.getByRole("button", { name: "Send invite" }).click();
    await page.getByRole("status").filter({ hasText: "Invitation sent to sam.ortega@acme-ops.example as Editor." }).waitFor({ timeout: 5000 });
    const memberRow = page.locator("table tbody tr").filter({ hasText: "sam.ortega@acme-ops.example" });
    const memberText = await memberRow.innerText();
    record("Invite member: empty email → alert; Email + Role Editor → status line and an Invited row with the Editor role", inviteAlert.includes("Enter an email address") && members0 === 5 && (await page.locator("table tbody tr").count()) === 6 && /Editor/.test(memberText) && /Invited/.test(memberText), oneLine(memberText));
    await shot(page, "06-team");

    // ───────── 5. Rotate the service key with a reason ─────────
    await page.goto(`${PROJECT}/api-keys`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "API keys" }).waitFor({ timeout: 30000 });
    const keyRow = page.locator("table tbody tr").filter({ hasText: "service_role" });
    const valueBefore = await keyRow.locator("code").innerText();
    await keyRow.getByRole("button", { name: "Actions for service_role" }).click();
    await page.getByRole("menuitem", { name: "Rotate key" }).click();
    const rotateDialog = page.getByRole("dialog", { name: "Rotate key" });
    await rotateDialog.waitFor({ timeout: 5000 });
    await rotateDialog.getByRole("button", { name: "Rotate key" }).click();
    const rotateAlert = await rotateDialog.getByRole("alert").allInnerTexts();
    await rotateDialog.getByLabel("Reason").fill("Key was pasted into a support ticket");
    await rotateDialog.getByRole("button", { name: "Rotate key" }).click();
    await page.getByRole("status").filter({ hasText: "Key service_role rotated." }).waitFor({ timeout: 5000 });
    const valueAfter = await keyRow.locator("code").innerText();
    const rotatedOn = await keyRow.locator("td").nth(4).innerText();
    const history = await page.locator('section:has(h2:text-is("Rotation history"))').innerText();
    record("Rotate key: empty reason → alert; with a reason the value changes, Last rotated is today and the reason is in the history", rotateAlert.includes("Enter a reason for the rotation") && valueBefore !== valueAfter && rotatedOn === today && /Key was pasted into a support ticket/.test(history), `${valueBefore} → ${valueAfter}`);
    await shot(page, "07-api-keys");

    // Other pages render without errors.
    for (const [sub, heading] of [["/sql", "SQL editor"], ["/auth", "Authentication"], ["/storage", "Storage"], ["", "Acme Ops"]]) {
      await page.goto(`${PROJECT}${sub}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { level: 1, name: heading }).waitFor({ timeout: 30000 });
    }
    await page.goto(`${PROJECT}/sql`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Query", exact: true }).fill("select * from customers limit 3;");
    await page.getByRole("button", { name: "Run" }).click();
    await page.getByRole("status").filter({ hasText: "3 rows" }).waitFor({ timeout: 5000 });
    record("SQL editor, Authentication, Storage and Home render; Run echoes a 3-row result for customers", (await page.getByRole("region", { name: "Query results" }).locator("table tbody tr").count()) === 3);

    // ───────── 6. Reset demo data ─────────
    await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reset demo data" }).click();
    const resetDialog = page.getByRole("dialog", { name: "Reset demo data" });
    await resetDialog.waitFor({ timeout: 5000 });
    await resetDialog.getByRole("button", { name: "Reset data" }).click();
    await page.getByRole("status").filter({ hasText: "Demo data has been reset." }).waitFor({ timeout: 5000 });
    const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem("nimbus-data-db") || "{}"));
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Table editor" }).waitFor({ timeout: 30000 });
    record("Reset demo data restores 6 tables, 5 members and the seed keys", (afterReset.tables || []).length === 6 && (afterReset.members || []).length === 5 && (await page.locator("table tbody tr").count()) === 6, `${(afterReset.tables || []).length} tables`);

    // ───────── 7. Mobile ─────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Table editor" }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    const wList = await noOverflow(page);
    await page.goto(`${PROJECT}/tables/new`, { waitUntil: "networkidle" });
    await page.getByText("Step 1 of 4 · Name and description").waitFor({ timeout: 30000 });
    await page.getByLabel("Table name").fill("mobile_check");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 4 · Columns").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Add column" }).click();
    await page.waitForTimeout(300);
    const wWizard = await noOverflow(page);
    await shot(page, "08-mobile-wizard");
    await page.goto(`${PROJECT}/tables/TBL-4001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "customers" }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    const wDetail = await noOverflow(page);
    record("390px viewport: no horizontal overflow on the table list, the wizard (2 column rows) and a table page", wList.scroll <= wList.inner && wWizard.scroll <= wWizard.inner && wDetail.scroll <= wDetail.inner, JSON.stringify({ wList, wWizard, wDetail }));
    await shot(page, "09-mobile-detail");
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
