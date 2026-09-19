"use client";
import { useParams } from "next/navigation";
import { formatMoney, getCustomer, getPayment, refundableAmount, useDb } from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { useUi } from "../../../_lib/ui-version";
import { RefundWizard } from "../../../_components/refund-wizard";
import { Breadcrumb, Card, EmptyState, LinkButton, PageHeader, PageSkeleton } from "../../../_components/ui";

export function RefundPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const { labels, prefix } = useUi();
  usePageTitle(labels.wizardTitle);

  if (!db) return <PageSkeleton />;

  const payment = getPayment(db, params.id);

  if (!payment) {
    return (
      <>
        <PageHeader title="Payment not found" description={`No payment with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This payment may have been removed"
            description="Return to the payments list to find the record you were looking for."
            action={<LinkButton href="/sandbox/billing/payments">Back to payments</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const customer = getCustomer(db, payment.customerId);
  const breadcrumb = (
    <Breadcrumb items={[{ label: "Payments", href: "/sandbox/billing/payments" }, { label: payment.id, href: `/sandbox/billing/payments/${payment.id}` }, { label: labels.wizardTitle }]} />
  );

  if (refundableAmount(payment) <= 0) {
    return (
      <>
        {breadcrumb}
        <PageHeader title={labels.wizardTitle} description={`Payment ${payment.id} · ${formatMoney(payment.amount)}`} />
        <Card>
          <EmptyState
            title={payment.status === "Failed" ? "This payment failed and cannot be refunded" : "This payment has already been refunded in full"}
            description={payment.status === "Failed" ? "Only successful payments can be refunded." : `${formatMoney(payment.refundedAmount)} of ${formatMoney(payment.amount)} has been refunded.`}
            action={<LinkButton href={`/sandbox/billing/payments/${payment.id}`}>Back to payment</LinkButton>}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {breadcrumb}
      <PageHeader
        title={labels.wizardTitle}
        titleId={`${prefix}-wizard-heading`}
        description={`Payment ${payment.id} · ${customer ? customer.name : payment.customerId} · ${formatMoney(payment.amount)}`}
      />
      <RefundWizard key={payment.id} db={db} payment={payment} />
    </>
  );
}
