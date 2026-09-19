"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { MoreVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteTable, formatDate, formatNumber, getProject, primaryKeyOf, tablesForProject, useDb, type DataTable } from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { projectPath, useUi } from "../../../_lib/ui-version";
import { DataDialog } from "../../../_components/dialog";
import { ProjectNotFound } from "../../../_components/not-found";
import { Button, Card, Code, EmptyState, Field, LinkButton, PageHeader, PageSkeleton, RlsBadge, Table, inputClass } from "../../../_components/ui";
import s from "../../../data.module.css";

export function TablesListPage() {
  const params = useParams<{ projectId: string }>();
  const db = useDb();
  const router = useRouter();
  const { labels, prefix } = useUi();
  const [query, setQuery] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<DataTable | null>(null);
  usePageTitle(labels.tables);

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  const all = tablesForProject(db, params.projectId);
  const needle = query.trim().toLowerCase();
  const tables = all
    .filter((table) => (needle ? [table.id, table.name, table.description].some((v) => v.toLowerCase().includes(needle)) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
  const newHref = projectPath(params.projectId, "/tables/new");

  return (
    <>
      <PageHeader
        title={labels.tables}
        description={`schema public · ${all.length} ${all.length === 1 ? "table" : "tables"} · ${tables.length} shown`}
        actions={
          <LinkButton variant="primary" href={newHref}>
            <Plus size={14} aria-hidden="true" />
            {labels.newTable}
          </LinkButton>
        }
      />
      <Card bodyClassName={s.cardBodyFlush}>
        <div className="border-b border-[#e5e7eb] p-3 sm:max-w-sm">
          <Field id={`${prefix}-table-search`} label="Search tables">
            {({ id }) => (
              <input
                id={id}
                type="search"
                className={inputClass}
                placeholder="Search by name or description"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
        </div>
        {tables.length === 0 ? (
          <EmptyState
            title={all.length === 0 ? "No tables yet" : "No tables match"}
            description={all.length === 0 ? "Create the first table in this project." : "Try a different search term."}
            action={
              all.length === 0 ? (
                <LinkButton variant="primary" href={newHref}>
                  {labels.newTable}
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Table caption="Tables in schema public">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Description</th>
                <th scope="col">Primary key</th>
                <th scope="col">Columns</th>
                <th scope="col">{labels.rls}</th>
                <th scope="col" className={s.tdRight}>
                  Rows
                </th>
                <th scope="col">Created</th>
                <th scope="col">
                  <span className={s.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => {
                const href = projectPath(params.projectId, `/tables/${table.id}`);
                return (
                  <tr
                    key={table.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a, button, [role=menu]")) return;
                      router.push(href);
                    }}
                  >
                    <td>
                      <Link href={href} className={s.tableName}>
                        {table.name}
                      </Link>
                      <span className={cn(s.muted, "block text-xs")}>{table.id}</span>
                    </td>
                    <td className={s.tdWrap}>{table.description || <span className={s.faint}>—</span>}</td>
                    <td>{primaryKeyOf(table) ? <Code>{primaryKeyOf(table)}</Code> : <span className={s.faint}>None</span>}</td>
                    <td className={s.num}>{table.columns.length}</td>
                    <td>
                      <RlsBadge enabled={table.rlsEnabled} label="Enabled" />
                    </td>
                    <td className={cn(s.tdRight, s.num)}>{formatNumber(table.rowCount)}</td>
                    <td className={s.num}>{formatDate(table.createdAt)}</td>
                    <td className={s.tdRight}>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button type="button" className={s.btnIcon} aria-label={`${labels.actionsMenu} for ${table.name}`} title={labels.actionsMenu}>
                            <MoreVertical size={16} aria-hidden="true" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
                            <DropdownMenu.Item className={s.menuItem} onSelect={() => router.push(href)}>
                              Open table
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className={s.menuItem} onSelect={() => router.push(`${projectPath(params.projectId, "/sql")}?table=${table.name}`)}>
                              Query in SQL editor
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className={s.menuSeparator} />
                            <DropdownMenu.Item
                              className={s.menuItemDanger}
                              onSelect={() => {
                                window.setTimeout(() => setDeleteTarget(table), 0);
                              }}
                            >
                              Delete table
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <DataDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete table"
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name} (${deleteTarget.id})? ${formatNumber(deleteTarget.rowCount)} rows and ${deleteTarget.policies.length} policies will be removed. This cannot be undone.`
            : ""
        }
        footer={
          <>
            <Button type="button" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (deleteTarget) deleteTable(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete table
            </Button>
          </>
        }
      />
    </>
  );
}
