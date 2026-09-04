"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, getAccount, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, PageHeader, PageSkeleton, StageBadge, Table } from "../_components/ui";
import s from "../crm.module.css";

export default function OpportunitiesPage() {
  usePageTitle("Opportunities");
  const db = useDb();
  const router = useRouter();
  if (!db) return <PageSkeleton />;

  const opportunities = [...db.opportunities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const total = opportunities.reduce((sum, o) => sum + o.amount, 0);

  return (
    <>
      <PageHeader title="Opportunities" description={`${opportunities.length} open · ${formatCurrency(total)} total pipeline`} />
      <Card bodyClassName="p-0">
        {opportunities.length === 0 ? (
          <EmptyState title="No opportunities" description="Convert a lead to create the first opportunity." />
        ) : (
          <Table caption="Opportunities">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Name</th>
                <th scope="col">Account</th>
                <th scope="col">Stage</th>
                <th scope="col" className={s.tdRight}>
                  Amount
                </th>
                <th scope="col">Close date</th>
                <th scope="col">Owner</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opportunity) => {
                const href = `/sandbox/crm/opportunities/${opportunity.id}`;
                const account = getAccount(db, opportunity.accountId);
                return (
                  <tr
                    key={opportunity.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) return;
                      router.push(href);
                    }}
                  >
                    <td className={s.num}>
                      <Link href={href} className={s.link}>
                        {opportunity.id}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cn(s.link, "font-semibold")}>
                        {opportunity.name}
                      </Link>
                    </td>
                    <td>{account ? account.name : opportunity.accountId}</td>
                    <td>
                      <StageBadge stage={opportunity.stage} />
                    </td>
                    <td className={s.tdRight}>{formatCurrency(opportunity.amount)}</td>
                    <td className={s.num}>{formatDate(opportunity.closeDate)}</td>
                    <td>{opportunity.owner}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
