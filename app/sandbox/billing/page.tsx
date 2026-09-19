"use client";
import Link from "next/link";
import { ArrowLeftRight, CreditCard, FileText, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_USER, daysSince, disputes, formatDate, formatDateTime, formatMoney, getCustomer, recentPayments, useDb } from "./_lib/db";
import { usePageTitle } from "./_lib/use-page-title";
import { Card, EmptyState, PageHeader, PageSkeleton, StatCard, StatusBadge, Table } from "./_components/ui";
import s from "./billing.module.css";

const QUICK_LINKS = [
  { href: "/sandbox/billing/payments", label: "Payments", icon: CreditCard },
  { href: "/sandbox/billing/customers", label: "Customers", icon: Users },
  { href: "/sandbox/billing/invoices", label: "Invoices", icon: FileText },
  { href: "/sandbox/billing/refunds", label: "Refunds", icon: ArrowLeftRight },
  { href: "/sandbox/billing/disputes", label: "Disputes", icon: ShieldAlert },
];

export default function BillingHomePage() {
  usePageTitle("Home");
  const db = useDb();
  if (!db) return <PageSkeleton />;

  const last30 = db.payments.filter((p) => daysSince(p.createdAt) <= 30);
  const grossVolume = last30.filter((p) => p.status !== "Failed").reduce((sum, p) => sum + p.amount, 0);
  const succeeded = last30.filter((p) => p.status !== "Failed").length;
  const openDisputes = disputes(db).filter((d) => d.dispute.status !== "Resolved");
  const refunds30 = db.refunds.filter((r) => daysSince(r.createdAt) <= 30);
  const refundedVolume = refunds30.reduce((sum, r) => sum + r.amount, 0);
  const pastDue = db.invoices.filter((i) => i.status === "Past due");
  const recent = recentPayments(db, 8);
  const firstName = CURRENT_USER.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Good day, ${firstName}`} description="Here is what changed across payments, invoices and disputes." />

      <section aria-labelledby="overview-heading" className="mb-5">
        <h2 id="overview-heading" className={cn(s.h2, "mb-3")}>
          Last 30 days
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Gross volume" value={formatMoney(grossVolume)} hint={`${succeeded} successful payments`} />
          <StatCard label="Refunded" value={formatMoney(refundedVolume)} hint={`${refunds30.length} ${refunds30.length === 1 ? "refund" : "refunds"} issued`} />
          <StatCard label="Open disputes" value={openDisputes.length} hint="Open or under review" />
          <StatCard label="Past due invoices" value={pastDue.length} hint={`${formatMoney(pastDue.reduce((sum, i) => sum + i.amount, 0))} outstanding`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Recent payments" className="lg:col-span-2" bodyClassName="p-0">
          {recent.length === 0 ? (
            <EmptyState title="No payments yet" description="Payments appear here as they are collected." />
          ) : (
            <Table caption="Recent payments">
              <thead>
                <tr>
                  <th scope="col">Payment</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((payment) => {
                  const customer = getCustomer(db, payment.customerId);
                  return (
                    <tr key={payment.id}>
                      <td>
                        <Link href={`/sandbox/billing/payments/${payment.id}`} className={cn(s.link, s.num)}>
                          {payment.id}
                        </Link>
                      </td>
                      <td className={s.num}>{formatMoney(payment.amount)}</td>
                      <td>
                        <StatusBadge status={payment.status} />
                      </td>
                      <td>{customer ? customer.name : payment.customerId}</td>
                      <td className={cn(s.num, s.muted)}>{formatDateTime(payment.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="grid gap-4">
          <Card title="Needs attention" bodyClassName="p-0">
            {openDisputes.length === 0 && pastDue.length === 0 ? (
              <EmptyState title="Nothing waiting" description="Open disputes and past due invoices will be listed here." />
            ) : (
              <ul className="m-0 list-none divide-y divide-[#e3e7ec] p-0">
                {openDisputes.slice(0, 4).map(({ payment, dispute }) => (
                  <li key={dispute.id} className="px-4 py-2.5">
                    <Link href={`/sandbox/billing/payments/${payment.id}`} className={s.link}>
                      {dispute.id} · {formatMoney(dispute.amount)}
                    </Link>
                    <span className={cn(s.muted, "block text-xs")}>
                      Dispute {dispute.status.toLowerCase()} on {payment.id} · respond by {formatDate(dispute.respondBy)}
                    </span>
                  </li>
                ))}
                {pastDue.slice(0, 3).map((invoice) => (
                  <li key={invoice.id} className="px-4 py-2.5">
                    <Link href={`/sandbox/billing/invoices/${invoice.id}`} className={s.link}>
                      {invoice.id} · {formatMoney(invoice.amount)}
                    </Link>
                    <span className={cn(s.muted, "block text-xs")}>Invoice past due since {formatDate(invoice.dueAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Quick links">
            <nav aria-label="Quick links" className="grid gap-2">
              {QUICK_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className={s.quickLink}>
                  <item.icon size={16} aria-hidden="true" className={s.muted} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </Card>
        </div>
      </div>
    </>
  );
}
