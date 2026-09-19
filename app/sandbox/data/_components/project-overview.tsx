"use client";
import Link from "next/link";
import { HardDrive, KeyRound, ShieldCheck, Table2, Terminal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, formatDateTime, formatNumber, getProject, keysForProject, recentActivities, tablesForProject, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { projectPath, useUi } from "../_lib/ui-version";
import { ProjectNotFound } from "./not-found";
import { Badge, Card, EmptyState, LinkButton, PageHeader, PageSkeleton, StatCard } from "./ui";
import s from "../data.module.css";

export function ProjectOverview({ projectId }: { projectId: string }) {
  const db = useDb();
  const { labels } = useUi();
  const project = db ? getProject(db, projectId) : undefined;
  usePageTitle(project ? project.name : "Home");

  if (!db) return <PageSkeleton />;
  if (!project) return <ProjectNotFound projectId={projectId} />;

  const tables = tablesForProject(db, projectId);
  const rlsOn = tables.filter((t) => t.rlsEnabled).length;
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const confirmed = db.authUsers.filter((u) => u.confirmed).length;
  const objects = db.buckets.reduce((sum, b) => sum + b.objects, 0);
  const bytes = db.buckets.reduce((sum, b) => sum + b.sizeBytes, 0);
  const keys = keysForProject(db, projectId);
  const activities = recentActivities(db, 8);

  const quickLinks = [
    { href: projectPath(projectId, "/tables"), label: labels.tables, icon: Table2 },
    { href: projectPath(projectId, "/sql"), label: "SQL editor", icon: Terminal },
    { href: projectPath(projectId, "/auth"), label: "Authentication", icon: ShieldCheck },
    { href: projectPath(projectId, "/storage"), label: "Storage", icon: HardDrive },
    { href: projectPath(projectId, "/api-keys"), label: "API keys", icon: KeyRound },
    { href: projectPath(projectId, "/team"), label: "Team", icon: Users },
  ];

  return (
    <>
      <PageHeader
        title={project.name}
        meta={<Badge tone="green">{project.status}</Badge>}
        description={`Project ${project.id} · ${project.region} · ${project.engine} · ${project.plan} plan`}
        actions={
          <LinkButton variant="primary" href={projectPath(projectId, "/tables/new")}>
            {labels.newTable}
          </LinkButton>
        }
      />

      <section aria-labelledby="overview-heading" className="mb-5">
        <h2 id="overview-heading" className={s.sectionHeading}>
          Project overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tables" value={tables.length} hint={`${rlsOn} of ${tables.length} with row level security`} />
          <StatCard label="Rows stored" value={formatNumber(totalRows)} hint="Across all tables in schema public" />
          <StatCard label="Auth users" value={db.authUsers.length} hint={`${confirmed} confirmed`} />
          <StatCard label="Storage objects" value={formatNumber(objects)} hint={`${db.buckets.length} buckets · ${formatBytes(bytes)}`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Recent activity" className="lg:col-span-2" bodyClassName={s.cardBodyFlush}>
          {activities.length === 0 ? (
            <EmptyState title="No activity yet" description="Changes to tables, policies, keys and members appear here." />
          ) : (
            <ul className="m-0 list-none divide-y divide-[#e5e7eb] p-0">
              {activities.map((activity) => (
                <li key={activity.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                  <span className={cn(s.muted, s.num, "shrink-0 text-xs sm:w-32 sm:pt-0.5")}>{formatDateTime(activity.at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{activity.text}</span>
                    <span className={cn(s.muted, "text-xs")}>
                      {activity.actor}
                      {activity.tableId ? (
                        <>
                          {" · "}
                          <Link href={projectPath(projectId, `/tables/${activity.tableId}`)} className={s.link}>
                            {activity.tableId}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-4 content-start">
          <Card title="Project health">
            <ul className="m-0 list-none p-0">
              {[
                ["Database", project.status],
                ["REST API", "Healthy"],
                ["Auth", "Healthy"],
                ["Storage", "Healthy"],
              ].map(([name, status]) => (
                <li key={name} className={s.healthRow}>
                  <span>{name}</span>
                  <Badge tone="green">{status}</Badge>
                </li>
              ))}
              <li className={s.healthRow}>
                <span>API keys</span>
                <span className={s.muted}>{keys.length} active</span>
              </li>
            </ul>
          </Card>
          <Card title="Quick links">
            <nav aria-label="Quick links" className="grid gap-2">
              {quickLinks.map((item) => (
                <Link key={item.href} href={item.href} className={s.quickLink}>
                  <item.icon size={16} aria-hidden="true" className={s.muted} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </Card>
        </div>
      </div>
    </>
  );
}
