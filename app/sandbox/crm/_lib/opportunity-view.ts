import type { MeridianDb, Opportunity } from "./db";
import { formatCurrency, formatDate, getAccount, getContact } from "./db";
import type { UiLabels } from "./ui-version";

export interface ViewRow {
  key: string;
  label: string;
  value: string;
}

/** Every stored field of an opportunity as label/value rows, using the version's labels. */
export function opportunityRows(db: MeridianDb, opportunity: Opportunity, labels: UiLabels): ViewRow[] {
  const account = getAccount(db, opportunity.accountId);
  const decisionMaker = opportunity.decisionMakerContactId ? getContact(db, opportunity.decisionMakerContactId) : undefined;
  return [
    { key: "id", label: "Opportunity ID", value: opportunity.id },
    { key: "name", label: "Opportunity name", value: opportunity.name },
    { key: "account", label: "Account", value: account ? account.name : opportunity.accountId },
    { key: "amount", label: "Amount", value: formatCurrency(opportunity.amount) },
    { key: "closeDate", label: "Expected close date", value: formatDate(opportunity.closeDate) },
    { key: "stage", label: "Stage", value: opportunity.stage },
    { key: "owner", label: "Owner", value: opportunity.owner },
    {
      key: "decisionMaker",
      label: labels.decisionMaker,
      value: decisionMaker ? `${decisionMaker.name} (${decisionMaker.title})` : "",
    },
    { key: "fundingStage", label: labels.fundingStage, value: opportunity.fundingStage },
    { key: "decisionTimeline", label: labels.decisionTimeline, value: opportunity.decisionTimeline },
    {
      key: "competitors",
      label: "Competitors",
      value: opportunity.competitors.length ? opportunity.competitors.join(", ") : "None identified",
    },
    { key: "nextStep", label: labels.nextStep, value: opportunity.nextStep },
    { key: "nextStepDate", label: labels.nextStepDate, value: opportunity.nextStepDate },
    { key: "notes", label: "Qualification notes", value: opportunity.notes },
    { key: "createdAt", label: "Created", value: formatDate(opportunity.createdAt) },
    { key: "sourceLead", label: "Source lead", value: opportunity.sourceLeadId ?? "" },
  ];
}
