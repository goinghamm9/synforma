"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, getPayment, getRefund, useDb } from "../../_lib/db";
import { refundRows } from "../../_lib/refund-view";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { Banner, Breadcrumb, Card, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge } from "../../_components/ui";
import s from "../../billing.module.css";

function RefundDetailContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const db = useDb();
  const { labels } = useUi();
  const createdFlag = search.get("created") === "1";
  const [showCreated, setShowCreated] = React.useState(createdFlag);

  React.useEffect(() => {
    if (createdFlag) router.replace(pathname);
  }, [createdFlag, pathname, router]);

  const refund = db ? getRefund(db, params.id) : undefined;
  usePageTitle(refund ? `Refund ${refund.id}` : "Refund");

  if (!db) return <PageSkeleton />;

  if (!refund) {
    return (
      <>
        <PageHeader title="Refund not found" description={`No refund with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This refund may have been removed"
            description="Return to the refunds list to find the record you were looking for."
            action={<LinkButton href="/sandbox/billing/refunds">Back to refunds</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const payment = getPayment(db, refund.paymentId);
  const rows = refundRows(db, refund, labels);

  return (
    <>
      <Breadcrumb items={[{ label: "Refunds", href: "/sandbox/billing/refunds" }, { label: refund.id }]} />
      {showCreated ? (
        <Banner tone="success" className="mb-4" onDismiss={() => setShowCreated(false)} icon={<CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />}>
          <strong>Refund issued</strong>
          <span className="ml-1">The refund has been recorded and the customer has been notified.</span>
        </Banner>
      ) : null}
      <PageHeader
        title={`Refund ${refund.id}`}
        meta={<StatusBadge status={refund.status} />}
        description={
          <>
            {formatMoney(refund.amount)} refund of payment{" "}
            <Link href={`/sandbox/billing/payments/${refund.paymentId}`} className={s.link}>
              {refund.paymentId}
            </Link>
            {payment ? ` (${formatMoney(payment.amount)} charge)` : ""}
          </>
        }
        actions={<LinkButton href={`/sandbox/billing/payments/${refund.paymentId}`}>View payment</LinkButton>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Refund details" className="lg:col-span-2">
          <dl className={s.dl}>
            {rows.map((row) => (
              <React.Fragment key={row.key}>
                <dt>{row.label}</dt>
                <dd>
                  {row.value === "" ? (
                    <span className={s.faint}>—</span>
                  ) : row.key === "payment" ? (
                    <Link href={`/sandbox/billing/payments/${row.value}`} className={s.link}>
                      {row.value}
                    </Link>
                  ) : row.key === "customer" ? (
                    <Link href={`/sandbox/billing/customers/${refund.customerId}`} className={s.link}>
                      {row.value}
                    </Link>
                  ) : row.key === "disputeStatus" || row.key === "status" ? (
                    <StatusBadge status={row.value} />
                  ) : (
                    row.value
                  )}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </Card>
        <Card title="Payment">
          {payment ? (
            <dl className={s.dl}>
              <dt>Payment</dt>
              <dd>
                <Link href={`/sandbox/billing/payments/${payment.id}`} className={s.link}>
                  {payment.id}
                </Link>
              </dd>
              <dt>Original charge</dt>
              <dd className={s.num}>{formatMoney(payment.amount)}</dd>
              <dt>Payment status</dt>
              <dd>
                <StatusBadge status={payment.status} />
              </dd>
              <dt>Refunded so far</dt>
              <dd className={s.num}>{formatMoney(payment.refundedAmount)}</dd>
              <dt>Charged</dt>
              <dd className={s.num}>{formatDateTime(payment.createdAt)}</dd>
            </dl>
          ) : (
            <p className={cn(s.muted, "m-0")}>Payment {refund.paymentId} is not in this workspace.</p>
          )}
        </Card>
      </div>
    </>
  );
}

export function RefundDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RefundDetailContent />
    </Suspense>
  );
}
