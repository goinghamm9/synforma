"use client";
import * as React from "react";
import { Suspense } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber, getTable, previewRows, primaryKeyOf, removePolicy, useDb } from "../../../../_lib/db";
import { usePageTitle } from "../../../../_lib/use-page-title";
import { projectPath, useUi } from "../../../../_lib/ui-version";
import { TableNotFound } from "../../../../_components/not-found";
import { AddPolicyDialog, TableActions } from "../../../../_components/table-actions";
import { Breadcrumb, Button, Card, Code, DefinitionList, EmptyState, PageHeader, PageSkeleton, RlsBadge, Table } from "../../../../_components/ui";
import s from "../../../../data.module.css";

function CreatedBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className={cn(s.bannerSuccess, "mb-4 items-center")}>
      <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
      <div className="flex-1">
        <strong>Table created</strong>
        <span className="ml-1">The table exists in schema public and is available through the API.</span>
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

function TableDetailContent() {
  const params = useParams<{ projectId: string; id: string }>();
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const db = useDb();
  const { labels } = useUi();
  const createdFlag = search.get("created") === "1";
  const [showCreated, setShowCreated] = React.useState(createdFlag);
  const [policyOpen, setPolicyOpen] = React.useState(false);

  React.useEffect(() => {
    if (createdFlag) router.replace(pathname);
  }, [createdFlag, pathname, router]);

  const table = db ? getTable(db, params.id) : undefined;
  usePageTitle(table ? table.name : "Table");

  if (!db) return <PageSkeleton />;

  const listHref = projectPath(params.projectId, "/tables");
  if (!table || table.projectId !== params.projectId) {
    return <TableNotFound id={params.id} listHref={listHref} listLabel={labels.tables} />;
  }

  const primaryKey = primaryKeyOf(table);
  const rows = previewRows(table, 5);

  return (
    <>
      <Breadcrumb items={[{ label: labels.tables, href: listHref }, { label: table.id }]} />
      {showCreated ? <CreatedBanner onDismiss={() => setShowCreated(false)} /> : null}
      <PageHeader
        title={<span className={s.monoFace}>{table.name}</span>}
        meta={<RlsBadge enabled={table.rlsEnabled} label={`${labels.rls} enabled`} />}
        description={table.description ? `${table.description} · ${table.id}` : `Table ${table.id}`}
        actions={<TableActions table={table} />}
      />

      <div className="grid grid-cols-1 gap-4">
        <Card title="Details">
          <DefinitionList
            rows={[
              { label: "Table ID", value: table.id },
              { label: "Table name", value: <Code>{table.name}</Code> },
              { label: "Description", value: table.description },
              { label: "Schema", value: table.schema },
              { label: "Primary key", value: primaryKey ? <Code>{primaryKey}</Code> : "None" },
              { label: labels.rls, value: table.rlsEnabled ? "Enabled" : "Disabled" },
              {
                label: "Policies",
                value:
                  table.policies.length === 0 ? (
                    "None"
                  ) : (
                    <ul className="m-0 list-none p-0">
                      {table.policies.map((policy) => (
                        <li key={policy.id}>
                          {policy.name} · {policy.role} · {policy.command}
                        </li>
                      ))}
                    </ul>
                  ),
              },
              { label: "Columns", value: `${table.columns.length}` },
              { label: "Rows", value: formatNumber(table.rowCount) },
              { label: "Created", value: `${formatDate(table.createdAt)} · ${table.createdBy}` },
            ]}
          />
        </Card>

        <Card bodyClassName={s.cardBodyTabs}>
          <Tabs.Root defaultValue="columns">
            <Tabs.List className={s.tabList} aria-label="Table sections">
              <Tabs.Trigger value="columns" className={s.tab}>
                Columns
              </Tabs.Trigger>
              <Tabs.Trigger value="policies" className={s.tab}>
                Policies
              </Tabs.Trigger>
              <Tabs.Trigger value="preview" className={s.tab}>
                Data preview
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="columns" className={s.tabPanel}>
              <Table caption="Columns">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Nullable</th>
                    <th scope="col">Primary key</th>
                    <th scope="col">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((column) => (
                    <tr key={column.name}>
                      <td className={s.mono}>{column.name}</td>
                      <td className={s.mono}>{column.type}</td>
                      <td>{column.nullable ? "Yes" : "No"}</td>
                      <td>{column.primaryKey ? "Yes" : "—"}</td>
                      <td>{column.defaultValue ? <Code>{column.defaultValue}</Code> : <span className={s.faint}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Tabs.Content>
            <Tabs.Content value="policies" className={s.tabPanel}>
              {!table.rlsEnabled ? (
                <div role="note" className={cn(s.bannerWarning, "mb-3")}>
                  <span>
                    {labels.rls} is disabled on this table, so policies are not enforced.
                  </span>
                </div>
              ) : null}
              {table.policies.length === 0 ? (
                <EmptyState
                  title="No policies"
                  description="Without a policy, no rows are readable through the API while row level security is on."
                  action={
                    <Button variant="primary" onClick={() => setPolicyOpen(true)}>
                      {labels.addPolicy}
                    </Button>
                  }
                />
              ) : (
                <Table caption="Policies">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Role</th>
                      <th scope="col">Command</th>
                      <th scope="col">Using expression</th>
                      <th scope="col">Created</th>
                      <th scope="col">
                        <span className={s.srOnly}>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.policies.map((policy) => (
                      <tr key={policy.id}>
                        <td className="font-semibold">{policy.name}</td>
                        <td className={s.mono}>{policy.role}</td>
                        <td className={s.mono}>{policy.command}</td>
                        <td className={s.tdWrap}>
                          <Code>{policy.using}</Code>
                        </td>
                        <td className={s.num}>{formatDate(policy.createdAt)}</td>
                        <td className={s.tdRight}>
                          <Button size="sm" variant="danger" aria-label={`Remove policy ${policy.name}`} onClick={() => removePolicy(table.id, policy.id)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <AddPolicyDialog table={table} open={policyOpen} onOpenChange={setPolicyOpen} />
            </Tabs.Content>
            <Tabs.Content value="preview" className={s.tabPanel}>
              {rows.length === 0 ? (
                <EmptyState title="No rows yet" description="Rows inserted through the API or the SQL editor appear here." />
              ) : (
                <Table caption="Data preview">
                  <thead>
                    <tr>
                      {table.columns.map((column) => (
                        <th key={column.name} scope="col">
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index}>
                        {table.columns.map((column) => (
                          <td key={column.name} className={s.mono}>
                            {row[column.name]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <p className={cn(s.muted, "mt-3 mb-0 text-xs")}>
                Showing {rows.length} of {formatNumber(table.rowCount)} rows.
              </p>
            </Tabs.Content>
          </Tabs.Root>
        </Card>
      </div>
    </>
  );
}

export function TableDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TableDetailContent />
    </Suspense>
  );
}
