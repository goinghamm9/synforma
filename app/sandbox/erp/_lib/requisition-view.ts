import type { AtlasDb, Requisition } from "./db";
import { costCenterLabel, formatCurrency, formatDate, getCostCenter, requisitionTotal } from "./db";
import type { UiLabels } from "./ui-version";

export interface ViewRow {
  key: string;
  label: string;
  value: string | string[];
}

/** One line per item: "description · quantity × unit price · delivery date". */
export function itemLine(entry: { description: string; quantity: number; unitPrice: number; deliveryDate: string }): string {
  return `${entry.description || "—"} · ${entry.quantity} × ${formatCurrency(entry.unitPrice)} · ${formatDate(entry.deliveryDate)}`;
}

/** Every stored field of a requisition as label/value rows, using the version's labels. */
export function requisitionRows(db: AtlasDb, requisition: Requisition, labels: UiLabels): ViewRow[] {
  const costCenter = getCostCenter(db, requisition.costCenterId);
  return [
    { key: "id", label: "Requisition", value: requisition.id },
    { key: "description", label: labels.description, value: requisition.description },
    { key: "costCenter", label: labels.costCenter, value: costCenterLabel(costCenter, requisition.costCenterId) },
    { key: "materialGroup", label: labels.materialGroup, value: requisition.materialGroup },
    { key: "items", label: "Items", value: requisition.items.map(itemLine) },
    { key: "justification", label: labels.justification, value: requisition.justification },
    { key: "totalValue", label: "Total value", value: formatCurrency(requisitionTotal(requisition)) },
    { key: "notSplit", label: "Split declaration", value: requisition.notSplit ? "Confirmed not split" : "Not confirmed" },
    { key: "requestedBy", label: "Requested by", value: requisition.requestedBy },
    { key: "status", label: "Status", value: requisition.status },
    { key: "createdAt", label: "Created", value: formatDate(requisition.createdAt) },
    { key: "submittedAt", label: "Submitted", value: requisition.submittedAt ? formatDate(requisition.submittedAt) : "" },
  ];
}
