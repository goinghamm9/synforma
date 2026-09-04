"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { cn } from "@/lib/utils";
import { activitiesFor, formatDate, formatDateTime, getAccount, getLead, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { LeadActions } from "../../_components/lead-actions";
import { Card, DefinitionList, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge } from "../../_components/ui";
import s from "../../crm.module.css";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const lead = db ? getLead(db, params.id) : undefined;
  usePageTitle(lead ? lead.company : "Lead");

  if (!db) return <PageSkeleton />;

  if (!lead) {
    return (
      <>
        <PageHeader title="Lead not found" description={`No lead with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This lead may have been removed"
            description="Return to the leads list to find the record you were looking for."
            action={<LinkButton href="/sandbox/crm/leads">Back to leads</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const account = getAccount(db, lead.accountId);
  const activities = activitiesFor(db, { leadId: lead.id });

  return (
    <>
      <nav aria-label="Breadcrumb" className={cn(s.muted, "mb-2 text-xs")}>
        <Link href="/sandbox/crm/leads" className={s.link}>
          Leads
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{lead.id}</span>
      </nav>
      <PageHeader
        title={lead.company}
        meta={<StatusBadge status={lead.status} />}
        description={
          <>
            {lead.name} · Lead {lead.id}
            {lead.convertedOpportunityId ? (
              <>
                {" · Converted to "}
                <Link href={`/sandbox/crm/opportunities/${lead.convertedOpportunityId}`} className={s.link}>
                  {lead.convertedOpportunityId}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={<LeadActions lead={lead} />}
      />

      <Card bodyClassName="pt-2">
        <Tabs.Root defaultValue="overview">
          <Tabs.List className={s.tabList} aria-label="Lead sections">
            <Tabs.Trigger value="overview" className={s.tab}>
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger value="activity" className={s.tab}>
              Activity
            </Tabs.Trigger>
            <Tabs.Trigger value="files" className={s.tab}>
              Files
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview" className={s.tabPanel}>
            <DefinitionList
              rows={[
                { label: "Lead ID", value: lead.id },
                { label: "Lead name", value: lead.name },
                { label: "Company", value: lead.company },
                { label: "Account", value: account ? `${account.name} (${account.id})` : lead.accountId },
                { label: "Contact", value: lead.contactName },
                { label: "Source", value: lead.source },
                { label: "Status", value: lead.status },
                { label: "Owner", value: lead.owner },
                { label: "Created", value: formatDate(lead.createdAt) },
                { label: "Notes", value: lead.notes },
              ]}
            />
          </Tabs.Content>
          <Tabs.Content value="activity" className={s.tabPanel}>
            {activities.length === 0 ? (
              <EmptyState title="No activity recorded" description="Calls, emails and status changes will appear here." />
            ) : (
              <ol className={s.timeline}>
                {activities.map((activity) => (
                  <li key={activity.id} className={s.timelineItem}>
                    <div className={cn(s.muted, s.num, "text-xs")}>
                      {formatDateTime(activity.at)} · {activity.actor}
                    </div>
                    <div>{activity.text}</div>
                  </li>
                ))}
              </ol>
            )}
          </Tabs.Content>
          <Tabs.Content value="files" className={s.tabPanel}>
            <EmptyState title="No files attached" description="Documents shared with this lead will be listed here. File upload is not available in the sandbox." />
          </Tabs.Content>
        </Tabs.Root>
      </Card>
    </>
  );
}
