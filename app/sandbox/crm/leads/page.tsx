"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LEAD_STATUSES, formatDate, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, Field, PageHeader, PageSkeleton, StatusBadge, Table, inputClass, selectClass } from "../_components/ui";
import s from "../crm.module.css";

export default function LeadsPage() {
  usePageTitle("Leads");
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");

  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const leads = db.leads
    .filter((lead) => (status === "All" ? true : lead.status === status))
    .filter((lead) =>
      needle
        ? [lead.id, lead.name, lead.company, lead.contactName, lead.owner, lead.source].some((v) => v.toLowerCase().includes(needle))
        : true,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return (
    <>
      <PageHeader title="Leads" description={`${db.leads.length} leads · ${leads.length} shown`} />
      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-[#d5dbe1] p-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Field id="lead-search" label="Search">
            {({ id }) => (
              <input
                id={id}
                type="search"
                className={inputClass}
                placeholder="Search by ID, company, contact or owner"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
          <Field id="lead-status" label="Status">
            {({ id }) => (
              <select id={id} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="All">All statuses</option>
                {LEAD_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {leads.length === 0 ? (
          <EmptyState title="No leads match" description="Try a different search term or clear the status filter." />
        ) : (
          <Table caption="Leads">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Company</th>
                <th scope="col">Contact</th>
                <th scope="col">Status</th>
                <th scope="col">Source</th>
                <th scope="col">Owner</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const href = `/sandbox/crm/leads/${lead.id}`;
                return (
                  <tr
                    key={lead.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={s.link}>
                        {lead.id}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {lead.company}
                      </Link>
                      <span className={cn(s.muted, "block text-xs")}>{lead.title}</span>
                    </td>
                    <td>{lead.contactName}</td>
                    <td>
                      <StatusBadge status={lead.status} />
                    </td>
                    <td>{lead.source}</td>
                    <td>{lead.owner}</td>
                    <td className={s.num}>{formatDate(lead.createdAt)}</td>
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
