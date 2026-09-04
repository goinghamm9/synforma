/**
 * Demo defaults for the bundled sandbox application. Nothing here is used by
 * the engine to recognize the application; it only pre-fills the Mission
 * Control form so the demo starts in one click.
 */

export const SANDBOX_APP = {
  name: "Meridian CRM",
  baseUrl: "/sandbox/crm",
  /** The lead record the demo starts from. Any lead works. */
  entryUrl: "/sandbox/crm/leads/L-1001",
  version: "4.2",
};

export const DEFAULT_OBJECTIVE = `I want account executives to create a properly qualified opportunity in this system from an inbound lead.

A properly qualified opportunity must have:
1. A named decision-maker contact
2. Budget status confirmed (Approved or Allocated)
3. A decision timeline (not Unknown)
4. Competitors recorded, or "None identified"
5. A next step scheduled within 14 days

Reps must not paste customer contract terms into free-text notes. Success is every new opportunity meeting all five requirements.`;

/** Work context Synforma may use when acting on behalf of a person. */
export const DEFAULT_CONTEXT: Record<string, string> = {
  entryUrl: SANDBOX_APP.entryUrl,
  amount: "48000",
  stage: "Qualification",
  nextStep: "Discovery call with the decision-maker",
};

export const CONTEXT_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "entryUrl", label: "Entry record", hint: "URL of the lead to start from" },
  { key: "amount", label: "Amount", hint: "Used for the opportunity amount" },
  { key: "stage", label: "Stage", hint: "Pipeline stage if the form asks" },
  { key: "nextStep", label: "Next step", hint: "Wording for the next step field" },
];
