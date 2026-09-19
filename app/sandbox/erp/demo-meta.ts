/**
 * Demo metadata for the Atlas ERP sandbox. A plain data module with no
 * imports: the demo registry reads it to pre-fill the objective and the work
 * context. Nothing here is used by the engine to recognize the application.
 *
 * `deliveryDate` is left empty on purpose: the demo registry fills it with a
 * date 14 days ahead at run time.
 */
export const ERP_DEMO = {
  id: "erp",
  name: "Atlas ERP",
  version: "24.1",
  versionV2: "24.2 preview",
  basePath: "/sandbox/erp",
  entryPath: "/sandbox/erp",
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
    entryUrl: "/sandbox/erp",
    description: "Standing desks for the Berlin office",
    costCenter: "CC-1200 Facilities",
    materialGroup: "Office equipment",
    itemDescription: "Height-adjustable desk 160 cm",
    quantity: "8",
    unitPrice: "640",
    deliveryDate: "",
    justification:
      "The Berlin office is adding eight desks for the new support team. Standing desks were requested by the team after the ergonomics review and match the standard already used in Munich.",
  },
  contextFields: [
    { key: "description", label: "Description", hint: "Short description of the requisition" },
    { key: "costCenter", label: "Cost center", hint: "Cost center to charge, as shown in the value help" },
    { key: "materialGroup", label: "Material group", hint: "Material group to select" },
    { key: "itemDescription", label: "Item description", hint: "Description of the first item line" },
    { key: "quantity", label: "Quantity", hint: "Quantity of the first item line" },
    { key: "unitPrice", label: "Unit price", hint: "Unit price in EUR of the first item line" },
    { key: "deliveryDate", label: "Requested delivery date", hint: "ISO date at least 10 days out; filled automatically when empty" },
    { key: "justification", label: "Business justification", hint: "At least two sentences" },
  ],
  script: [
    "Atlas ERP is a purchase-requisition system Synforma has never seen. We start on the launchpad, as a requester would.",
    "Synforma explores the tiles, list reports and the four-step wizard on its own, reading only roles and labels, and maps the objective's five requirements onto the fields it found.",
    "Watch it fill General, Items and Justification, confirm the requisition is not split, and stop before the commit: submitting for approval is approval-gated.",
    "After the approval the outcome page shows every requirement as a labelled value: cost center, quantity and unit price, a delivery date 14 days out, a two-sentence justification, material group Office equipment.",
    "Now we install the vendor update, Release 24.2: Cost centre, Justification moved into a tab of the Review step, and the Submit button renamed Order.",
    "Synforma re-grounds each step by meaning, not by DOM ids, and the same requisition is approved on the first review.",
  ],
} as const;
