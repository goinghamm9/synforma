// Ledgerline Billing sandbox: drives the refund workflow by hand in v1 (validation errors, Back, success, outcome
// values), switches to v2 via /sandbox/billing/settings?ui=v2 and repeats it with the renamed/restructured controls,
// issues three more partial refunds until PAY-3001 ($480.00) is fully refunded, checks the two small dialog workflows
// (pause a subscription, mark an invoice as paid), Reset demo data, "not found"
// routes and a 390 px viewport without horizontal overflow. Zero console/page errors expected.
// Run from synforma/: CHROMIUM_PATH=/path/to/chrome node verify/sandbox-billing.spec.js (dev server on :3000).
const path = require("path");
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const APP = `${BASE}/sandbox/billing`;
const OUT = path.join(__dirname, "..", ".verify");
require("fs").mkdirSync(OUT, { recursive: true });
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `billing-${name}.png`), fullPage: false });
}
const oneLine = (t) => t.replace(/\s*\n\s*/g, " | ");
/** First <dl> on the page (or inside `scope`) as { label: value }. */
const dlRows = (scope) =>
  scope
    .locator("dl")
    .first()
    .evaluate((dl) => {
      const out = {};
      dl.querySelectorAll("dt").forEach((dt) => {
        out[dt.textContent.trim()] = dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : "";
      });
      return out;
    });
const alertText = (page) => page.getByRole("alert").first().innerText();
const NOTE = "We have refunded this charge in full. You will see it on your statement within 5 business days.";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console: ${m.text().slice(0, 300)}`);
  });
  try {
    // ───────────── Fresh v1 workspace ─────────────
    await page.goto(`${APP}/settings?ui=v1`, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => {
      localStorage.removeItem("ledgerline-billing-db");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor({ timeout: 30000 });
    const header = await page.locator("header").innerText();
    record("v1 header shows the brand, v3.8 and the signed-in user", /Ledgerline Billing/.test(header) && /v3\.8/.test(header) && !/preview/.test(header) && /Dana Whitfield/.test(header), oneLine(header));
    const footer = await page.locator("footer").innerText();
    record("footer carries the replica disclaimer", /Replica of a billing-dashboard pattern built for demonstration\. Not affiliated with any vendor\./.test(footer), oneLine(footer).slice(0, 120));
    const navLinks = await page.locator('nav[aria-label="Primary"] a').allInnerTexts();
    record("v1 sidebar lists the seven sections without a group header", navLinks.map((t) => t.trim()).join(",") === "Home,Customers,Payments,Invoices,Refunds,Disputes,Settings" && (await page.locator('nav[aria-label="Primary"]').innerText()).indexOf("Money movement") === -1, navLinks.join(","));
    record("version switch is off in v1", (await page.locator("#ui-version-switch").getAttribute("aria-checked")) === "false");
    await shot(page, "01-settings-v1");

    // Home
    await page.goto(`${APP}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    const homeText = await page.locator("main").innerText();
    record("home shows KPIs and recent payments", /Gross volume/i.test(homeText) && /Open disputes/i.test(homeText) && /PAY-30\d\d/.test(homeText), oneLine(homeText).slice(0, 100));
    await shot(page, "02-home");

    // Payments list filter
    await page.goto(`${APP}/payments`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Payments" }).waitFor();
    const allRows = await page.locator("tbody tr").count();
    await page.getByLabel("Status").selectOption("Failed");
    const failedRows = await page.locator("tbody tr").count();
    record("payments list filters by status", allRows === 20 && failedRows === 1, `all=${allRows} failed=${failedRows}`);
    await page.getByLabel("Status").selectOption("All");
    await page.getByLabel("Dispute").selectOption("Disputed");
    const disputedRows = await page.locator("tbody tr").count();
    record("at least four seeded payments carry a dispute", disputedRows >= 5, `disputed=${disputedRows}`);

    // ───────────── Entry record ─────────────
    await page.goto(`${APP}/payments/PAY-3001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "$480.00" }).waitFor({ timeout: 30000 });
    const entryHeader = await page.locator("main").innerText();
    const overview0 = await dlRows(page);
    record("PAY-3001 is a $480.00 succeeded payment with an open dispute", /Dispute · Open/.test(entryHeader) && overview0["Amount"] === "$480.00" && overview0["Status"] === "Succeeded" && overview0["Dispute status"] === "Open" && /^\d+ days$/.test(overview0["Charge age"] || ""), `age=${overview0["Charge age"]} dispute=${overview0["Dispute status"]}`);
    const tabs = await page.getByRole("tab").allInnerTexts();
    record("payment page has Overview / Timeline / Dispute tabs", tabs.join(",") === "Overview,Timeline,Dispute", tabs.join(","));
    await page.getByRole("tab", { name: "Dispute" }).click();
    const disputeRows = await dlRows(page.getByRole("tabpanel"));
    record("dispute tab shows the dispute record on the full charge", disputeRows["Dispute ID"] === "DP-9001" && disputeRows["Dispute status"] === "Open" && disputeRows["Amount disputed"] === "$480.00" && disputeRows["Case reference"] === "—", JSON.stringify(disputeRows).slice(0, 160));
    await page.getByRole("tab", { name: "Overview" }).click();
    await shot(page, "03-payment-v1");

    // ───────────── v1 refund wizard ─────────────
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Refund payment" }).click();
    await page.waitForURL(/\/sandbox\/billing\/payments\/PAY-3001\/refund$/);
    await page.getByText("Step 1 of 4 · Amount and reason").waitFor();
    record("Actions → Refund payment opens the wizard on its own route", (await page.getByRole("heading", { level: 1 }).innerText()) === "Refund payment" && (await page.locator("#fld-amount").count()) === 1, page.url());
    record("Amount is prefilled with the remaining charge amount", (await page.getByRole("textbox", { name: "Amount", exact: true }).inputValue()) === "480.00");
    const reasonOptions = await page.getByRole("combobox", { name: "Refund reason", exact: true }).locator("option").allInnerTexts();
    record("Refund reason offers exactly the three reasons", reasonOptions.slice(1).join("|") === "Duplicate|Fraudulent|Requested by customer", reasonOptions.join("|"));
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("500.00");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const amountError = await alertText(page);
    record("amount above the charge is rejected", amountError === "Amount cannot exceed the original charge" && (await page.getByRole("textbox", { name: "Amount", exact: true }).getAttribute("aria-invalid")) === "true", amountError);
    await shot(page, "04-wizard-amount-error");
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("120.00");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const reasonError = await alertText(page);
    record("missing reason is rejected", reasonError === "Select a refund reason", reasonError);
    await page.getByRole("combobox", { name: "Refund reason", exact: true }).selectOption("Requested by customer");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 4 · Customer note").waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const noteError = await alertText(page);
    record("step 2 requires the note to the customer", noteError === "Enter a note to the customer", noteError);
    await page.getByRole("textbox", { name: "Note to customer", exact: true }).fill(NOTE);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 3 of 4 · Case details").waitFor();
    await page.getByRole("textbox", { name: "Case reference", exact: true }).fill("4471");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const caseError = await alertText(page);
    record("wrong case reference format is rejected", caseError === "Enter the case reference as CS-1234", caseError);
    await shot(page, "05-wizard-case-error");
    await page.getByRole("textbox", { name: "Case reference", exact: true }).fill("CS-4471");
    const disputeOptions = await page.getByRole("combobox", { name: "Dispute status", exact: true }).locator("option").allInnerTexts();
    record("Dispute status offers Open / Under review / Resolved and defaults to the current status", disputeOptions.join("|") === "Open|Under review|Resolved" && (await page.getByRole("combobox", { name: "Dispute status", exact: true }).inputValue()) === "Open", disputeOptions.join("|"));
    await page.getByRole("combobox", { name: "Dispute status", exact: true }).selectOption("Resolved");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor();
    // Back keeps the values
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByText("Step 3 of 4 · Case details").waitFor();
    record("Back returns to the previous step with values kept", (await page.getByRole("textbox", { name: "Case reference", exact: true }).inputValue()) === "CS-4471" && (await page.getByRole("combobox", { name: "Dispute status", exact: true }).inputValue()) === "Resolved");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 4 of 4 · Review").waitFor();
    const review = await dlRows(page.locator("form"));
    record("review summarizes every value", review["Original charge"] === "$480.00" && review["Amount"] === "$120.00" && review["Refund reason"] === "Requested by customer" && review["Note to customer"] === NOTE && review["Case reference"] === "CS-4471" && review["Dispute status"] === "Resolved", JSON.stringify(review).slice(0, 200));
    await page.getByRole("button", { name: "Issue refund" }).click();
    const confirmError = await alertText(page);
    record("issuing without the policy confirmation is rejected", confirmError === "Confirm that the refund follows the refund policy", confirmError);
    await page.getByRole("checkbox", { name: "I confirm this refund follows the refund policy", exact: true }).check();
    await shot(page, "06-wizard-review-v1");
    await page.getByRole("button", { name: "Issue refund" }).click();
    await page.waitForURL(/\/sandbox\/billing\/refunds\/RF-5001/, { timeout: 30000 });
    await page.getByRole("heading", { level: 1, name: "Refund RF-5001" }).waitFor();
    const banner = await page.getByRole("status").first().innerText();
    record("outcome page shows the Refund issued banner", /Refund issued/.test(banner), oneLine(banner));
    const outcome = await dlRows(page);
    record(
      "outcome details carry all five requirements",
      outcome["Refund ID"] === "RF-5001" && outcome["Payment"] === "PAY-3001" && outcome["Amount"] === "$120.00" && outcome["Refund reason"] === "Requested by customer" && outcome["Note to customer"] === NOTE && outcome["Case reference"] === "CS-4471" && outcome["Dispute status"] === "Resolved" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(outcome["Created"] || ""),
      JSON.stringify(outcome).slice(0, 260),
    );
    await shot(page, "07-refund-outcome-v1");
    await page.waitForTimeout(300);
    record("?created=1 is removed from the URL after showing the banner", !/created=1/.test(page.url()), page.url());

    // Payment reflects the refund
    await page.goto(`${APP}/payments/PAY-3001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "$480.00" }).waitFor();
    const afterText = await page.locator("main").innerText();
    const overview1 = await dlRows(page);
    record("after one refund the payment is Partially refunded ($120.00 of $480.00), the dispute Resolved, the refund listed", overview1["Status"] === "Partially refunded" && overview1["Dispute status"] === "Resolved" && overview1["Refunded amount"] === "$120.00" && /Dispute · Resolved/.test(afterText) && /RF-5001/.test(afterText), `status=${overview1["Status"]} refunded=${overview1["Refunded amount"]}`);
    await page.getByRole("tab", { name: "Dispute" }).click();
    const disputeRows1 = await dlRows(page.getByRole("tabpanel"));
    record("dispute record carries the case reference", disputeRows1["Case reference"] === "CS-4471" && disputeRows1["Dispute status"] === "Resolved", JSON.stringify(disputeRows1).slice(0, 160));
    await page.getByRole("tab", { name: "Timeline" }).click();
    const timeline = await page.getByRole("tabpanel").innerText();
    record("timeline logs the refund, the dispute change and the case reference", /Refund RF-5001/.test(timeline) && /Open to Resolved/.test(timeline) && /CS-4471/.test(timeline), oneLine(timeline).slice(0, 160));
    await page.getByRole("button", { name: "Actions" }).click();
    const refundItemDisabled = await page.getByRole("menuitem", { name: "Refund payment" }).getAttribute("data-disabled");
    record("Refund payment stays enabled while an amount remains", refundItemDisabled === null);
    await page.keyboard.press("Escape");
    await page.goto(`${APP}/refunds`, { waitUntil: "networkidle" });
    const refundsList = await page.locator("main").innerText();
    record("refunds list includes the new refund and the seeded ones", /RF-5001/.test(refundsList) && /RF-4998/.test(refundsList) && /RF-5000/.test(refundsList));

    // ───────────── v2 vendor update ─────────────
    await page.goto(`${APP}/settings?ui=v2`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
    await page.locator("header", { hasText: "v3.9 preview" }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    record("?ui=v2 switches the version and strips the parameter", /v3\.9 preview/.test(await page.locator("header").innerText()) && !/ui=v2/.test(page.url()) && (await page.locator("#ui-version-switch").getAttribute("aria-checked")) === "true", page.url());
    const navText = await page.locator('nav[aria-label="Primary"]').innerText();
    record("v2 sidebar gains a group header", /Money movement/i.test(navText) && /Workspace/i.test(navText), oneLine(navText));
    // Reset demo data
    await page.getByRole("button", { name: "Reset demo data" }).click();
    const resetDialog = page.getByRole("dialog", { name: "Reset demo data" });
    await resetDialog.waitFor();
    await resetDialog.getByRole("button", { name: "Reset data" }).click();
    await page.getByRole("status").filter({ hasText: "Demo data has been reset." }).waitFor();
    await page.goto(`${APP}/refunds/RF-5001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    record("reset removes the created refund (RF-5001 not found)", (await page.getByRole("heading", { level: 1 }).innerText()) === "Refund not found");
    await shot(page, "08-settings-v2");

    await page.goto(`${APP}/payments/PAY-3001`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "$480.00" }).waitFor();
    const overview2 = await dlRows(page);
    record("after reset PAY-3001 is Succeeded with an open dispute again", overview2["Status"] === "Succeeded" && overview2["Dispute status"] === "Open" && overview2["Refunded amount"] === "—");
    record("v2 renames the Actions menu to More", (await page.getByRole("button", { name: "Actions" }).count()) === 0 && (await page.getByRole("button", { name: "More", exact: true }).count()) === 1);
    await page.getByRole("button", { name: "More", exact: true }).click();
    const v2Items = await page.getByRole("menuitem").allInnerTexts();
    record("v2 menu offers Create refund instead of Refund payment", v2Items.includes("Create refund") && !v2Items.includes("Refund payment"), v2Items.join("|"));
    await page.getByRole("menuitem", { name: "Create refund" }).click();
    await page.waitForURL(/\/sandbox\/billing\/payments\/PAY-3001\/refund$/);
    await page.getByText("Step 1 of 3 · Amount and reason").waitFor();
    record("v2 wizard has three steps, new heading and new DOM ids", (await page.getByRole("heading", { level: 1 }).innerText()) === "Create refund" && (await page.locator("#lb-amount").count()) === 1 && (await page.locator("#fld-amount").count()) === 0);
    record("v2 renames Refund reason to Reason for refund", (await page.getByRole("combobox", { name: "Reason for refund", exact: true }).count()) === 1 && (await page.getByRole("combobox", { name: "Refund reason", exact: true }).count()) === 0);
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("600");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    record("v2 keeps the amount validation", (await alertText(page)) === "Amount cannot exceed the original charge");
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("120.00");
    await page.getByRole("combobox", { name: "Reason for refund", exact: true }).selectOption("Duplicate");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 2 of 3 · Case details").waitFor();
    await page.getByRole("textbox", { name: "Case reference", exact: true }).fill("cs4471");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    record("v2 keeps the case reference validation", (await alertText(page)) === "Enter the case reference as CS-1234");
    await page.getByRole("textbox", { name: "Case reference", exact: true }).fill("CS-4471");
    await page.getByRole("combobox", { name: "Dispute status", exact: true }).selectOption("Resolved");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Step 3 of 3 · Review").waitFor();
    const reviewTabs = await page.getByRole("tab").allInnerTexts();
    record("v2 review step has Summary and Customer note tabs", reviewTabs.join(",") === "Summary,Customer note", reviewTabs.join(","));
    await page.getByRole("checkbox", { name: "I confirm this refund follows the refund policy", exact: true }).check();
    await page.getByRole("button", { name: "Confirm refund" }).click();
    const v2NoteError = await alertText(page);
    record("v2 requires the note and switches to the Customer note tab", v2NoteError === "Enter a note to the customer" && (await page.getByRole("tab", { name: "Customer note" }).getAttribute("aria-selected")) === "true", v2NoteError);
    await page.getByRole("textbox", { name: "Note to customer", exact: true }).fill(NOTE);
    await shot(page, "09-wizard-review-v2");
    await page.getByRole("button", { name: "Confirm refund" }).click();
    await page.waitForURL(/\/sandbox\/billing\/refunds\/RF-5001/, { timeout: 30000 });
    await page.getByRole("heading", { level: 1, name: "Refund RF-5001" }).waitFor();
    const outcome2 = await dlRows(page);
    record(
      "v2 outcome page shows the same values under the renamed label",
      /Refund issued/.test(await page.getByRole("status").first().innerText()) && outcome2["Refund ID"] === "RF-5001" && outcome2["Amount"] === "$120.00" && outcome2["Reason for refund"] === "Duplicate" && outcome2["Note to customer"] === NOTE && outcome2["Case reference"] === "CS-4471" && outcome2["Dispute status"] === "Resolved",
      JSON.stringify(outcome2).slice(0, 260),
    );
    await shot(page, "10-refund-outcome-v2");

    // ───────────── Several partial refunds on the same entry record (v2) ─────────────
    /** Issues a $120.00 refund on PAY-3001 through the v2 wizard; `probe` first tries an amount above what remains. */
    const issueV2Refund = async (n, probe) => {
      await page.goto(`${APP}/payments/PAY-3001`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { level: 1, name: "$480.00" }).waitFor();
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("menuitem", { name: "Create refund" }).click();
      await page.getByText("Step 1 of 3 · Amount and reason").waitFor();
      const prefilled = await page.getByRole("textbox", { name: "Amount", exact: true }).inputValue();
      let probeError = "";
      if (probe) {
        await page.getByRole("textbox", { name: "Amount", exact: true }).fill(probe);
        await page.getByRole("button", { name: "Next", exact: true }).click();
        probeError = await alertText(page);
      }
      await page.getByRole("textbox", { name: "Amount", exact: true }).fill("120.00");
      await page.getByRole("combobox", { name: "Reason for refund", exact: true }).selectOption("Requested by customer");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Step 2 of 3 · Case details").waitFor();
      await page.getByRole("textbox", { name: "Case reference", exact: true }).fill(`CS-447${n}`);
      await page.getByRole("combobox", { name: "Dispute status", exact: true }).selectOption("Resolved");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Step 3 of 3 · Review").waitFor();
      await page.getByRole("tab", { name: "Customer note" }).click();
      await page.getByRole("textbox", { name: "Note to customer", exact: true }).fill(NOTE);
      await page.getByRole("checkbox", { name: "I confirm this refund follows the refund policy", exact: true }).check();
      await page.getByRole("button", { name: "Confirm refund" }).click();
      await page.waitForURL(new RegExp(`/sandbox/billing/refunds/RF-500${n}`), { timeout: 30000 });
      await page.getByRole("heading", { level: 1, name: `Refund RF-500${n}` }).waitFor();
      const rows = await dlRows(page);
      await page.goto(`${APP}/payments/PAY-3001`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { level: 1, name: "$480.00" }).waitFor();
      const overview = await dlRows(page);
      return { prefilled, probeError, rows, overview };
    };
    const second = await issueV2Refund(2, "");
    record("second refund: wizard prefilled with the remaining $360.00, RF-5002 issued, payment Partially refunded $240.00", second.prefilled === "360.00" && second.rows["Amount"] === "$120.00" && second.overview["Status"] === "Partially refunded" && second.overview["Refunded amount"] === "$240.00", `status=${second.overview["Status"]} refunded=${second.overview["Refunded amount"]}`);
    const third = await issueV2Refund(3, "");
    record("third refund: payment Partially refunded $360.00", third.overview["Status"] === "Partially refunded" && third.overview["Refunded amount"] === "$360.00", `status=${third.overview["Status"]} refunded=${third.overview["Refunded amount"]}`);
    const fourth = await issueV2Refund(4, "150.00");
    record("fourth refund: $150.00 rejected against the remaining $120.00, then RF-5004 issued and the payment is Refunded $480.00", fourth.prefilled === "120.00" && fourth.probeError === "Amount cannot exceed the original charge" && fourth.overview["Status"] === "Refunded" && fourth.overview["Refunded amount"] === "$480.00" && fourth.overview["Dispute status"] === "Resolved", `status=${fourth.overview["Status"]} refunded=${fourth.overview["Refunded amount"]}`);
    await page.getByRole("button", { name: "More", exact: true }).click();
    record("Create refund is disabled once fully refunded", (await page.getByRole("menuitem", { name: "Create refund" }).getAttribute("data-disabled")) !== null);
    await page.keyboard.press("Escape");
    await page.goto(`${APP}/payments/PAY-3001/refund`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    record("refund route explains the payment is fully refunded", /already been refunded in full/.test(await page.locator("main").innerText()));
    await shot(page, "10b-payment-fully-refunded");
    const refundsAfter = await (async () => {
      await page.goto(`${APP}/refunds`, { waitUntil: "networkidle" });
      return page.locator("main").innerText();
    })();
    record("refunds list shows RF-5001 to RF-5004 for PAY-3001", ["RF-5001", "RF-5002", "RF-5003", "RF-5004"].every((id) => refundsAfter.includes(id)));

    // ───────────── Small workflow: pause a subscription ─────────────
    await page.goto(`${APP}/customers/CUS-1002`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Northbeam Analytics" }).waitFor();
    await page.getByRole("button", { name: "Pause subscription" }).click();
    const pauseDialog = page.getByRole("dialog", { name: "Pause subscription" });
    await pauseDialog.waitFor();
    await pauseDialog.getByRole("button", { name: "Pause subscription" }).click();
    record("pause dialog requires a reason", (await pauseDialog.getByRole("alert").innerText()) === "Select a pause reason");
    await pauseDialog.getByRole("combobox", { name: "Pause reason", exact: true }).selectOption("Customer request");
    await pauseDialog.getByRole("textbox", { name: "Internal note", exact: true }).fill("Back in November after their season.");
    await pauseDialog.getByRole("button", { name: "Pause subscription" }).click();
    await page.getByRole("status").filter({ hasText: "Subscription paused" }).waitFor();
    const subRows = await page.locator("dl").nth(1).evaluate((dl) => {
      const out = {};
      dl.querySelectorAll("dt").forEach((dt) => {
        out[dt.textContent.trim()] = dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : "";
      });
      return out;
    });
    record("subscription is paused with the reason recorded", subRows["Subscription status"] === "Paused" && subRows["Pause reason"] === "Customer request" && /Back in November/.test(subRows["Internal note"] || "") && (await page.getByRole("button", { name: "Resume subscription" }).count()) === 1, JSON.stringify(subRows).slice(0, 200));
    await shot(page, "11-customer-paused");

    // ───────────── Small workflow: mark an invoice as paid ─────────────
    await page.goto(`${APP}/invoices/INV-7005`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Invoice INV-7005" }).waitFor();
    const invoiceBefore = await dlRows(page);
    await page.getByRole("button", { name: "Mark as paid" }).click();
    const paidDialog = page.getByRole("dialog", { name: "Mark invoice as paid" });
    await paidDialog.waitFor();
    await paidDialog.getByRole("button", { name: "Mark as paid" }).click();
    record("mark-as-paid dialog requires a reason", (await paidDialog.getByRole("alert").innerText()) === "Select how the invoice was paid");
    await paidDialog.getByRole("combobox", { name: "Reason", exact: true }).selectOption("Paid by bank transfer");
    await paidDialog.getByRole("textbox", { name: "Payment reference", exact: true }).fill("TRX-88121");
    await paidDialog.getByRole("button", { name: "Mark as paid" }).click();
    await page.getByRole("status").filter({ hasText: "marked as paid" }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Invoice INV-7005" }).waitFor();
    const invoiceAfter = await dlRows(page);
    record("invoice is Paid after reload with the reason and reference", invoiceBefore["Status"] === "Open" && invoiceAfter["Status"] === "Paid" && invoiceAfter["Paid via"] === "Paid by bank transfer" && invoiceAfter["Payment reference"] === "TRX-88121" && (await page.getByRole("button", { name: "Mark as paid" }).isDisabled()), `before=${invoiceBefore["Status"]} after=${invoiceAfter["Status"]}`);
    await shot(page, "12-invoice-paid");

    // Not-found routes for pre-generated ids
    await page.goto(`${APP}/payments/PAY-3020`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    const lastSeeded = await page.getByRole("heading", { level: 1 }).innerText();
    await page.goto(`${APP}/refunds/RF-5030`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    record("seeded ids resolve and unknown pre-generated ids render not found", lastSeeded === "$120.00" && (await page.getByRole("heading", { level: 1 }).innerText()) === "Refund not found");

    // Back to v1
    await page.goto(`${APP}/disputes?ui=v1`, { waitUntil: "networkidle" });
    await page.locator("header", { hasText: "v3.8" }).waitFor();
    const disputesText = await page.locator("main").innerText();
    record("?ui=v1 switches back; disputes list shows the resolved case reference when All is selected", /v3\.8/.test(await page.locator("header").innerText()) && /DP-9002/.test(disputesText));
    await page.getByLabel("Status").selectOption("All");
    record("disputes list shows the resolved dispute with the latest case reference", /DP-9001[\s\S]*CS-4474/.test(await page.locator("main").innerText()));
    await shot(page, "13-disputes");

    // ───────────── 390 px viewport ─────────────
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    mobile.on("pageerror", (e) => consoleErrors.push(`pageerror(mobile): ${e.message}`));
    mobile.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`console(mobile): ${m.text().slice(0, 300)}`);
    });
    const overflow = [];
    for (const route of ["", "/payments", "/payments/PAY-3001", "/payments/PAY-3004/refund", "/customers/CUS-1001", "/invoices/INV-7022", "/settings"]) {
      await mobile.goto(`${APP}${route}`, { waitUntil: "networkidle" });
      await mobile.getByRole("heading", { level: 1 }).waitFor();
      const w = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      if (w.scroll > w.inner) overflow.push(`${route || "/"}: ${w.scroll}>${w.inner}`);
    }
    record("390 px viewport has no horizontal overflow on seven routes", overflow.length === 0, overflow.join("; ") || "ok");
    await mobile.screenshot({ path: path.join(OUT, "billing-14-mobile-wizard.png"), fullPage: true });
    await mobile.close();

    record("zero console/page errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
  } catch (e) {
    record("script completed", false, e.message.split("\n")[0]);
    await shot(page, "99-failure").catch(() => {});
  } finally {
    await browser.close();
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
