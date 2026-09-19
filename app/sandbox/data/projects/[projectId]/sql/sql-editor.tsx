"use client";
import * as React from "react";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, getProject, previewRows, tablesForProject, useDb, type NimbusDb } from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { useUi } from "../../../_lib/ui-version";
import { ProjectNotFound } from "../../../_components/not-found";
import { Button, Card, Field, PageHeader, PageSkeleton, Table, textareaMonoClass } from "../../../_components/ui";
import s from "../../../data.module.css";

type QueryResult =
  | { kind: "rows"; columns: string[]; rows: Record<string, string>[]; ms: number }
  | { kind: "ok"; message: string; ms: number }
  | { kind: "error"; message: string };

const SAVED_QUERIES = [
  { name: "Recent orders", sql: "select id, status, total_cents, created_at\nfrom orders\norder by created_at desc\nlimit 5;" },
  { name: "Unpaid invoices", sql: "select id, customer_id, amount_cents, issued_at\nfrom invoices\nwhere paid = false\nlimit 5;" },
  { name: "Active products", sql: "select sku, name, price_cents\nfrom products\nwhere active = true\nlimit 5;" },
];

function runQuery(db: NimbusDb, projectId: string, sql: string): QueryResult {
  const text = sql.trim();
  if (!text) return { kind: "error", message: "Enter a query to run." };
  const ms = 8 + Math.floor(Math.random() * 40);
  const from = /\bfrom\s+(?:public\.)?([a-z_][a-z0-9_]*)/i.exec(text);
  if (/^select\b/i.test(text) && from) {
    const table = tablesForProject(db, projectId).find((t) => t.name === from[1].toLowerCase());
    if (!table) return { kind: "error", message: `relation "${from[1]}" does not exist` };
    const limitMatch = /\blimit\s+(\d+)/i.exec(text);
    const limit = limitMatch ? Math.min(Number(limitMatch[1]), 20) : 5;
    const rows = previewRows(table, Math.min(limit, table.rowCount === 0 ? 0 : limit));
    return { kind: "rows", columns: table.columns.map((c) => c.name), rows, ms };
  }
  if (/^select\b/i.test(text)) return { kind: "rows", columns: ["?column?"], rows: [{ "?column?": "1" }], ms };
  if (/^(create|alter|drop|insert|update|delete|grant|revoke|truncate|comment|begin|commit)\b/i.test(text)) {
    return { kind: "ok", message: "Statement executed (simulated). The demo data was not changed.", ms };
  }
  const firstWord = text.split(/\s+/)[0];
  return { kind: "error", message: `syntax error at or near "${firstWord}"` };
}

function SqlEditorContent() {
  const params = useParams<{ projectId: string }>();
  const search = useSearchParams();
  const db = useDb();
  const { prefix } = useUi();
  const presetTable = search.get("table");
  const [query, setQuery] = React.useState(() => `select * from ${presetTable && /^[a-z_][a-z0-9_]*$/.test(presetTable) ? presetTable : "customers"} limit 5;`);
  const [result, setResult] = React.useState<QueryResult | null>(null);
  usePageTitle("SQL editor");

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  function run(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (db) setResult(runQuery(db, params.projectId, query));
  }

  return (
    <>
      <PageHeader title="SQL editor" description={`Runs against ${project.name} (${project.engine}). Results are simulated in this demo.`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid grid-cols-1 gap-4">
          <Card>
            <form onSubmit={run} className="grid gap-3">
              <Field id={`${prefix}-sql-query`} label="Query" help="Statements run with the signed-in user's privileges.">
                {({ id, describedBy }) => (
                  <textarea
                    id={id}
                    name="query"
                    className={textareaMonoClass}
                    value={query}
                    spellCheck={false}
                    aria-describedby={describedBy}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary">
                  <Play size={14} aria-hidden="true" />
                  Run
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResult(null);
                  }}
                >
                  Clear
                </Button>
              </div>
            </form>
          </Card>
          <Card title="Results" bodyClassName={s.cardBodyFlush}>
            <div className={s.resultBox} role="region" aria-live="polite" aria-label="Query results">
              {result === null ? (
                <p className={cn(s.muted, "m-0 p-4 text-[13px]")}>Run a query to see results here.</p>
              ) : result.kind === "error" ? (
                <p role="alert" className={cn(s.error, "m-0 p-4 text-[13px]")}>
                  ERROR: {result.message}
                </p>
              ) : result.kind === "ok" ? (
                <p role="status" className="m-0 p-4 text-[13px]">
                  {result.message} <span className={s.muted}>· {result.ms} ms</span>
                </p>
              ) : (
                <>
                  <Table caption="Query results">
                    <thead>
                      <tr>
                        {result.columns.map((column) => (
                          <th key={column} scope="col">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.length === 0 ? (
                        <tr>
                          <td colSpan={result.columns.length} className={s.muted}>
                            No rows
                          </td>
                        </tr>
                      ) : (
                        result.rows.map((row, index) => (
                          <tr key={index}>
                            {result.columns.map((column) => (
                              <td key={column} className={s.mono}>
                                {row[column]}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                  <p role="status" className={cn(s.muted, "m-0 border-t border-[#e5e7eb] px-4 py-2 text-xs")}>
                    {formatNumber(result.rows.length)} {result.rows.length === 1 ? "row" : "rows"} · {result.ms} ms
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
        <Card title="Saved queries">
          <ul className="m-0 grid list-none gap-1 p-0">
            {SAVED_QUERIES.map((saved) => (
              <li key={saved.name}>
                <button type="button" className={cn(s.quickLink, "w-full text-left")} onClick={() => setQuery(saved.sql)}>
                  {saved.name}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

export function SqlEditorPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SqlEditorContent />
    </Suspense>
  );
}
