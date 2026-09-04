"use client";
import Link from "next/link";
import { BarChart3, Building2, Contact, Settings, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_USER, formatCurrency, formatDateTime, recentActivities, useDb } from "./_lib/db";
import { usePageTitle } from "./_lib/use-page-title";
import { Card, EmptyState, PageHeader, PageSkeleton, StatCard } from "./_components/ui";
import s from "./crm.module.css";

const QUICK_LINKS = [
  { href: "/sandbox/crm/leads", label: "Leads", icon: Users },
  { href: "/sandbox/crm/opportunities", label: "Opportunities", icon: Target },
  { href: "/sandbox/crm/accounts", label: "Accounts", icon: Building2 },
  { href: "/sandbox/crm/contacts", label: "Contacts", icon: Contact },
  { href: "/sandbox/crm/reports", label: "Reports", icon: BarChart3 },
  { href: "/sandbox/crm/settings", label: "Settings", icon: Settings },
];

export default function CrmHomePage() {
  usePageTitle("Home");
  const db = useDb();
  if (!db) return <PageSkeleton />;

  const pipelineValue = db.opportunities.reduce((sum, o) => sum + o.amount, 0);
  const openLeads = db.leads.filter((l) => l.status === "New" || l.status === "Working").length;
  const nurturing = db.leads.filter((l) => l.status === "Nurturing").length;
  const lateStage = db.opportunities.filter((o) => o.stage === "Proposal" || o.stage === "Negotiation").length;
  const activities = recentActivities(db, 8);
  const firstName = CURRENT_USER.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} description="Here is what changed across your pipeline." />

      <section aria-labelledby="pipeline-heading" className="mb-5">
        <h2 id="pipeline-heading" className={cn(s.h2, "mb-3")}>
          My pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open opportunities" value={db.opportunities.length} hint={`${lateStage} in Proposal or Negotiation`} />
          <StatCard label="Pipeline value" value={formatCurrency(pipelineValue)} hint="Sum of open opportunity amounts" />
          <StatCard label="Open leads" value={openLeads} hint="New and Working" />
          <StatCard label="Nurturing leads" value={nurturing} hint="Revisit when timing improves" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recent activity" className="lg:col-span-2" bodyClassName="p-0">
          {activities.length === 0 ? (
            <EmptyState title="No activity yet" description="Activity appears here as leads and opportunities change." />
          ) : (
            <ul className="m-0 list-none divide-y divide-[#d5dbe1] p-0">
              {activities.map((activity) => {
                const href = activity.opportunityId
                  ? `/sandbox/crm/opportunities/${activity.opportunityId}`
                  : activity.leadId
                    ? `/sandbox/crm/leads/${activity.leadId}`
                    : null;
                const ref = activity.opportunityId ?? activity.leadId;
                return (
                  <li key={activity.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                    <span className={cn(s.muted, s.num, "shrink-0 text-xs sm:w-32 sm:pt-0.5")}>{formatDateTime(activity.at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{activity.text}</span>
                      <span className={cn(s.muted, "text-xs")}>
                        {activity.actor}
                        {href && ref ? (
                          <>
                            {" · "}
                            <Link href={href} className={s.link}>
                              {ref}
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>
                );
              })}
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
    </>
  );
}
