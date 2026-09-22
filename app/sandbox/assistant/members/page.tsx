"use client";
import { cn } from "@/lib/utils";
import { formatDate, initials, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Badge, Card, PageHeader, PageSkeleton, StatusBadge, Table } from "../_components/ui";
import s from "../assistant.module.css";

export default function MembersPage() {
  usePageTitle("Members");
  const db = useDb();

  if (!db) return <PageSkeleton />;

  return (
    <>
      <PageHeader title="Members" description={`${db.members.length} members in this workspace. Reviewers approve instructions before a project goes live.`} />
      <Card bodyClassName={s.cardBodyFlush}>
        <Table caption="Members">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
            </tr>
          </thead>
          <tbody>
            {db.members.map((member) => (
              <tr key={member.id}>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <span className={s.avatar} aria-hidden="true">
                      {initials(member.name)}
                    </span>
                    <span className="font-semibold">{member.name}</span>
                  </span>
                </td>
                <td className={cn(s.muted)}>{member.email}</td>
                <td>{member.role === "Reviewer" ? <Badge tone="indigo">Reviewer</Badge> : member.role}</td>
                <td>
                  <StatusBadge status={member.status} />
                </td>
                <td className={s.num}>{formatDate(member.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
