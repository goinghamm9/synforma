"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysSince, eventsFor, formatDate, formatDateTime, formatMoney, getCustomer, getPayment, refundsForPayment, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { PaymentActions } from "../../_components/payment-actions";
import { Banner, Breadcrumb, Card, DefinitionList, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table } from "../../_components/ui";
import s from "../../billing.module.css";

export function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const { labels } = useUi();
  const [notice, setNotice] = React.useState("");
  const payment = db ? getPayment(db, params.id) : undefined;
  usePageTitle(payment ? `${payment.id} · ${formatMoney(payment.amount)}` : "Payment");

  if (!db) return <PageSkeleton />;

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
  const refunds = refundsForPayment(db, payment.id);
  const events = eventsFor(db, { paymentId: payment.id });
  const dispute = payment.dispute;
  const age = daysSince(payment.createdAt);

  return (
    <>
      <Breadcrumb items={[{ label: "Payments", href: "/sandbox/billing/payments" }, { label: payment.id }]} />
      {notice ? (
        <Banner tone="success" className="mb-4" onDismiss={() => setNotice("")} icon={<CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />}>
          {notice}
        </Banner>
      ) : null}
      <PageHeader
        title={formatMoney(payment.amount)}
        meta={
          <>
            <StatusBadge status={payment.status} />
            {dispute ? (
              <span className={dispute.status === "Resolved" ? s.badgeGreen : dispute.status === "Under review" ? s.badgeAmber : s.badgeRed}>
                Dispute · {dispute.status}
              </span>
            ) : null}
          </>
        }
        description={
          <>
            Payment {payment.id} ·{" "}
            {customer ? (
              <Link href={`/sandbox/billing/customers/${customer.id}`} className={s.link}>
                {customer.name}
              </Link>
            ) : (
              payment.customerId
            )}{" "}
            · {payment.description}
          </>
        }
        actions={<PaymentActions payment={payment} onNotice={setNotice} />}
      />

      <Card bodyClassName="pt-2">
        <Tabs.Root defaultValue="overview">
          <Tabs.List className={s.tabList} aria-label="Payment sections">
            <Tabs.Trigger value="overview" className={s.tab}>
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger value="timeline" className={s.tab}>
              Timeline
            </Tabs.Trigger>
            <Tabs.Trigger value="dispute" className={s.tab}>
              Dispute
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="overview" className={s.tabPanel}>
            <DefinitionList
              rows={[
                { label: "Payment ID", value: payment.id },
                {
                  label: "Customer",
                  value: customer ? (
                    <Link href={`/sandbox/billing/customers/${customer.id}`} className={s.link}>
                      {customer.name} ({customer.id})
                    </Link>
                  ) : (
                    payment.customerId
                  ),
                },
                { label: "Amount", value: formatMoney(payment.amount) },
                { label: "Status", value: <StatusBadge status={payment.status} /> },
                { label: "Description", value: payment.description },
                { label: "Payment method", value: payment.method },
                { label: "Charge date", value: formatDateTime(payment.createdAt) },
                { label: "Charge age", value: `${age} ${age === 1 ? "day" : "days"}` },
                {
                  label: "Invoice",
                  value: payment.invoiceId ? (
                    <Link href={`/sandbox/billing/invoices/${payment.invoiceId}`} className={s.link}>
                      {payment.invoiceId}
                    </Link>
                  ) : (
                    ""
                  ),
                },
                { label: "Refunded amount", value: payment.refundedAmount > 0 ? formatMoney(payment.refundedAmount) : "" },
                { label: "Dispute status", value: dispute ? <StatusBadge status={dispute.status} /> : "No dispute" },
                { label: "Failure reason", value: payment.failureReason },
              ]}
            />
            <h3 className={cn(s.h3, "mt-6 mb-2")}>Refunds</h3>
            {refunds.length === 0 ? (
              <p className={cn(s.muted, "m-0 text-[13px]")}>No refunds have been issued for this payment.</p>
            ) : (
              <Table caption="Refunds for this payment">
                <thead>
                  <tr>
                    <th scope="col">Refund</th>
                    <th scope="col">Amount</th>
                    <th scope="col">{labels.refundReason}</th>
                    <th scope="col">Case reference</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((refund) => (
                    <tr key={refund.id}>
                      <td>
                        <Link href={`/sandbox/billing/refunds/${refund.id}`} className={cn(s.link, s.num)}>
                          {refund.id}
                        </Link>
                      </td>
                      <td className={s.num}>{formatMoney(refund.amount)}</td>
                      <td>{refund.reason}</td>
                      <td className={s.num}>{refund.caseReference || "—"}</td>
                      <td className={cn(s.num, s.muted)}>{formatDateTime(refund.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Tabs.Content>

          <Tabs.Content value="timeline" className={s.tabPanel}>
            {events.length === 0 ? (
              <EmptyState title="No activity recorded" description="Payment events will appear here." />
            ) : (
              <ol className={s.timeline}>
                {events.map((event) => (
                  <li key={event.id} className={s.timelineItem}>
                    <div className={cn(s.muted, s.num, "text-xs")}>
                      {formatDateTime(event.at)} · {event.actor}
                    </div>
                    <div>{event.text}</div>
                  </li>
                ))}
              </ol>
            )}
          </Tabs.Content>

          <Tabs.Content value="dispute" className={s.tabPanel}>
            {dispute ? (
              <>
                {dispute.status !== "Resolved" ? (
                  <Banner tone="warning" className="mb-4">
                    The cardholder&apos;s bank has opened a dispute for this charge. Respond with evidence or refund the charge before{" "}
                    {formatDate(dispute.respondBy)}.
                  </Banner>
                ) : null}
                <DefinitionList
                  rows={[
                    { label: "Dispute ID", value: dispute.id },
                    { label: "Reason", value: dispute.reason },
                    { label: "Dispute status", value: <StatusBadge status={dispute.status} /> },
                    { label: "Amount disputed", value: formatMoney(dispute.amount) },
                    { label: "Opened", value: formatDateTime(dispute.openedAt) },
                    { label: "Respond by", value: formatDate(dispute.respondBy) },
                    { label: "Case reference", value: dispute.caseReference },
                  ]}
                />
              </>
            ) : (
              <EmptyState title="No dispute" description="This payment has not been disputed." />
            )}
          </Tabs.Content>
        </Tabs.Root>
      </Card>
    </>
  );
}
