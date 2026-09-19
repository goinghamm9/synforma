"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUSES, formatDateTime, formatMoney, getCustomer, sortedPayments, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, Field, PageHeader, PageSkeleton, StatusBadge, Table, inputClass, selectClass } from "../_components/ui";
import s from "../billing.module.css";

export default function PaymentsPage() {
  usePageTitle("Payments");
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");
  const [disputeFilter, setDisputeFilter] = React.useState("All");

  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const payments = sortedPayments(db)
    .filter((payment) => (status === "All" ? true : payment.status === status))
    .filter((payment) => (disputeFilter === "All" ? true : disputeFilter === "Disputed" ? payment.dispute !== null : payment.dispute === null))
    .filter((payment) => {
      if (!needle) return true;
      const customer = getCustomer(db, payment.customerId);
      return [payment.id, payment.description, payment.method, customer ? customer.name : "", customer ? customer.email : ""].some((v) =>
        v.toLowerCase().includes(needle),
      );
    });

  return (
    <>
      <PageHeader title="Payments" description={`${db.payments.length} payments · ${payments.length} shown`} />
      <Card bodyClassName="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-[#e3e7ec] p-3 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
          <Field id="payment-search" label="Search">
            {({ id }) => (
              <input
                id={id}
                type="search"
                className={inputClass}
                placeholder="Search by ID, customer or description"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
          <Field id="payment-status" label="Status">
            {({ id }) => (
              <select id={id} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="All">All statuses</option>
                {PAYMENT_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="payment-dispute" label="Dispute">
            {({ id }) => (
              <select id={id} className={selectClass} value={disputeFilter} onChange={(event) => setDisputeFilter(event.target.value)}>
                <option value="All">Any</option>
                <option value="Disputed">Disputed</option>
                <option value="Not disputed">Not disputed</option>
              </select>
            )}
          </Field>
        </div>
        {payments.length === 0 ? (
          <EmptyState title="No payments match" description="Try a different search term or clear the filters." />
        ) : (
          <Table caption="Payments">
            <thead>
              <tr>
                <th scope="col">Payment</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Customer</th>
                <th scope="col">Description</th>
                <th scope="col">Dispute</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const href = `/sandbox/billing/payments/${payment.id}`;
                const customer = getCustomer(db, payment.customerId);
                return (
                  <tr
                    key={payment.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {payment.id}
                      </Link>
                    </td>
                    <td className={s.num}>{formatMoney(payment.amount)}</td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td>{customer ? customer.name : payment.customerId}</td>
                    <td>{payment.description}</td>
                    <td>{payment.dispute ? <StatusBadge status={payment.dispute.status} /> : <span className={s.faint}>—</span>}</td>
                    <td className={cn(s.num, s.muted)}>{formatDateTime(payment.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
