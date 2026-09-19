"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventsFor, formatDate, formatDateTime, formatMoney, getCustomer, getInvoice, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { InvoiceActions } from "../../_components/invoice-actions";
import { Banner, Breadcrumb, Card, DefinitionList, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table } from "../../_components/ui";
import s from "../../billing.module.css";

export function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const [notice, setNotice] = React.useState("");
  const invoice = db ? getInvoice(db, params.id) : undefined;
  usePageTitle(invoice ? `Invoice ${invoice.id}` : "Invoice");

  if (!db) return <PageSkeleton />;

  if (!invoice) {
    return (
      <>
        <PageHeader title="Invoice not found" description={`No invoice with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This invoice may have been removed"
            description="Return to the invoices list to find the record you were looking for."
            action={<LinkButton href="/sandbox/billing/invoices">Back to invoices</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const customer = getCustomer(db, invoice.customerId);
  const events = eventsFor(db, { invoiceId: invoice.id });
  const subtotal = invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);

  return (
    <>
      <Breadcrumb items={[{ label: "Invoices", href: "/sandbox/billing/invoices" }, { label: invoice.id }]} />
      {notice ? (
        <Banner tone="success" className="mb-4" onDismiss={() => setNotice("")} icon={<CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />}>
          {notice}
        </Banner>
      ) : null}
      <PageHeader
        title={`Invoice ${invoice.id}`}
        meta={<StatusBadge status={invoice.status} />}
        description={
          <>
            {formatMoney(invoice.amount)} ·{" "}
            {customer ? (
              <Link href={`/sandbox/billing/customers/${customer.id}`} className={s.link}>
                {customer.name}
              </Link>
            ) : (
              invoice.customerId
            )}{" "}
            · {invoice.memo}
          </>
        }
        actions={
          <>
            <LinkButton href={`/sandbox/billing/customers/${invoice.customerId}`}>View customer</LinkButton>
            <InvoiceActions invoice={invoice} onNotice={setNotice} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DefinitionList
            rows={[
              { label: "Invoice ID", value: invoice.id },
              {
                label: "Customer",
                value: customer ? (
                  <Link href={`/sandbox/billing/customers/${customer.id}`} className={s.link}>
                    {customer.name} ({customer.id})
                  </Link>
                ) : (
                  invoice.customerId
                ),
              },
              { label: "Amount", value: formatMoney(invoice.amount) },
              { label: "Status", value: <StatusBadge status={invoice.status} /> },
              { label: "Issued", value: formatDate(invoice.issuedAt) },
              { label: "Due", value: formatDate(invoice.dueAt) },
              { label: "Paid on", value: invoice.paidAt ? formatDateTime(invoice.paidAt) : "" },
              {
                label: "Payment",
                value: invoice.paymentId ? (
                  <Link href={`/sandbox/billing/payments/${invoice.paymentId}`} className={s.link}>
                    {invoice.paymentId}
                  </Link>
                ) : (
                  ""
                ),
              },
              { label: "Paid via", value: invoice.paidReason },
              { label: "Payment reference", value: invoice.paidReference },
              { label: "Memo", value: invoice.memo },
            ]}
          />
          <h3 className={cn(s.h3, "mt-6 mb-2")}>Line items</h3>
          <Table caption="Invoice line items">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col" className={s.tdRight}>
                  Quantity
                </th>
                <th scope="col" className={s.tdRight}>
                  Unit price
                </th>
                <th scope="col" className={s.tdRight}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={`${line.description}-${index}`}>
                  <td className="whitespace-normal">{line.description}</td>
                  <td className={s.tdRight}>{line.quantity}</td>
                  <td className={s.tdRight}>{formatMoney(line.unitAmount)}</td>
                  <td className={s.tdRight}>{formatMoney(line.quantity * line.unitAmount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className={cn(s.tdRight, "font-semibold")}>
                  Total
                </td>
                <td className={cn(s.tdRight, "font-semibold")}>{formatMoney(subtotal)}</td>
              </tr>
            </tbody>
          </Table>
        </Card>
        <Card title="Timeline">
          {events.length === 0 ? (
            <EmptyState title="No activity recorded" description="Invoice events will appear here." />
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
        </Card>
      </div>
    </>
  );
}
