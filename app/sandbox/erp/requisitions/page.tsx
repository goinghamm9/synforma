"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { REQUISITION_STATUSES, costCenterLabel, formatCurrency, formatDate, getCostCenter, requisitionTotal, sortByCreated, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { useUi } from "../_lib/ui-version";
import { Breadcrumb, Card, EmptyState, Field, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table, inputClass, selectClass } from "../_components/ui";
import s from "../erp.module.css";

export default function RequisitionsPage() {
  usePageTitle("My Purchase Requisitions");
  const db = useDb();
  const router = useRouter();
  const { labels } = useUi();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");
  const [costCenterId, setCostCenterId] = React.useState("All");

  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const rows = sortByCreated(db.requisitions)
    .filter((r) => (status === "All" ? true : r.status === status))
    .filter((r) => (costCenterId === "All" ? true : r.costCenterId === costCenterId))
    .filter((r) => (needle ? [r.id, r.description, r.materialGroup, r.requestedBy].some((v) => v.toLowerCase().includes(needle)) : true));

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "My Purchase Requisitions" }]} />
      <PageHeader
        title="My Purchase Requisitions"
        description={`${db.requisitions.length} requisitions · ${rows.length} shown`}
        actions={
          <LinkButton href="/sandbox/erp/requisitions/new" variant="primary">
            {labels.createRequisitionTile}
          </LinkButton>
        }
      />
      <Card bodyClassName="p-0">
        <div className={s.filterBar}>
          <Field id="requisition-search" label="Search">
            {({ id }) => (
              <input
                id={id}
                type="search"
                className={inputClass}
                placeholder="Requisition, description or requester"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
          <Field id="requisition-status" label="Status">
            {({ id }) => (
              <select id={id} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="All">All statuses</option>
                {REQUISITION_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="requisition-cost-center" label={labels.costCenter}>
            {({ id }) => (
              <select id={id} className={selectClass} value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)}>
                <option value="All">All {labels.costCenter.toLowerCase()}s</option>
                {db.costCenters.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {costCenterLabel(entry)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No requisitions match" description="Try a different search term or clear the filters." />
        ) : (
          <Table caption="My Purchase Requisitions">
            <thead>
              <tr>
                <th scope="col">Requisition</th>
                <th scope="col">Description</th>
                <th scope="col">{labels.costCenter}</th>
                <th scope="col">Material group</th>
                <th scope="col" className={s.tdRight}>
                  Total value
                </th>
                <th scope="col">Status</th>
                <th scope="col">Requested by</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = `/sandbox/erp/requisitions/${r.id}`;
                return (
                  <tr
                    key={r.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {r.id}
                      </Link>
                    </td>
                    <td>{r.description}</td>
                    <td>{costCenterLabel(getCostCenter(db, r.costCenterId), r.costCenterId)}</td>
                    <td>{r.materialGroup || "—"}</td>
                    <td className={s.tdRight}>{formatCurrency(requisitionTotal(r))}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>{r.requestedBy}</td>
                    <td className={s.num}>{formatDate(r.createdAt)}</td>
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
