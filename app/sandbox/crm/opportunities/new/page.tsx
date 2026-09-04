"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { getLead, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { OpportunityWizard } from "../../_components/opportunity-wizard";
import { Card, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table } from "../../_components/ui";
import s from "../../crm.module.css";

function NewOpportunityContent() {
  usePageTitle("New opportunity");
  const params = useSearchParams();
  const leadId = params.get("lead");
  const db = useDb();
  const { labels } = useUi();

  if (!db) return <PageSkeleton />;

  const lead = leadId ? getLead(db, leadId) : undefined;

  if (!leadId || !lead) {
    const openLeads = db.leads.filter((l) => !l.convertedOpportunityId);
    return (
      <>
        <PageHeader
          title="New opportunity"
          description={
            leadId
              ? `Lead ${leadId} was not found. Opportunities are created from an existing lead; choose one below.`
              : "Opportunities are created from an existing lead. Choose the lead to convert."
          }
        />
        <Card bodyClassName="p-0">
          {openLeads.length === 0 ? (
            <EmptyState
              title="No leads available"
              description="Every lead has already been converted."
              action={<LinkButton href="/sandbox/crm/leads">View leads</LinkButton>}
            />
          ) : (
            <Table caption="Leads available for conversion">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Lead</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">
                    <span className={s.srOnly}>Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {openLeads.map((l) => (
                  <tr key={l.id}>
                    <td className={s.num}>
                      <Link href={`/sandbox/crm/leads/${l.id}`} className={s.link}>
                        {l.id}
                      </Link>
                    </td>
                    <td>{l.name}</td>
                    <td>
                      <StatusBadge status={l.status} />
                    </td>
                    <td>{l.owner}</td>
                    <td className={s.tdRight}>
                      <Link href={`/sandbox/crm/opportunities/new?lead=${l.id}`} className={cn(s.btnSecondary, s.btnSm)}>
                        {labels.convertToOpportunity}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className={cn(s.muted, "mb-2 text-xs")}>
        <Link href="/sandbox/crm/leads" className={s.link}>
          Leads
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/sandbox/crm/leads/${lead.id}`} className={s.link}>
          {lead.id}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>New opportunity</span>
      </nav>
      <PageHeader title="New opportunity" description={`Converting lead ${lead.id} · ${lead.name}`} />
      <OpportunityWizard key={lead.id} db={db} lead={lead} />
    </>
  );
}

export default function NewOpportunityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewOpportunityContent />
    </Suspense>
  );
}
