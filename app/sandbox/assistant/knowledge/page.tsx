"use client";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, projectsUsingSource, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { useUi } from "../_lib/ui-version";
import { Card, PageHeader, PageSkeleton, StatusBadge, Table } from "../_components/ui";
import s from "../assistant.module.css";

export default function KnowledgePage() {
  const db = useDb();
  const { labels } = useUi();
  usePageTitle(labels.knowledge);

  if (!db) return <PageSkeleton />;

  return (
    <>
      <PageHeader title={labels.knowledge} description={`${db.sources.length} sources connected to this workspace. Projects answer only from the sources connected to them.`} />
      <Card bodyClassName={s.cardBodyFlush}>
        <Table caption={labels.knowledge}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col" className={s.tdRight}>
                Documents
              </th>
              <th scope="col">Status</th>
              <th scope="col">Last synced</th>
              <th scope="col">Used by</th>
            </tr>
          </thead>
          <tbody>
            {db.sources.map((source) => {
              const users = projectsUsingSource(db, source.name);
              return (
                <tr key={source.id}>
                  <td>
                    <span className="font-semibold">{source.name}</span>
                    <span className={cn(s.muted, "block text-xs")}>{source.id}</span>
                  </td>
                  <td>{source.kind}</td>
                  <td className={cn(s.tdRight, s.num)}>{formatNumber(source.documents)}</td>
                  <td>
                    <StatusBadge status={source.status} />
                  </td>
                  <td className={s.num}>{formatDateTime(source.lastSyncedAt)}</td>
                  <td>
                    {users.length} {users.length === 1 ? "project" : "projects"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
