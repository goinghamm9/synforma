"use client";
import { cn } from "@/lib/utils";
import { LEAD_STATUSES, STAGES, formatCurrency, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, PageHeader, PageSkeleton, StatCard } from "../_components/ui";
import s from "../crm.module.css";

function Breakdown({ rows, caption }: { rows: { label: string; count: number; detail?: string }[]; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <table className={s.table}>
      <caption className={s.srOnly}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col" className={s.tdRight}>
            Count
          </th>
          <th scope="col" className="w-1/2">
            <span className={s.srOnly}>Share</span>
          </th>
          {rows.some((r) => r.detail) ? (
            <th scope="col" className={s.tdRight}>
              Amount
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td>{row.label}</td>
            <td className={s.tdRight}>{row.count}</td>
            <td>
              <div className={s.bar} aria-hidden="true">
                <div className={s.barFill} style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </td>
            {rows.some((r) => r.detail) ? <td className={s.tdRight}>{row.detail ?? ""}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ReportsPage() {
  usePageTitle("Reports");
  const db = useDb();
  if (!db) return <PageSkeleton />;

  const pipeline = db.opportunities.reduce((sum, o) => sum + o.amount, 0);
  const average = db.opportunities.length ? pipeline / db.opportunities.length : 0;
  const qualified = db.opportunities.filter((o) => o.decisionMakerContactId && o.fundingStage !== "Unknown").length;
  const nextClose = db.opportunities.map((o) => o.closeDate).sort()[0];

  const byStage = STAGES.map((stage) => {
    const items = db.opportunities.filter((o) => o.stage === stage);
    return { label: stage, count: items.length, detail: formatCurrency(items.reduce((sum, o) => sum + o.amount, 0)) };
  });
  const byStatus = LEAD_STATUSES.map((status) => ({ label: status, count: db.leads.filter((l) => l.status === status).length }));
  const sources = Array.from(new Set(db.leads.map((l) => l.source)));
  const bySource = sources.map((source) => ({ label: source, count: db.leads.filter((l) => l.source === source).length }));
  const regions = Array.from(new Set(db.accounts.map((a) => a.region)));
  const byRegion = regions.map((region) => ({ label: region, count: db.accounts.filter((a) => a.region === region).length }));

  return (
    <>
      <PageHeader title="Reports" description="Summary figures computed from the records in this workspace." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total pipeline" value={formatCurrency(pipeline)} hint={`${db.opportunities.length} open opportunities`} />
        <StatCard label="Average deal size" value={formatCurrency(average)} />
        <StatCard
          label="Qualified opportunities"
          value={`${qualified} of ${db.opportunities.length}`}
          hint="Decision-maker set and funding stage known"
        />
        <StatCard label="Next expected close" value={nextClose ?? "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pipeline by stage" bodyClassName="p-0">
          <Breakdown rows={byStage} caption="Pipeline by stage" />
        </Card>
        <Card title="Leads by status" bodyClassName="p-0">
          <Breakdown rows={byStatus} caption="Leads by status" />
        </Card>
        <Card title="Leads by source" bodyClassName="p-0">
          <Breakdown rows={bySource} caption="Leads by source" />
        </Card>
        <Card title="Accounts by region" bodyClassName="p-0">
          <Breakdown rows={byRegion} caption="Accounts by region" />
        </Card>
      </div>
      <p className={cn(s.muted, "mt-4 text-xs")}>Figures update as records change. Reports are not exportable in the sandbox.</p>
    </>
  );
}
