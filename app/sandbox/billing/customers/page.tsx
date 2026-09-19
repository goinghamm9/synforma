"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, totalSpent, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, Field, PageHeader, PageSkeleton, StatusBadge, Table, inputClass } from "../_components/ui";
import s from "../billing.module.css";

export default function CustomersPage() {
  usePageTitle("Customers");
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const customers = db.customers.filter((customer) =>
    needle ? [customer.id, customer.name, customer.contactName, customer.email, customer.country].some((v) => v.toLowerCase().includes(needle)) : true,
  );

  return (
    <>
      <PageHeader title="Customers" description={`${db.customers.length} customers · ${customers.length} shown`} />
      <Card bodyClassName="p-0">
        <div className="border-b border-[#e3e7ec] p-3 sm:max-w-md">
          <Field id="customer-search" label="Search">
            {({ id }) => (
              <input
                id={id}
                type="search"
                className={inputClass}
                placeholder="Search by ID, name, contact or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
        </div>
        {customers.length === 0 ? (
          <EmptyState title="No customers match" description="Try a different search term." />
        ) : (
          <Table caption="Customers">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Name</th>
                <th scope="col">Contact</th>
                <th scope="col">Plan</th>
                <th scope="col">Subscription</th>
                <th scope="col" className={s.tdRight}>
                  Total spent
                </th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const href = `/sandbox/billing/customers/${customer.id}`;
                return (
                  <tr
                    key={customer.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={s.link}>
                        {customer.id}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {customer.name}
                      </Link>
                      <span className={cn(s.muted, "block text-xs")}>{customer.email}</span>
                    </td>
                    <td>{customer.contactName}</td>
                    <td>
                      {customer.subscription.plan} · {formatMoney(customer.subscription.amount)}/mo
                    </td>
                    <td>
                      <StatusBadge status={customer.subscription.status} />
                    </td>
                    <td className={s.tdRight}>{formatMoney(totalSpent(db, customer.id))}</td>
                    <td className={s.num}>{formatDate(customer.createdAt)}</td>
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
