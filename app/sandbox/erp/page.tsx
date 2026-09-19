"use client";
import Link from "next/link";
import { Building2, ClipboardCheck, FilePlus2, FileText, Landmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_USER, formatDateTime, useDb } from "./_lib/db";
import { usePageTitle } from "./_lib/use-page-title";
import { useUi } from "./_lib/ui-version";
import { Card, PageHeader, PageSkeleton, Tile, TileGroup } from "./_components/ui";
import s from "./erp.module.css";

export default function ErpHomePage() {
  usePageTitle("Home");
  const db = useDb();
  const { labels } = useUi();
  if (!db) return <PageSkeleton />;

  const pending = db.requisitions.filter((r) => r.status === "Submitted").length;
  const drafts = db.requisitions.filter((r) => r.status === "Draft").length;
  const firstName = CURRENT_USER.name.split(" ")[0];
  const recent = db.requisitions
    .flatMap((r) => r.history.map((h) => ({ ...h, requisitionId: r.id, description: r.description })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 6);

  return (
    <>
      <PageHeader title="Home" description={`Good day, ${firstName}. Your launchpad for procurement, supplier management and finance.`} />

      <TileGroup id="procurement" title="Procurement">
        <Tile
          id="tile-my-requisitions"
          href="/sandbox/erp/requisitions"
          title="My Purchase Requisitions"
          subtitle="List report"
          number={db.requisitions.length}
          unit={`requisitions · ${drafts} draft${drafts === 1 ? "" : "s"}`}
          icon={FileText}
        />
        <Tile
          id="tile-create-requisition"
          href="/sandbox/erp/requisitions/new"
          title={labels.createRequisitionTile}
          subtitle="Office equipment, IT, services and more"
          icon={FilePlus2}
        />
        <Tile
          id="tile-approve-requisitions"
          href="/sandbox/erp/approvals"
          title="Approve Requisitions"
          subtitle="Procurement inbox"
          number={pending}
          unit="waiting for approval"
          icon={ClipboardCheck}
        />
      </TileGroup>

      <TileGroup id="supplier-management" title="Supplier Management">
        <Tile
          id="tile-manage-suppliers"
          href="/sandbox/erp/suppliers"
          title="Manage Suppliers"
          subtitle="Master data"
          number={db.suppliers.length}
          unit="suppliers"
          icon={Building2}
        />
      </TileGroup>

      <TileGroup id="finance" title="Finance">
        <Tile
          id="tile-cost-centers"
          href="/sandbox/erp/cost-centers"
          title={labels.costCentersTile}
          subtitle="Budgets and commitments"
          number={db.costCenters.length}
          unit={labels.costCentersTile.toLowerCase()}
          icon={Landmark}
        />
      </TileGroup>

      <TileGroup id="settings" title="Settings">
        <Tile id="tile-settings" href="/sandbox/erp/settings" title="Settings" subtitle="Release preview, demo data" icon={Settings} />
      </TileGroup>

      <Card title="Recent activity" bodyClassName="p-0">
        <ul className="m-0 list-none divide-y divide-[#d9dee5] p-0">
          {recent.map((entry) => (
            <li key={`${entry.requisitionId}-${entry.id}`} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
              <span className={cn(s.muted, s.num, "shrink-0 text-xs sm:w-32 sm:pt-0.5")}>{formatDateTime(entry.at)}</span>
              <span className="min-w-0 flex-1">
                <span className="block">
                  {entry.action} ·{" "}
                  <Link href={`/sandbox/erp/requisitions/${entry.requisitionId}`} className={s.link}>
                    {entry.requisitionId}
                  </Link>{" "}
                  {entry.description}
                </span>
                <span className={cn(s.muted, "text-xs")}>
                  {entry.actor}
                  {entry.comment ? ` · ${entry.comment}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
