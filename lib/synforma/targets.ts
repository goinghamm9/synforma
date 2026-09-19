/**
 * Target applications the demo can run against. Nothing here is used by the
 * engine to recognize an application: the engine reads generic semantics only.
 * The registry pre-fills Mission Control (objective, work context, entry
 * record) and tells the session where an app lives and how its simulated
 * vendor update is switched.
 *
 * Every app is a fictional replica of a category of enterprise software, built
 * for this demonstration and labelled as such in its own footer. None of them
 * has a connector, selectors or any hook for Synforma.
 */
import { CONTEXT_FIELDS, DEFAULT_CONTEXT, DEFAULT_OBJECTIVE, withBase } from "./demo";

export interface ContextField {
  key: string;
  label: string;
  hint: string;
}

export interface TargetApp {
  id: string;
  name: string;
  /** "ready": the engine runs the objective end to end on both UI versions. "preview": usable app, engine still short. */
  status: "ready" | "preview";
  /** Category of software the replica reproduces ("CRM", "Billing dashboard", …). */
  category: string;
  /** One honest sentence shown next to the name. */
  replicaNote: string;
  /** Vendor version label of the current release and of the simulated update. */
  version: string;
  versionV2: string;
  /** App-absolute URLs (base path applied). */
  baseUrl: string;
  entryUrl: string;
  /** localStorage key the app reads its UI version from; `${baseUrl}/settings?ui=v2` switches it. */
  uiVersionKey: string;
  objective: string;
  /** Work context Synforma may use when acting. Empty values are filled by `contextFor`. */
  context: Record<string, string>;
  contextFields: ContextField[];
  /** Presenter lines for a five-minute demo. */
  script: string[];
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const CRM: TargetApp = {
  id: "crm",
  name: "Meridian CRM",
  status: "ready",
  category: "CRM",
  replicaNote: "Fictional CRM built for this demonstration.",
  version: "4.2",
  versionV2: "4.3 preview",
  baseUrl: withBase("/sandbox/crm"),
  entryUrl: withBase("/sandbox/crm/leads/L-1001"),
  uiVersionKey: "meridian-ui-version",
  objective: DEFAULT_OBJECTIVE,
  context: DEFAULT_CONTEXT,
  contextFields: CONTEXT_FIELDS,
  script: [
    "Connect: Synforma reads the CRM through generic semantics; no connector, no selectors.",
    "Objective: a sales manager writes what a qualified opportunity must have.",
    "Discover and plan: thirteen screens, one workflow, Guide/Assist/Act per step.",
    "Run it: the agent fills the routine fields, leaves the judgment field, asks before it commits.",
    "Vendor update: labels, menus and tabs change; run again and it self-heals by meaning.",
    "Undo: every fill is in the ledger and can be reversed.",
  ],
};

const BILLING: TargetApp = {
  id: "billing",
  name: "Ledgerline Billing",
  status: "ready",
  category: "Billing dashboard",
  replicaNote: "Fictional replica of a billing-dashboard pattern; not affiliated with any vendor.",
  version: "3.8",
  versionV2: "3.9 preview",
  baseUrl: withBase("/sandbox/billing"),
  entryUrl: withBase("/sandbox/billing/payments/PAY-3001"),
  uiVersionKey: "ledgerline-ui-version",
  objective: `I want support agents to issue a refund for a disputed charge in this system without breaking our refund policy.

A compliant refund must have:
1. A refund reason selected (Duplicate, Fraudulent, or Requested by customer)
2. The refund amount not above the original charge
3. A note to the customer explaining the refund
4. The dispute marked as Resolved
5. An internal case reference recorded

Agents must not refund charges older than 90 days without a manager. Success is every refund meeting all five requirements.`,
  context: {
    entryUrl: withBase("/sandbox/billing/payments/PAY-3001"),
    amount: "120.00",
    caseReference: "CS-4471",
    customerNote: "We have refunded this charge in full. You will see it on your statement within 5 business days.",
  },
  contextFields: [
    { key: "entryUrl", label: "Entry record", hint: "URL of the disputed payment to start from" },
    { key: "amount", label: "Refund amount", hint: "Used for the refund amount" },
    { key: "caseReference", label: "Case reference", hint: "Internal case in the form CS-1234" },
    { key: "customerNote", label: "Note to customer", hint: "Wording for the customer-facing note" },
  ],
  script: [
    "Connect to the billing dashboard the engine has never been configured for.",
    "Objective: what a compliant refund must contain, in the support lead's words.",
    "Discover and plan: payments, disputes, the refund flow, the commit control.",
    "Run it: amount, reason and note are routine; the refund itself waits for approval.",
    "Vendor update: the Actions menu and the refund wizard are renamed and restructured; run again.",
    "The dispute is Resolved and the case reference is on the refund: five of five verified.",
  ],
};

const DATA: TargetApp = {
  id: "data",
  name: "Nimbus Data Console",
  status: "preview",
  category: "Developer console",
  replicaNote: "Fictional replica of a developer-console pattern; not affiliated with any vendor.",
  version: "2.14",
  versionV2: "2.15 preview",
  baseUrl: withBase("/sandbox/data"),
  entryUrl: withBase("/sandbox/data/projects/PRJ-2001/tables"),
  uiVersionKey: "nimbus-ui-version",
  objective: `I want developers to create a new table in this project with row level security switched on from the start.

A correctly created table must have:
1. A table name in snake_case
2. A primary key column named id
3. Row level security enabled
4. A policy that allows authenticated users to read their own rows
5. A description recorded for the table

Developers must not disable row level security on existing tables. Success is every new table meeting all five requirements.`,
  context: {
    entryUrl: withBase("/sandbox/data/projects/PRJ-2001/tables"),
    tableName: "customer_notes",
    description: "Free-text notes agents attach to a customer",
    policyName: "Users read own rows",
  },
  contextFields: [
    { key: "entryUrl", label: "Entry page", hint: "URL of the project's table list" },
    { key: "tableName", label: "Table name", hint: "snake_case name for the new table" },
    { key: "description", label: "Description", hint: "Recorded on the table" },
    { key: "policyName", label: "Policy name", hint: "Name of the read-own-rows policy" },
  ],
  script: [
    "Connect to a developer console: dark sidebar, table editor, policies.",
    "Objective: a platform lead's rules for new tables, security on from the start.",
    "Discover and plan: the new-table flow with its security step and the commit control.",
    "Run it: name, description and the policy are routine; creating the table waits for approval.",
    "Vendor update: the sidebar, the security toggle and the commit button are renamed; run again.",
    "Row level security enabled and the policy in place: five of five verified.",
  ],
};

const ERP: TargetApp = {
  id: "erp",
  name: "Atlas ERP",
  status: "ready",
  category: "Enterprise ERP",
  replicaNote: "Fictional replica of an enterprise-ERP pattern; not affiliated with any vendor.",
  version: "24.1",
  versionV2: "24.2 preview",
  baseUrl: withBase("/sandbox/erp"),
  entryUrl: withBase("/sandbox/erp"),
  uiVersionKey: "atlas-ui-version",
  objective: `I want requesters to create a purchase requisition for office equipment in this system that procurement can approve without sending it back.

An approvable requisition must have:
1. A cost center assigned
2. A quantity and unit price for each item
3. A requested delivery date at least 10 days out
4. A business justification of at least two sentences
5. The material group Office equipment selected

Requesters must not split orders to stay under approval limits. Success is every requisition approved on the first review.`,
  context: {
    entryUrl: withBase("/sandbox/erp"),
    description: "Standing desks for the Berlin office",
    costCenter: "CC-1200 Facilities",
    materialGroup: "Office equipment",
    itemDescription: "Height-adjustable desk 160 cm",
    quantity: "8",
    unitPrice: "640",
    deliveryDate: "",
    justification: "The Berlin office is adding eight desks for the new support team. Standing desks were requested by the team after the ergonomics review and match the standard already used in Munich.",
  },
  contextFields: [
    { key: "entryUrl", label: "Entry page", hint: "URL of the launchpad" },
    { key: "description", label: "Description", hint: "Requisition description" },
    { key: "costCenter", label: "Cost center", hint: "Cost center to assign" },
    { key: "materialGroup", label: "Material group", hint: "Material group to select" },
    { key: "itemDescription", label: "Item description", hint: "First item" },
    { key: "quantity", label: "Quantity", hint: "Units of the first item" },
    { key: "unitPrice", label: "Unit price", hint: "Price per unit" },
    { key: "deliveryDate", label: "Requested delivery date", hint: "Filled with a date 14 days ahead when empty" },
  ],
  script: [
    "Connect to an ERP launchpad with tiles, list reports and object pages.",
    "Objective: what procurement needs on a requisition to approve it first time.",
    "Discover and plan: the requisition flow, its items table and the submit control.",
    "Run it: header, items and justification are routine; submitting waits for approval.",
    "Vendor update: tiles, labels and the footer bar change; run again and it self-heals.",
    "Cost center, items, date and justification present: five of five verified.",
  ],
};

export const TARGET_APPS: readonly TargetApp[] = [CRM, BILLING, ERP, DATA];
/** The applications offered in Mission Control and on the site. */
export const DEMO_TARGETS: readonly TargetApp[] = TARGET_APPS.filter((t) => t.status === "ready");
export const DEFAULT_TARGET_ID = CRM.id;

export function targetById(id: string | null | undefined): TargetApp {
  return TARGET_APPS.find((t) => t.id === id) ?? CRM;
}

/** The target a program was created against, matched by its application base URL. */
export function targetForProgram(program: { application: { baseUrl: string } } | null | undefined): TargetApp {
  if (!program) return CRM;
  return TARGET_APPS.find((t) => t.baseUrl === program.application.baseUrl) ?? CRM;
}

/** Work context with time-dependent blanks filled (dates that must lie in the future). */
export function contextFor(app: TargetApp): Record<string, string> {
  const ctx = { ...app.context };
  for (const [key, value] of Object.entries(ctx)) {
    if (value === "" && /date/i.test(key)) ctx[key] = isoDaysFromNow(14);
  }
  return ctx;
}
