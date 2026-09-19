"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { costCenterLabel, formatCurrency, formatDate, getCostCenter, requisitionTotal, useDb, type Requisition } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { useUi } from "../_lib/ui-version";
import { DecisionDialogs, RequisitionRowMenu, type DecisionMode } from "../_components/requisition-actions";
import { Banner, Breadcrumb, Card, EmptyState, PageHeader, PageSkeleton, StatusBadge, Table } from "../_components/ui";
import s from "../erp.module.css";

export default function ApprovalsPage() {
  usePageTitle("Approve Requisitions");
  const db = useDb();
  const router = useRouter();
  const { labels } = useUi();
  const [decision, setDecision] = React.useState<{ id: string; mode: DecisionMode }>({ id: "", mode: null });
  const [message, setMessage] = React.useState<{ title: string; text: string } | null>(null);

  if (!db) return <PageSkeleton />;

  const pending = db.requisitions.filter((r) => r.status === "Submitted").sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : a.id < b.id ? -1 : 1));
  const decided = db.requisitions
    .filter((r) => r.status === "Approved" || r.status === "Returned")
    .map((r) => ({ requisition: r, last: r.history[r.history.length - 1] }))
    .sort((a, b) => (a.last.at < b.last.at ? 1 : a.last.at > b.last.at ? -1 : 0))
    .slice(0, 6);
  const selected: Requisition | undefined = db.requisitions.find((r) => r.id === decision.id);

  const rowClick = (href: string) => (event: React.MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest("a, button, [role='menu']")) return;
    router.push(href);
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "Approve Requisitions" }]} />
      <PageHeader title="Approve Requisitions" description={`${pending.length} requisition${pending.length === 1 ? "" : "s"} waiting for your approval`} />

      {message ? (
        <Banner title={message.title} onDismiss={() => setMessage(null)} className="mb-4">
          {message.text}
        </Banner>
      ) : null}

      <Card title="Waiting for approval" bodyClassName="p-0" className="mb-4">
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting for approval" description="Submitted requisitions appear here until they are approved or returned." />
        ) : (
          <Table caption="Requisitions waiting for approval">
            <thead>
              <tr>
                <th scope="col">Requisition</th>
                <th scope="col">Description</th>
                <th scope="col">{labels.costCenter}</th>
                <th scope="col">Material group</th>
                <th scope="col" className={s.tdRight}>
                  Total value
                </th>
                <th scope="col">Requested by</th>
                <th scope="col">Submitted</th>
                <th scope="col">
                  <span className={s.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => {
                const href = `/sandbox/erp/requisitions/${r.id}`;
                return (
                  <tr key={r.id} className={s.rowLink} onClick={rowClick(href)}>
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {r.id}
                      </Link>
                    </td>
                    <td>{r.description}</td>
                    <td>{costCenterLabel(getCostCenter(db, r.costCenterId), r.costCenterId)}</td>
                    <td>{r.materialGroup || "—"}</td>
                    <td className={s.tdRight}>{formatCurrency(requisitionTotal(r))}</td>
                    <td>{r.requestedBy}</td>
                    <td className={s.num}>{formatDate(r.submittedAt)}</td>
                    <td className={s.tdRight}>
                      <RequisitionRowMenu
                        requisition={r}
                        onApprove={() => setDecision({ id: r.id, mode: "approve" })}
                        onReturn={() => setDecision({ id: r.id, mode: "return" })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Recently decided" bodyClassName="p-0">
        {decided.length === 0 ? (
          <EmptyState title="No decisions yet" />
        ) : (
          <Table caption="Recently decided requisitions">
            <thead>
              <tr>
                <th scope="col">Requisition</th>
                <th scope="col">Description</th>
                <th scope="col">Status</th>
                <th scope="col">Decided by</th>
                <th scope="col">Comment</th>
              </tr>
            </thead>
            <tbody>
              {decided.map(({ requisition, last }) => {
                const href = `/sandbox/erp/requisitions/${requisition.id}`;
                return (
                  <tr key={requisition.id} className={s.rowLink} onClick={rowClick(href)}>
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {requisition.id}
                      </Link>
                    </td>
                    <td>{requisition.description}</td>
                    <td>
                      <StatusBadge status={requisition.status} />
                    </td>
                    <td>{last.actor}</td>
                    <td className="max-w-[420px] truncate" title={last.comment || undefined}>
                      {last.comment || <span className={s.faint}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <DecisionDialogs
        requisition={selected}
        mode={decision.mode}
        onClose={() => setDecision({ id: "", mode: null })}
        onDone={(outcome, done) =>
          setMessage(
            outcome === "approved"
              ? { title: "Requisition approved", text: `${done.id} · ${done.description} is released for ordering.` }
              : { title: "Requisition returned", text: `${done.id} · ${done.description} was returned to ${done.requestedBy} with your comment.` },
          )
        }
      />
    </>
  );
}
