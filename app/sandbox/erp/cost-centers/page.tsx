"use client";
import { cn } from "@/lib/utils";
import { committedForCostCenter, formatCurrency, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { useUi } from "../_lib/ui-version";
import { Breadcrumb, Card, PageHeader, PageSkeleton, Table } from "../_components/ui";
import s from "../erp.module.css";

export default function CostCentersPage() {
  const { labels } = useUi();
  usePageTitle(labels.costCentersTile);
  const db = useDb();

  if (!db) return <PageSkeleton />;

  const rows = db.costCenters.map((entry) => {
    const committed = committedForCostCenter(db, entry.id);
    const count = db.requisitions.filter((r) => r.costCenterId === entry.id).length;
    return { ...entry, committed, available: entry.budget - committed, count, share: entry.budget ? Math.min(100, Math.round((committed / entry.budget) * 100)) : 0 };
  });
  const totalBudget = rows.reduce((sum, r) => sum + r.budget, 0);
  const totalCommitted = rows.reduce((sum, r) => sum + r.committed, 0);

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: labels.costCentersTile }]} />
      <PageHeader
        title={labels.costCentersTile}
        description={`${rows.length} ${labels.costCentersTile.toLowerCase()} · ${formatCurrency(totalCommitted)} committed of ${formatCurrency(totalBudget)} budget`}
      />
      <Card bodyClassName="p-0">
        <Table caption={labels.costCentersTile}>
          <thead>
            <tr>
              <th scope="col">{labels.costCenter}</th>
              <th scope="col">Name</th>
              <th scope="col">Owner</th>
              <th scope="col" className={s.tdRight}>
                Budget
              </th>
              <th scope="col" className={s.tdRight}>
                Committed
              </th>
              <th scope="col" className={s.tdRight}>
                Available
              </th>
              <th scope="col">Utilisation</th>
              <th scope="col" className={s.tdRight}>
                Requisitions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td className={cn(s.num, "font-semibold")}>{entry.id}</td>
                <td>{entry.name}</td>
                <td>{entry.owner}</td>
                <td className={s.tdRight}>{formatCurrency(entry.budget)}</td>
                <td className={s.tdRight}>{formatCurrency(entry.committed)}</td>
                <td className={s.tdRight}>{formatCurrency(entry.available)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className={s.bar} aria-hidden="true">
                      <div className={s.barFill} style={{ width: `${entry.share}%` }} />
                    </div>
                    <span className={cn(s.num, s.muted, "text-xs")}>{entry.share}%</span>
                  </div>
                </td>
                <td className={s.tdRight}>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
