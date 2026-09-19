import type { BillingDb, Refund } from "./db";
import { formatDateTime, formatMoney, getCustomer } from "./db";
import type { UiLabels } from "./ui-version";

export interface ViewRow {
  key: string;
  label: string;
  value: string;
}

/** Every stored field of a refund as label/value rows, using the version's labels. */
export function refundRows(db: BillingDb, refund: Refund, labels: UiLabels): ViewRow[] {
  const customer = getCustomer(db, refund.customerId);
  return [
    { key: "id", label: "Refund ID", value: refund.id },
    { key: "payment", label: "Payment", value: refund.paymentId },
    { key: "customer", label: "Customer", value: customer ? customer.name : refund.customerId },
    { key: "amount", label: "Amount", value: formatMoney(refund.amount) },
    { key: "reason", label: labels.refundReason, value: refund.reason },
    { key: "customerNote", label: "Note to customer", value: refund.customerNote },
    { key: "caseReference", label: "Case reference", value: refund.caseReference },
    { key: "disputeStatus", label: "Dispute status", value: refund.disputeStatus },
    { key: "status", label: "Status", value: refund.status },
    { key: "createdAt", label: "Created", value: formatDateTime(refund.createdAt) },
    { key: "createdBy", label: "Issued by", value: refund.createdBy },
  ];
}
