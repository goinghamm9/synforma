// Atlas ERP sandbox: launchpad → Create Purchase Requisition wizard by hand in v1 (delivery-date and
// justification validation, then success and the outcome page values) → vendor update (v2 via
// /sandbox/erp/settings?ui=v2: renamed controls, Justification tab inside Review, "Order") → the two small
// workflows (Return with comment, Edit payment terms) → Reset demo data → 390 px viewport without overflow.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/sandbox-erp.spec.js (dev server on :3000).
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
  await page.screenshot({ path: path.join(OUT, `sandbox-erp-${name}.png`), fullPage: false });
}
const oneLine = (t) => (t || "").replace(/\s*\n\s*/g, " | ");
const pad = (n) => String(n).padStart(2, "0");
/** Local ISO date n days from today (the app validates delivery dates against the local calendar). */
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("atlas-erp-db") || "{}"));
const uiVersion = (page) => page.evaluate(() => localStorage.getItem("atlas-ui-version"));
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
const alerts = async (page) => (await page.getByRole("alert").allInnerTexts()).map((t) => t.trim());
/** Exact label match that tolerates the aria-hidden required asterisk ("Description*"): the accessible name stays "Description". */
const lbl = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`);
const noOverflow = (page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));

const CONTEXT = {
  description: "Standing desks for the Berlin office",
  costCenter: "CC-1200 Facilities",
  materialGroup: "Office equipment",
  itemDescription: "Height-adjustable desk 160 cm",
  quantity: "8",
  unitPrice: "640",
  justification:
    "The Berlin office is adding eight desks for the new support team. Standing desks were requested by the team after the ergonomics review and match the standard already used in Munich.",
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const stepText = () => page.locator("form p", { hasText: /^Step \d of \d/ }).first().innerText();
  try {
    await page.goto(`${BASE}/sandbox/erp`, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    // ───────── 1. Launchpad (v1) ─────────
    await page.getByRole("heading", { level: 1, name: "Home" }).waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.title === "Home · Atlas ERP", null, { timeout: 10000 }).catch(() => {});
    record("launchpad renders with the document title 'Home · Atlas ERP'", (await page.title()) === "Home · Atlas ERP", await page.title());
    const a11y = await page.locator("main").ariaSnapshot();
    record("launchpad tiles expose plain link names in the accessibility tree", /link "Create Purchase Requisition"/.test(a11y) && /link "My Purchase Requisitions"/.test(a11y) && /link "Approve Requisitions"/.test(a11y), (a11y.match(/link "[^"]+"/g) || []).slice(0, 6).join(", "));
    const shell = await page.locator("header").first().innerText();
    record("shell bar shows the product name, Release 24.1 and the signed-in user", /Atlas ERP/.test(shell) && /Release 24\.1/.test(shell) && /Lena Hoffmann/.test(shell), oneLine(shell));
    const groups = await page.locator("main h2").allInnerTexts();
    record("tile groups Procurement, Supplier Management, Finance, Settings", ["Procurement", "Supplier Management", "Finance", "Settings"].every((g) => groups.includes(g)), groups.join(", "));
    const tileNames = ["My Purchase Requisitions", "Create Purchase Requisition", "Approve Requisitions", "Manage Suppliers", "Cost Centers", "Settings"];
    const tileCounts = await Promise.all(tileNames.map((n) => page.getByRole("link", { name: n, exact: true }).count()));
    record("six launchpad tiles are links with plain accessible names", tileCounts.every((c) => c === 1), tileNames.map((n, i) => `${n}=${tileCounts[i]}`).join(" · "));
    const footer = await page.locator("footer").innerText();
    record("footer carries the replica disclaimer", /Replica of an enterprise-ERP pattern built for demonstration\. Not affiliated with any vendor\./.test(footer), oneLine(footer).slice(0, 120));
    const seed = await db(page);
    record("localStorage atlas-erp-db seeded: 12 requisitions PR-8001…PR-8012, 10 suppliers, 8 cost centers", seed.requisitions?.length === 12 && seed.requisitions[0].id === "PR-8001" && seed.requisitions[11].id === "PR-8012" && seed.suppliers?.length === 10 && seed.costCenters?.length === 8, `${seed.requisitions?.length} / ${seed.suppliers?.length} / ${seed.costCenters?.length}`);
    const statuses = new Set((seed.requisitions || []).map((r) => r.status));
    record("seed covers Draft, Submitted, Approved and Returned", ["Draft", "Submitted", "Approved", "Returned"].every((s) => statuses.has(s)), [...statuses].join(", "));
    await shot(page, "01-launchpad");

    // ───────── 2. v1 wizard: validation, Previous, success ─────────
    await page.getByRole("link", { name: "Create Purchase Requisition", exact: true }).click();
    await page.waitForURL(/\/sandbox\/erp\/requisitions\/new$/);
    await page.getByRole("heading", { level: 1, name: "Create Purchase Requisition" }).waitFor();
    record("tile opens the wizard at Step 1 of 4 · General", /^Step 1 of 4 · General/.test(await stepText()), await stepText());
    record("v1 form fields use the at- id prefix", (await page.locator("#at-description").count()) === 1 && (await page.locator("#ax-description").count()) === 0);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a1 = await alerts(page);
    record("empty General step shows three alerts", a1.includes("Enter a description") && a1.includes("Select a cost center") && a1.includes("Select a material group"), a1.join(" | "));
    await page.getByLabel(lbl("Description")).fill(CONTEXT.description);
    await page.getByLabel(lbl("Cost center")).selectOption({ label: CONTEXT.costCenter });
    await page.getByLabel(lbl("Material group")).selectOption({ label: CONTEXT.materialGroup });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    record("General → Step 2 of 4 · Items", /^Step 2 of 4 · Items/.test(await stepText()), await stepText());
    await page.getByLabel(lbl("Item description")).fill(CONTEXT.itemDescription);
    await page.getByLabel(lbl("Quantity")).fill(CONTEXT.quantity);
    await page.getByLabel(lbl("Unit price")).fill(CONTEXT.unitPrice);
    await page.getByLabel(lbl("Requested delivery date")).fill(inDays(3));
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a2 = await alerts(page);
    record("delivery date 3 days out → 'Delivery date must be at least 10 days from today', still on Items", a2.includes("Delivery date must be at least 10 days from today") && /^Step 2 of 4/.test(await stepText()), a2.join(" | "));
    record("invalid date field is marked aria-invalid", (await page.getByLabel(lbl("Requested delivery date")).getAttribute("aria-invalid")) === "true");
    await shot(page, "02-items-validation");
    const deliveryDate = inDays(14);
    await page.getByLabel(lbl("Requested delivery date")).fill(deliveryDate);
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    record("'Add item' adds a second line with its own labelled fields", (await page.getByLabel(lbl("Item description (line 2)")).count()) === 1);
    await page.getByRole("button", { name: "Remove line 2", exact: true }).click();
    record("'Remove line 2' takes the second line away again", (await page.getByLabel(lbl("Item description (line 2)")).count()) === 0);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    record("Items → Step 3 of 4 · Justification", /^Step 3 of 4 · Justification/.test(await stepText()), await stepText());
    await page.getByLabel(lbl("Business justification")).fill("Needed for the new support team.");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const a3 = await alerts(page);
    record("one-sentence justification → 'Write at least two sentences'", a3.includes("Write at least two sentences") && /^Step 3 of 4/.test(await stepText()), a3.join(" | "));
    await page.getByLabel(lbl("Business justification")).fill(CONTEXT.justification);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    record("Justification → Step 4 of 4 · Review", /^Step 4 of 4 · Review/.test(await stepText()), await stepText());
    const reviewTotal = await dlValue(page, "Total value");
    const reviewItems = await dlValue(page, "Items");
    record("review summary shows the total value and the item line", reviewTotal === "€5,120.00" && reviewItems === `${CONTEXT.itemDescription} · 8 × €640.00 · ${deliveryDate}`, `${reviewTotal} · ${reviewItems}`);
    // Previous walks back through the wizard (Synforma's rollback relies on it) and keeps the values.
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    const keptJustification = await page.getByLabel(lbl("Business justification")).inputValue();
    record("Previous returns to Step 3 with the justification kept", /^Step 3 of 4/.test(await stepText()) && keptJustification === CONTEXT.justification);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    const keptPrice = await page.getByLabel(lbl("Unit price")).inputValue();
    record("Previous again returns to Step 2 with the unit price kept", /^Step 2 of 4/.test(await stepText()) && keptPrice === CONTEXT.unitPrice);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel(lbl("This requisition is not split to stay under an approval limit")).check();
    await shot(page, "03-review-v1");
    const submitBtn = page.getByRole("button", { name: "Submit", exact: true });
    record("footer action bar has the primary 'Submit' button", (await submitBtn.count()) === 1 && (await submitBtn.getAttribute("type")) === "submit");
    await submitBtn.click();
    await page.waitForURL(/\/sandbox\/erp\/requisitions\/PR-8013(\?created=1)?$/, { timeout: 30000 });
    const outcomeUrl = page.url();
    await page.getByRole("status").filter({ hasText: "Requisition submitted for approval" }).waitFor({ timeout: 10000 });
    record("Submit navigates to /sandbox/erp/requisitions/PR-8013 with the 'Requisition submitted for approval' banner", /\/requisitions\/PR-8013/.test(outcomeUrl), outcomeUrl);
    const h1 = await page.getByRole("heading", { level: 1 }).innerText();
    const outcome = {
      requisition: await dlValue(page, "Requisition"),
      description: await dlValue(page, "Description"),
      costCenter: await dlValue(page, "Cost center"),
      materialGroup: await dlValue(page, "Material group"),
      items: await dlValue(page, "Items"),
      justification: await dlValue(page, "Business justification"),
      total: await dlValue(page, "Total value"),
      split: await dlValue(page, "Split declaration"),
      status: await dlValue(page, "Status"),
      created: await dlValue(page, "Created"),
    };
    record("outcome page heading is 'Purchase Requisition PR-8013'", h1 === "Purchase Requisition PR-8013", h1);
    record("outcome details: Requisition, Description, Cost center, Material group", outcome.requisition === "PR-8013" && outcome.description === CONTEXT.description && outcome.costCenter === CONTEXT.costCenter && outcome.materialGroup === CONTEXT.materialGroup, JSON.stringify([outcome.requisition, outcome.description, outcome.costCenter, outcome.materialGroup]));
    record("outcome details: Items line (description · quantity × unit price · delivery date)", outcome.items === `${CONTEXT.itemDescription} · 8 × €640.00 · ${deliveryDate}`, outcome.items);
    record("outcome details: Business justification, Total value, Split declaration, Status, Created", outcome.justification === CONTEXT.justification && outcome.total === "€5,120.00" && outcome.split === "Confirmed not split" && outcome.status === "Submitted" && outcome.created === inDays(0), JSON.stringify([outcome.total, outcome.split, outcome.status, outcome.created]));
    const stored = await db(page);
    const pr13 = (stored.requisitions || []).find((r) => r.id === "PR-8013");
    record("PR-8013 persisted in localStorage as Submitted with one item and the history", Boolean(pr13) && pr13.status === "Submitted" && pr13.items.length === 1 && pr13.items[0].quantity === 8 && pr13.items[0].unitPrice === 640 && pr13.history.map((h) => h.action).join(",") === "Created,Submitted", pr13 ? `${pr13.status} · ${pr13.items.length} item` : "missing");
    await shot(page, "04-outcome-v1");
    await page.getByRole("tab", { name: "Items" }).click();
    const itemsTable = await page.getByRole("table", { name: "Requisition items" }).innerText();
    record("Items tab lists the line with quantity, unit price and delivery date", /Height-adjustable desk 160 cm/.test(itemsTable) && /€640\.00/.test(itemsTable) && itemsTable.includes(deliveryDate), oneLine(itemsTable).slice(0, 140));
    await page.getByRole("tab", { name: "Approval history" }).click();
    const historyText = await page.getByRole("tabpanel").innerText();
    record("Approval history tab shows Created and Submitted by Lena Hoffmann", /Created/.test(historyText) && /Submitted/.test(historyText) && /Lena Hoffmann/.test(historyText), oneLine(historyText).slice(0, 120));
    await page.getByRole("link", { name: "My Purchase Requisitions", exact: true }).first().click();
    await page.waitForURL(/\/sandbox\/erp\/requisitions$/);
    await page.getByRole("heading", { level: 1, name: "My Purchase Requisitions" }).waitFor();
    const rowsBefore = await page.locator("table tbody tr").count();
    await page.getByLabel(lbl("Status")).selectOption("Submitted");
    await page.getByLabel(lbl("Cost center")).selectOption({ label: "CC-1200 Facilities" });
    const filtered = await page.locator("table tbody tr").allInnerTexts();
    record("list report filter bar (Status, Cost center) narrows the table", rowsBefore === 13 && filtered.length === 2 && filtered.some((t) => /PR-8013/.test(t)) && filtered.every((t) => /Submitted/.test(t) && /CC-1200/.test(t)), `${rowsBefore} rows → ${filtered.length}`);
    await page.getByRole("row", { name: /PR-8013/ }).click();
    await page.waitForURL(/\/requisitions\/PR-8013$/);
    record("clicking a list row opens the object page", true);

    // ───────── 3. Vendor update: v2 via /sandbox/erp/settings?ui=v2 ─────────
    await page.goto(`${BASE}/sandbox/erp/settings?ui=v2`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !location.search.includes("ui="), null, { timeout: 10000 });
    const sw = page.getByRole("switch", { name: /Simulate vendor update/ });
    record("?ui=v2 stores atlas-ui-version=v2, strips the parameter and turns the settings switch on", (await uiVersion(page)) === "v2" && !/ui=/.test(page.url()) && (await sw.getAttribute("aria-checked")) === "true", `${await uiVersion(page)} · ${page.url()}`);
    record("shell bar now reads Release 24.2 preview", /Release 24\.2 preview/.test(await page.locator("header").first().innerText()));
    await page.goto(`${BASE}/sandbox/erp`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Home" }).waitFor();
    record("v2 launchpad renames the tile to 'New Requisition' and 'Cost Centres'", (await page.getByRole("link", { name: "New Requisition", exact: true }).count()) === 1 && (await page.getByRole("link", { name: "Create Purchase Requisition", exact: true }).count()) === 0 && (await page.getByRole("link", { name: "Cost Centres", exact: true }).count()) === 1);
    await shot(page, "05-launchpad-v2");
    await page.getByRole("link", { name: "New Requisition", exact: true }).click();
    await page.waitForURL(/\/requisitions\/new$/);
    await page.getByRole("heading", { level: 1, name: "New Requisition" }).waitFor();
    record("v2 wizard has three steps: Step 1 of 3 · General", /^Step 1 of 3 · General/.test(await stepText()), await stepText());
    record("v2 form fields use the ax- id prefix", (await page.locator("#ax-description").count()) === 1 && (await page.locator("#at-description").count()) === 0);
    record("v2 renames 'Cost center' to 'Cost centre'", (await page.getByLabel(lbl("Cost centre")).count()) === 1 && (await page.getByLabel(lbl("Cost center")).count()) === 0);
    await page.getByLabel(lbl("Description")).fill(CONTEXT.description);
    await page.getByLabel(lbl("Cost centre")).selectOption({ label: CONTEXT.costCenter });
    await page.getByLabel(lbl("Material group")).selectOption({ label: CONTEXT.materialGroup });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    record("v2 'Continue' → Step 2 of 3 · Items", /^Step 2 of 3 · Items/.test(await stepText()), await stepText());
    const headers = await page.locator("table thead th").allInnerTexts();
    record("v2 item table gains the 'Line total' column", headers.includes("Line total"), headers.filter(Boolean).join(" | "));
    await page.getByLabel(lbl("Item description")).fill(CONTEXT.itemDescription);
    await page.getByLabel(lbl("Quantity")).fill(CONTEXT.quantity);
    await page.getByLabel(lbl("Unit price")).fill(CONTEXT.unitPrice);
    await page.getByLabel(lbl("Requested delivery date")).fill(inDays(2));
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    record("v2 keeps the 10-day delivery validation", (await alerts(page)).includes("Delivery date must be at least 10 days from today"));
    await page.getByLabel(lbl("Requested delivery date")).fill(deliveryDate);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    record("v2 Items → Step 3 of 3 · Review with Summary and Justification tabs", /^Step 3 of 3 · Review/.test(await stepText()) && (await page.getByRole("tab", { name: "Summary" }).count()) === 1 && (await page.getByRole("tab", { name: "Justification" }).count()) === 1, await stepText());
    await page.getByRole("tab", { name: "Justification" }).click();
    await page.getByRole("tabpanel", { name: "Justification" }).getByLabel(lbl("Justification")).fill("Needed for the new support team.");
    await page.getByRole("button", { name: "Order", exact: true }).click();
    const a4 = await alerts(page);
    record("v2 'Order' with a one-sentence justification → 'Write at least two sentences' inside the Justification tab", a4.includes("Write at least two sentences") && (await page.getByRole("tab", { name: "Justification" }).getAttribute("aria-selected")) === "true", a4.join(" | "));
    await page.getByRole("tabpanel", { name: "Justification" }).getByLabel(lbl("Justification")).fill(CONTEXT.justification);
    await page.getByRole("tab", { name: "Summary" }).click();
    record("Summary tab shows the justification just entered", (await dlValue(page, "Justification")) === CONTEXT.justification);
    await page.getByLabel(lbl("This requisition is not split to stay under an approval limit")).check();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    record("v2 'Back' returns to Step 2 with the values kept", /^Step 2 of 3/.test(await stepText()) && (await page.getByLabel(lbl("Quantity")).inputValue()) === "8");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await shot(page, "06-review-v2");
    await page.getByRole("button", { name: "Order", exact: true }).click();
    await page.waitForURL(/\/sandbox\/erp\/requisitions\/PR-8014(\?created=1)?$/, { timeout: 30000 });
    await page.getByRole("status").filter({ hasText: "Requisition submitted for approval" }).waitFor({ timeout: 10000 });
    const v2 = { costCentre: await dlValue(page, "Cost centre"), justification: await dlValue(page, "Justification"), total: await dlValue(page, "Total value"), status: await dlValue(page, "Status"), items: await dlValue(page, "Items") };
    record("v2 'Order' creates PR-8014 with the same data and outcome (Cost centre, Justification, Total value, Submitted)", v2.costCentre === CONTEXT.costCenter && v2.justification === CONTEXT.justification && v2.total === "€5,120.00" && v2.status === "Submitted" && v2.items === `${CONTEXT.itemDescription} · 8 × €640.00 · ${deliveryDate}`, JSON.stringify(v2));
    await shot(page, "07-outcome-v2");

    // ───────── 4. Small workflow A: Return a requisition with a comment (back on v1) ─────────
    await page.goto(`${BASE}/sandbox/erp/settings?ui=v1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !location.search.includes("ui="), null, { timeout: 10000 });
    record("?ui=v1 switches back to Release 24.1", (await uiVersion(page)) === "v1");
    await page.goto(`${BASE}/sandbox/erp/approvals`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Approve Requisitions" }).waitFor();
    const waiting = await page.getByRole("table", { name: "Requisitions waiting for approval" }).locator("tbody tr").count();
    record("Approve Requisitions lists the six submitted requisitions (4 seeded + PR-8013 + PR-8014)", waiting === 6, `${waiting} rows`);
    await page.getByRole("button", { name: "Actions for PR-8003", exact: true }).click();
    await page.getByRole("menuitem", { name: "Return with comment", exact: true }).click();
    const returnDialog = page.getByRole("dialog", { name: "Return requisition" });
    await returnDialog.waitFor({ timeout: 10000 });
    await returnDialog.getByRole("button", { name: "Return", exact: true }).click();
    record("Return without a comment → 'Enter a comment for the requester'", (await alerts(page)).includes("Enter a comment for the requester"));
    await returnDialog.getByLabel(lbl("Return comment")).fill("Please add the licence count per designer and the renewal date before resubmitting.");
    await returnDialog.getByRole("button", { name: "Return", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Requisition returned" }).waitFor({ timeout: 10000 });
    const waitingAfter = await page.getByRole("table", { name: "Requisitions waiting for approval" }).locator("tbody tr").allInnerTexts();
    const decidedText = await page.getByRole("table", { name: "Recently decided requisitions" }).innerText();
    record("PR-8003 leaves the waiting list and appears under Recently decided as Returned with the comment", !waitingAfter.some((t) => /PR-8003/.test(t)) && /PR-8003/.test(decidedText) && /Returned/.test(decidedText) && /licence count per designer/.test(decidedText), oneLine(decidedText).slice(0, 160));
    await shot(page, "08-approvals-returned");
    await page.goto(`${BASE}/sandbox/erp/requisitions/PR-8003`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Purchase Requisition PR-8003" }).waitFor();
    const pr3status = await dlValue(page, "Status");
    await page.getByRole("tab", { name: "Approval history" }).click();
    const pr3history = await page.getByRole("tabpanel").innerText();
    record("PR-8003 object page: status Returned, history shows the return comment, footer offers Resubmit", pr3status === "Returned" && /Returned/.test(pr3history) && /licence count per designer/.test(pr3history) && (await page.getByRole("button", { name: "Resubmit", exact: true }).count()) === 1, `${pr3status} · ${oneLine(pr3history).slice(0, 120)}`);
    // Approve PR-8013 from its object page footer action bar.
    await page.goto(`${BASE}/sandbox/erp/requisitions/PR-8013`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Purchase Requisition PR-8013" }).waitFor();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const approveDialog = page.getByRole("dialog", { name: "Approve requisition" });
    await approveDialog.waitFor({ timeout: 10000 });
    await approveDialog.getByLabel(lbl("Approval comment")).fill("Complete on first review.");
    await approveDialog.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Requisition approved" }).waitFor({ timeout: 10000 });
    record("PR-8013 approved from the object page: Status Approved", (await dlValue(page, "Status")) === "Approved" && ((await db(page)).requisitions.find((r) => r.id === "PR-8013") || {}).status === "Approved");

    // ───────── 5. Small workflow B: Update a supplier's payment terms with a reason ─────────
    await page.goto(`${BASE}/sandbox/erp/suppliers`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Manage Suppliers" }).waitFor();
    await page.getByLabel(lbl("Category")).selectOption("IT hardware");
    const supplierRows = await page.locator("table tbody tr").allInnerTexts();
    record("Manage Suppliers filter bar narrows to the two IT hardware suppliers", supplierRows.length === 2 && supplierRows.every((t) => /IT hardware/.test(t)), `${supplierRows.length} rows`);
    await page.getByRole("row", { name: /SUP-1002/ }).click();
    await page.waitForURL(/\/suppliers\/SUP-1002$/);
    await page.getByRole("heading", { level: 1, name: "Brightbyte Systems AG" }).waitFor();
    await page.getByRole("button", { name: "Edit payment terms", exact: true }).click();
    const termsDialog = page.getByRole("dialog", { name: "Edit payment terms" });
    await termsDialog.waitFor({ timeout: 10000 });
    await termsDialog.getByRole("button", { name: "Save", exact: true }).click();
    record("Save without a reason → 'Enter a reason for the change'", (await alerts(page)).includes("Enter a reason for the change"));
    await termsDialog.getByLabel(lbl("Payment terms")).selectOption("Net 30");
    await termsDialog.getByLabel(lbl("Reason")).fill("Aligned with the framework agreement renewed in September.");
    await termsDialog.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Payment terms updated" }).waitFor({ timeout: 10000 });
    await page.getByRole("tab", { name: "Payment terms" }).click();
    const termsNow = await dlValue(page, "Payment terms");
    const reasonNow = await dlValue(page, "Last change reason");
    await page.getByRole("tab", { name: "Change log" }).click();
    const changeLog = await page.getByRole("table", { name: "Supplier change log" }).innerText();
    const sup2 = (await db(page)).suppliers.find((s) => s.id === "SUP-1002");
    record("payment terms updated to Net 30 with the reason in the Payment terms tab and the change log", termsNow === "Net 30" && /framework agreement/.test(reasonNow || "") && /Net 45/.test(changeLog) && /Net 30/.test(changeLog) && sup2.paymentTerms === "Net 30" && sup2.changes.length === 1, `${termsNow} · ${reasonNow}`);
    await shot(page, "09-supplier-terms");

    // ───────── 6. Cost centers + Reset demo data ─────────
    await page.goto(`${BASE}/sandbox/erp/cost-centers`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Cost Centers" }).waitFor();
    const ccRows = await page.locator("table tbody tr").allInnerTexts();
    record("Cost Centers list shows the eight cost centers with budgets and commitments", ccRows.length === 8 && ccRows.some((t) => /CC-1200/.test(t) && /Facilities/.test(t) && /€/.test(t)), `${ccRows.length} rows`);
    await page.goto(`${BASE}/sandbox/erp/settings`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reset demo data", exact: true }).click();
    const resetDialog = page.getByRole("dialog", { name: "Reset demo data" });
    await resetDialog.waitFor({ timeout: 10000 });
    await resetDialog.getByRole("button", { name: "Reset data", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Demo data has been reset." }).waitFor({ timeout: 10000 });
    const afterReset = await db(page);
    record("Reset demo data restores 12 requisitions and the supplier's original terms", afterReset.requisitions.length === 12 && !afterReset.requisitions.some((r) => r.id === "PR-8013") && afterReset.suppliers.find((s) => s.id === "SUP-1002").paymentTerms === "Net 45" && afterReset.requisitions.find((r) => r.id === "PR-8003").status === "Submitted", `${afterReset.requisitions.length} requisitions`);
    await page.goto(`${BASE}/sandbox/erp/requisitions/PR-8013`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Requisition not found" }).waitFor({ timeout: 10000 });
    record("pre-generated route for a record that no longer exists renders 'Requisition not found'", true);

    // ───────── 7. 390 px viewport: no horizontal overflow ─────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/sandbox/erp`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Home" }).waitFor();
    const w1 = await noOverflow(page);
    await shot(page, "10-mobile-launchpad");
    await page.goto(`${BASE}/sandbox/erp/requisitions/new`, { waitUntil: "networkidle" });
    await page.getByLabel(lbl("Description")).fill("Mobile check");
    await page.getByLabel(lbl("Cost center")).selectOption({ label: "CC-1300 IT Operations" });
    await page.getByLabel(lbl("Material group")).selectOption("IT hardware");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel(lbl("Item description")).waitFor();
    const w2 = await noOverflow(page);
    await shot(page, "11-mobile-items");
    await page.goto(`${BASE}/sandbox/erp/requisitions/PR-8001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    const w3 = await noOverflow(page);
    record("390px viewport: launchpad, wizard Items step and object page have no horizontal overflow", w1.scroll <= w1.inner && w2.scroll <= w2.inner && w3.scroll <= w3.inner, JSON.stringify({ w1, w2, w3 }));
  } catch (e) {
    record("script", false, e.stack || String(e));
    try {
      await shot(page, "99-failure");
    } catch {}
  } finally {
    const pageErrors = consoleErrors.filter((e) => !/Download the React DevTools/i.test(e));
    record("zero console/page errors", pageErrors.length === 0, pageErrors.length ? pageErrors.slice(0, 5).join(" || ") : "none");
    console.log("\nConsole/page errors:", pageErrors.length ? pageErrors.slice(0, 10) : "none");
    const failed = results.filter((r) => !r.ok).length;
    console.log("\nSUMMARY:", results.filter((r) => r.ok).length, "passed,", failed, "failed");
    process.exitCode = failed ? 1 : 0;
    await browser.close();
  }
})();
