"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { DISPUTE_STATUSES, disputes, formatDate, formatDateTime, formatMoney, getCustomer, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, Field, PageHeader, PageSkeleton, StatusBadge, Table, selectClass } from "../_components/ui";
import s from "../billing.module.css";

export default function DisputesPage() {
  usePageTitle("Disputes");
  const db = useDb();
  const router = useRouter();
  const [status, setStatus] = React.useState("Unresolved");

  if (!db) return <PageSkeleton />;

  const all = disputes(db);
  const rows = all.filter(({ dispute }) => (status === "All" ? true : status === "Unresolved" ? dispute.status !== "Resolved" : dispute.status === status));
  const openAmount = all.filter(({ dispute }) => dispute.status !== "Resolved").reduce((sum, { dispute }) => sum + dispute.amount, 0);

  return (
    <>
      <PageHeader title="Disputes" description={`${all.length} disputes · ${formatMoney(openAmount)} unresolved`} />
      <Card bodyClassName="p-0">
        <div className="border-b border-[#e3e7ec] p-3 sm:max-w-xs">
          <Field id="dispute-status" label="Status">
            {({ id }) => (
              <select id={id} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="Unresolved">Open or under review</option>
                <option value="All">All statuses</option>
                {DISPUTE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No disputes match" description="Change the status filter to see other disputes." />
        ) : (
          <Table caption="Disputes">
            <thead>
              <tr>
                <th scope="col">Dispute</th>
                <th scope="col">Payment</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">Reason</th>
                <th scope="col">Status</th>
                <th scope="col">Opened</th>
                <th scope="col">Respond by</th>
                <th scope="col">Case reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ payment, dispute }) => {
                const href = `/sandbox/billing/payments/${payment.id}`;
                const customer = getCustomer(db, payment.customerId);
                return (
                  <tr
                    key={dispute.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={cn(s.num, "font-semibold")}>{dispute.id}</td>
                    <td className={s.num}>
                      <Link href={href} className={s.link}>
                        {payment.id}
                      </Link>
                    </td>
                    <td>{customer ? customer.name : payment.customerId}</td>
                    <td className={s.num}>{formatMoney(dispute.amount)}</td>
                    <td>{dispute.reason}</td>
                    <td>
                      <StatusBadge status={dispute.status} />
                    </td>
                    <td className={cn(s.num, s.muted)}>{formatDateTime(dispute.openedAt)}</td>
                    <td className={cn(s.num, s.muted)}>{formatDate(dispute.respondBy)}</td>
                    <td className={s.num}>{dispute.caseReference || "—"}</td>
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
