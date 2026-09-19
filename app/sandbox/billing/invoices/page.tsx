"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { INVOICE_STATUSES, formatDate, formatMoney, getCustomer, sortedInvoices, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, Field, PageHeader, PageSkeleton, StatusBadge, Table, inputClass, selectClass } from "../_components/ui";
import s from "../billing.module.css";

export default function InvoicesPage() {
  usePageTitle("Invoices");
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");

  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const invoices = sortedInvoices(db)
    .filter((invoice) => (status === "All" ? true : invoice.status === status))
    .filter((invoice) => {
      if (!needle) return true;
      const customer = getCustomer(db, invoice.customerId);
      return [invoice.id, invoice.memo, customer ? customer.name : ""].some((v) => v.toLowerCase().includes(needle));
    });

  return (
    <>
      <PageHeader title="Invoices" description={`${db.invoices.length} invoices · ${invoices.length} shown`} />
      <Card bodyClassName="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-[#e3e7ec] p-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Field id="invoice-search" label="Search">
            {({ id }) => (
              <input id={id} type="search" className={inputClass} placeholder="Search by ID, customer or memo" value={query} onChange={(event) => setQuery(event.target.value)} />
            )}
          </Field>
          <Field id="invoice-status" label="Status">
            {({ id }) => (
              <select id={id} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="All">All statuses</option>
                {INVOICE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {invoices.length === 0 ? (
          <EmptyState title="No invoices match" description="Try a different search term or clear the status filter." />
        ) : (
          <Table caption="Invoices">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Issued</th>
                <th scope="col">Due</th>
                <th scope="col">Memo</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const href = `/sandbox/billing/invoices/${invoice.id}`;
                const customer = getCustomer(db, invoice.customerId);
                return (
                  <tr
                    key={invoice.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {invoice.id}
                      </Link>
                    </td>
                    <td>{customer ? customer.name : invoice.customerId}</td>
                    <td className={s.num}>{formatMoney(invoice.amount)}</td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className={cn(s.num, s.muted)}>{formatDate(invoice.issuedAt)}</td>
                    <td className={cn(s.num, s.muted)}>{formatDate(invoice.dueAt)}</td>
                    <td>{invoice.memo}</td>
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
