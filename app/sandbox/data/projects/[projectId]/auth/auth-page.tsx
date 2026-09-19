"use client";
import { useParams } from "next/navigation";
import { Switch } from "radix-ui";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, getProject, setAuthProvider, useDb } from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { useUi } from "../../../_lib/ui-version";
import { ProjectNotFound } from "../../../_components/not-found";
import { Badge, Card, PageHeader, PageSkeleton, Table } from "../../../_components/ui";
import s from "../../../data.module.css";

export function AuthPage() {
  const params = useParams<{ projectId: string }>();
  const db = useDb();
  const { prefix } = useUi();
  usePageTitle("Authentication");

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  const users = [...db.authUsers].sort((a, b) => (a.lastSignInAt < b.lastSignInAt ? 1 : -1));
  const enabled = db.authProviders.filter((p) => p.enabled).length;

  return (
    <>
      <PageHeader title="Authentication" description={`${db.authUsers.length} users · ${enabled} sign-in providers enabled`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="Users" bodyClassName={s.cardBodyFlush}>
          <Table caption="Auth users">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Provider</th>
                <th scope="col">Status</th>
                <th scope="col">Last sign-in</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="font-semibold">{user.email}</span>
                    <span className={cn(s.muted, "block text-xs")}>{user.id}</span>
                  </td>
                  <td>{user.provider}</td>
                  <td>{user.confirmed ? <Badge tone="green">Confirmed</Badge> : <Badge tone="amber">Waiting for confirmation</Badge>}</td>
                  <td className={s.num}>{formatDateTime(user.lastSignInAt)}</td>
                  <td className={s.num}>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Sign-in providers">
          <ul className="m-0 list-none p-0">
            {db.authProviders.map((provider) => {
              const id = `${prefix}-provider-${provider.id}`;
              return (
                <li key={provider.id} className={s.healthRow}>
                  <label htmlFor={id} className={s.labelInline}>
                    {provider.name}
                  </label>
                  <Switch.Root id={id} className={s.switch} checked={provider.enabled} onCheckedChange={(checked) => setAuthProvider(provider.id, checked)}>
                    <Switch.Thumb className={s.switchThumb} />
                  </Switch.Root>
                </li>
              );
            })}
          </ul>
          <p className={cn(s.muted, "mt-3 mb-0 text-xs")}>Disabling a provider signs out nobody; existing sessions stay valid until they expire.</p>
        </Card>
      </div>
    </>
  );
}
