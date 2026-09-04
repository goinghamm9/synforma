"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { activitiesFor, formatDateTime, getOpportunity, useDb } from "../../_lib/db";
import { opportunityRows } from "../../_lib/opportunity-view";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { Card, EmptyState, LinkButton, PageHeader, PageSkeleton, StageBadge } from "../../_components/ui";
import s from "../../crm.module.css";

function CreatedBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className={cn(s.bannerSuccess, "mb-4 items-center")}>
      <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
      <div className="flex-1">
        <strong>Opportunity created</strong>
        <span className="ml-1">The record has been saved and added to the pipeline.</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-inherit hover:bg-white/60"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function OpportunityDetailContent() {
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

  const opportunity = db ? getOpportunity(db, params.id) : undefined;
  usePageTitle(opportunity ? opportunity.name : "Opportunity");

  if (!db) return <PageSkeleton />;

  if (!opportunity) {
    return (
      <>
        <PageHeader title="Opportunity not found" description={`No opportunity with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This opportunity may have been removed"
            description="Return to the opportunities list to find the record you were looking for."
            action={<LinkButton href="/sandbox/crm/opportunities">Back to opportunities</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const rows = opportunityRows(db, opportunity, labels);
  const activities = activitiesFor(db, { opportunityId: opportunity.id });

  return (
    <>
      <nav aria-label="Breadcrumb" className={cn(s.muted, "mb-2 text-xs")}>
        <Link href="/sandbox/crm/opportunities" className={s.link}>
          Opportunities
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{opportunity.id}</span>
      </nav>
      {showCreated ? <CreatedBanner onDismiss={() => setShowCreated(false)} /> : null}
      <PageHeader
        title={opportunity.name}
        meta={<StageBadge stage={opportunity.stage} />}
        description={
          opportunity.sourceLeadId ? (
            <>
              Created from lead{" "}
              <Link href={`/sandbox/crm/leads/${opportunity.sourceLeadId}`} className={s.link}>
                {opportunity.sourceLeadId}
              </Link>
            </>
          ) : (
            `Opportunity ${opportunity.id}`
          )
        }
        actions={<LinkButton href="/sandbox/crm/opportunities">All opportunities</LinkButton>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <dl className={s.dl}>
            {rows.map((row) => (
              <React.Fragment key={row.key}>
                <dt>{row.label}</dt>
                <dd>
                  {row.value === "" ? (
                    <span className={s.faint}>—</span>
                  ) : row.key === "sourceLead" ? (
                    <Link href={`/sandbox/crm/leads/${row.value}`} className={s.link}>
                      {row.value}
                    </Link>
                  ) : (
                    row.value
                  )}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </Card>
        <Card title="Activity">
          {activities.length === 0 ? (
            <EmptyState title="No activity recorded" description="Updates to this opportunity will appear here." />
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
        </Card>
      </div>
    </>
  );
}

export default function OpportunityDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OpportunityDetailContent />
    </Suspense>
  );
}
