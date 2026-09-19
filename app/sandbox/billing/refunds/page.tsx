"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, getCustomer, sortedRefunds, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { useUi } from "../_lib/ui-version";
import { Card, EmptyState, PageHeader, PageSkeleton, StatusBadge, Table } from "../_components/ui";
import s from "../billing.module.css";

export default function RefundsPage() {
  usePageTitle("Refunds");
  const db = useDb();
  const router = useRouter();
  const { labels } = useUi();

  if (!db) return <PageSkeleton />;

  const refunds = sortedRefunds(db);
  const total = refunds.reduce((sum, r) => sum + r.amount, 0);

  return (
    <>
      <PageHeader title="Refunds" description={`${refunds.length} refunds · ${formatMoney(total)} refunded in total`} />
      <Card bodyClassName="p-0">
        {refunds.length === 0 ? (
          <EmptyState title="No refunds yet" description="Refunds issued from a payment appear here." />
        ) : (
          <Table caption="Refunds">
            <thead>
              <tr>
                <th scope="col">Refund</th>
                <th scope="col">Payment</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">{labels.refundReason}</th>
                <th scope="col">Case reference</th>
                <th scope="col">Dispute status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => {
                const href = `/sandbox/billing/refunds/${refund.id}`;
                const customer = getCustomer(db, refund.customerId);
                return (
                  <tr
                    key={refund.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {refund.id}
                      </Link>
                    </td>
                    <td className={s.num}>
                      <Link href={`/sandbox/billing/payments/${refund.paymentId}`} className={s.link}>
                        {refund.paymentId}
                      </Link>
                    </td>
                    <td>{customer ? customer.name : refund.customerId}</td>
                    <td className={s.num}>{formatMoney(refund.amount)}</td>
                    <td>{refund.reason}</td>
                    <td className={s.num}>{refund.caseReference || "—"}</td>
                    <td>
                      <StatusBadge status={refund.disputeStatus} />
                    </td>
                    <td className={cn(s.num, s.muted)}>{formatDateTime(refund.createdAt)}</td>
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
