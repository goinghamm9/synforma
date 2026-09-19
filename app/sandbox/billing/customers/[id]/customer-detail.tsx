"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventsFor, formatDate, formatDateTime, formatMoney, getCustomer, invoicesForCustomer, paymentsForCustomer, totalSpent, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { SubscriptionActions } from "../../_components/subscription-actions";
import { Banner, Breadcrumb, Card, DefinitionList, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table } from "../../_components/ui";
import s from "../../billing.module.css";

export function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const [notice, setNotice] = React.useState("");
  const customer = db ? getCustomer(db, params.id) : undefined;
  usePageTitle(customer ? customer.name : "Customer");

  if (!db) return <PageSkeleton />;

  if (!customer) {
    return (
      <>
        <PageHeader title="Customer not found" description={`No customer with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This customer may have been removed"
            description="Return to the customers list to find the record you were looking for."
            action={<LinkButton href="/sandbox/billing/customers">Back to customers</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const subscription = customer.subscription;
  const payments = paymentsForCustomer(db, customer.id);
  const invoices = invoicesForCustomer(db, customer.id);
  const events = eventsFor(db, { customerId: customer.id }).slice(0, 12);

  return (
    <>
      <Breadcrumb items={[{ label: "Customers", href: "/sandbox/billing/customers" }, { label: customer.id }]} />
      {notice ? (
        <Banner tone="success" className="mb-4" onDismiss={() => setNotice("")} icon={<CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />}>
          {notice}
        </Banner>
      ) : null}
      <PageHeader
        title={customer.name}
        meta={<StatusBadge status={subscription.status} />}
        description={`Customer ${customer.id} · ${customer.contactName} · ${customer.email}`}
        actions={<SubscriptionActions customer={customer} onNotice={setNotice} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Details">
          <DefinitionList
            rows={[
              { label: "Customer ID", value: customer.id },
              { label: "Name", value: customer.name },
              { label: "Contact", value: customer.contactName },
              { label: "Email", value: customer.email },
              { label: "Country", value: customer.country },
              { label: "Payment method", value: customer.paymentMethod },
              { label: "Total spent", value: formatMoney(totalSpent(db, customer.id)) },
              { label: "Created", value: formatDate(customer.createdAt) },
            ]}
          />
        </Card>
        <Card title="Subscription">
          <DefinitionList
            rows={[
              { label: "Plan", value: subscription.plan },
              { label: "Amount", value: `${formatMoney(subscription.amount)} / ${subscription.interval.toLowerCase().replace("ly", "")}` },
              { label: "Subscription status", value: <StatusBadge status={subscription.status} /> },
              { label: "Started", value: formatDate(subscription.startedAt) },
              { label: "Next invoice", value: subscription.status === "Active" ? formatDate(subscription.nextInvoiceAt) : "" },
              { label: "Paused on", value: subscription.pausedAt ? formatDateTime(subscription.pausedAt) : "" },
              { label: "Pause reason", value: subscription.pauseReason },
              { label: "Internal note", value: subscription.pauseNote },
            ]}
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Payments" bodyClassName="p-0">
          {payments.length === 0 ? (
            <EmptyState title="No payments" />
          ) : (
            <Table caption="Payments for this customer">
              <thead>
                <tr>
                  <th scope="col">Payment</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <Link href={`/sandbox/billing/payments/${payment.id}`} className={cn(s.link, s.num)}>
                        {payment.id}
                      </Link>
                      <span className={cn(s.muted, "block text-xs")}>{payment.description}</span>
                    </td>
                    <td className={s.num}>{formatMoney(payment.amount)}</td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className={cn(s.num, s.muted)}>{formatDate(payment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Invoices" bodyClassName="p-0">
          {invoices.length === 0 ? (
            <EmptyState title="No invoices" />
          ) : (
            <Table caption="Invoices for this customer">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Due</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/sandbox/billing/invoices/${invoice.id}`} className={cn(s.link, s.num)}>
                        {invoice.id}
                      </Link>
                      <span className={cn(s.muted, "block text-xs")}>{invoice.memo}</span>
                    </td>
                    <td className={s.num}>{formatMoney(invoice.amount)}</td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className={cn(s.num, s.muted)}>{formatDate(invoice.dueAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Timeline" className="mt-4">
        {events.length === 0 ? (
          <EmptyState title="No activity recorded" />
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
    </>
  );
}
