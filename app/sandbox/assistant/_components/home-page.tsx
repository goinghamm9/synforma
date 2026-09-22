"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CURRENT_USER, formatDate, formatNumber, isApprovedTemplate, recentProjects, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { BASE_PATH, projectPath, useUi } from "../_lib/ui-version";
import { Card, LinkButton, PageHeader, PageSkeleton, StatCard, StatusBadge, Table } from "./ui";
import s from "../assistant.module.css";

export function HomePage() {
  usePageTitle("Home");
  const db = useDb();
  const { labels } = useUi();

  if (!db) return <PageSkeleton />;

  const active = db.projects.filter((p) => p.status !== "Archived");
  const approved = active.filter((p) => isApprovedTemplate(p.template)).length;
  const connected = db.sources.filter((source) => source.status === "Connected").length;
  const conversations = db.usage.reduce((sum, row) => sum + row.conversations, 0);
  const recent = recentProjects(db, 5);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${CURRENT_USER.firstName}`}
        description="Here is what changed in your workspace. Usage figures are seeded demo data for this browser."
        actions={<LinkButton href={`${BASE_PATH}/projects`}>View all {labels.projects.toLowerCase()}</LinkButton>}
      />

      <section aria-labelledby="overview-heading" className="mb-5">
        <h2 id="overview-heading" className={s.sectionHeading}>
          Workspace overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={labels.projects} value={active.length} hint={`${approved} of ${active.length} on an approved instruction template`} />
          <StatCard label={labels.knowledge} value={db.sources.length} hint={`${connected} connected, ${db.sources.length - connected} syncing`} />
          <StatCard label="Members" value={db.members.length} hint={`${db.members.filter((m) => m.role === "Reviewer").length} reviewers`} />
          <StatCard label="Conversations (30 days)" value={formatNumber(conversations)} hint="Seeded demo figure" />
        </div>
      </section>

      <Card title={`Recent ${labels.projects.toLowerCase()}`} bodyClassName={s.cardBodyFlush}>
        <Table caption={`Recent ${labels.projects.toLowerCase()}`}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Model</th>
              <th scope="col">Instruction template</th>
              <th scope="col">Data retention</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link href={projectPath(project.id)} className={s.recordName}>
                    {project.name}
                  </Link>
                  <span className={cn(s.muted, "block text-xs")}>{project.id}</span>
                </td>
                <td>{project.model}</td>
                <td>{project.template}</td>
                <td>{project.retention}</td>
                <td>
                  <StatusBadge status={project.status} />
                </td>
                <td className={s.num}>{formatDate(project.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
