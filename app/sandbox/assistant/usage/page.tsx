"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, getProject, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { projectPath, useUi } from "../_lib/ui-version";
import { Card, PageHeader, PageSkeleton, StatCard, Table } from "../_components/ui";
import s from "../assistant.module.css";

export default function UsagePage() {
  usePageTitle("Usage");
  const db = useDb();
  const { labels } = useUi();

  if (!db) return <PageSkeleton />;

  const conversations = db.usage.reduce((sum, row) => sum + row.conversations, 0);
  const messages = db.usage.reduce((sum, row) => sum + row.messages, 0);
  const activeUsers = db.usage.reduce((sum, row) => sum + row.activeUsers, 0);

  return (
    <>
      <PageHeader title="Usage" description="Last 30 days per project. These are seeded demo figures for this browser, not measurements." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Conversations" value={formatNumber(conversations)} hint="Seeded demo figure" />
        <StatCard label="Messages" value={formatNumber(messages)} hint="Seeded demo figure" />
        <StatCard label="Active members" value={activeUsers} hint="Sum across projects" />
      </div>
      <Card bodyClassName={s.cardBodyFlush}>
        <Table caption="Usage by project">
          <thead>
            <tr>
              <th scope="col">{labels.projects.replace(/s$/, "")}</th>
              <th scope="col" className={s.tdRight}>
                Conversations
              </th>
              <th scope="col" className={s.tdRight}>
                Messages
              </th>
              <th scope="col" className={s.tdRight}>
                Active members
              </th>
              <th scope="col">Last active</th>
            </tr>
          </thead>
          <tbody>
            {db.usage.map((row) => {
              const project = getProject(db, row.projectId);
              return (
                <tr key={row.id}>
                  <td>
                    {project ? (
                      <Link href={projectPath(project.id)} className={s.recordName}>
                        {project.name}
                      </Link>
                    ) : (
                      row.projectId
                    )}
                    <span className={cn(s.muted, "block text-xs")}>{row.projectId}</span>
                  </td>
                  <td className={cn(s.tdRight, s.num)}>{formatNumber(row.conversations)}</td>
                  <td className={cn(s.tdRight, s.num)}>{formatNumber(row.messages)}</td>
                  <td className={cn(s.tdRight, s.num)}>{row.activeUsers}</td>
                  <td className={s.num}>{formatDateTime(row.lastActiveAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
