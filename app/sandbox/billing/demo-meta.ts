/**
 * Demo metadata for the Ledgerline Billing sandbox. A plain data module with
 * no imports: nothing in it is used by the application itself, and nothing in
 * the engine recognizes the application through it.
 */
export const BILLING_DEMO = {
  id: "billing",
  name: "Ledgerline Billing",
  version: "3.8",
  versionV2: "3.9 preview",
  basePath: "/sandbox/billing",
  entryPath: "/sandbox/billing/payments/PAY-3001",
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
    entryUrl: "/sandbox/billing/payments/PAY-3001",
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
} as const;
