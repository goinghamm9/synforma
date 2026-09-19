"use client";
import * as React from "react";
import { Suspense } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { cn } from "@/lib/utils";
import { costCenterLabel, formatCurrency, formatDate, formatDateTime, getCostCenter, getRequisition, requisitionTotal, submitRequisition, useDb } from "../../_lib/db";
import { requisitionRows } from "../../_lib/requisition-view";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { DecisionDialogs, type DecisionMode } from "../../_components/requisition-actions";
import { ActionBar, Banner, Breadcrumb, Button, Card, DefinitionList, EmptyState, LinkButton, ObjectHeader, PageHeader, PageSkeleton, StatusBadge, Table } from "../../_components/ui";
import s from "../../erp.module.css";

function RequisitionDetailContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const db = useDb();
  const { labels } = useUi();
  const createdFlag = search.get("created") === "1";
  const [showCreated, setShowCreated] = React.useState(createdFlag);
  const [message, setMessage] = React.useState<{ title: string; text: string } | null>(null);
  const [mode, setMode] = React.useState<DecisionMode>(null);

  React.useEffect(() => {
    if (createdFlag) router.replace(pathname);
  }, [createdFlag, pathname, router]);

  const requisition = db ? getRequisition(db, params.id) : undefined;
  usePageTitle(requisition ? `${requisition.id} ${requisition.description}` : "Purchase requisition");

  if (!db) return <PageSkeleton />;

  if (!requisition) {
    return (
      <>
        <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "My Purchase Requisitions", href: "/sandbox/erp/requisitions" }, { label: params.id }]} />
        <PageHeader title="Requisition not found" description={`No purchase requisition with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This requisition may have been removed"
            description="Return to the list to find the record you were looking for."
            action={<LinkButton href="/sandbox/erp/requisitions">Back to list</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const costCenter = getCostCenter(db, requisition.costCenterId);
  const rows = requisitionRows(db, requisition, labels);
  const total = requisitionTotal(requisition);
  const history = [...requisition.history].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  function submit() {
    submitRequisition(requisition!.id);
    setMessage({ title: "Requisition submitted for approval", text: `${requisition!.id} is now waiting for procurement review.` });
  }

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "My Purchase Requisitions", href: "/sandbox/erp/requisitions" }, { label: requisition.id }]} />

      {showCreated ? (
        <Banner title="Requisition submitted for approval" onDismiss={() => setShowCreated(false)} className="mb-4">
          {requisition.id} is now waiting for procurement review.
        </Banner>
      ) : null}
      {message ? (
        <Banner title={message.title} onDismiss={() => setMessage(null)} className="mb-4">
          {message.text}
        </Banner>
      ) : null}

      <ObjectHeader
        title={`Purchase Requisition ${requisition.id}`}
        subtitle={requisition.description}
        meta={<StatusBadge status={requisition.status} />}
        facts={[
          { label: "Total value", value: formatCurrency(total) },
          { label: labels.costCenter, value: costCenterLabel(costCenter, requisition.costCenterId) },
          { label: labels.materialGroup, value: requisition.materialGroup || "—" },
          { label: "Requested by", value: requisition.requestedBy },
        ]}
      />

      <Card bodyClassName="p-0">
        <Tabs.Root defaultValue="general">
          <Tabs.List className={s.tabList} aria-label="Requisition sections">
            <Tabs.Trigger value="general" className={s.tab}>
              General
            </Tabs.Trigger>
            <Tabs.Trigger value="items" className={s.tab}>
              Items
            </Tabs.Trigger>
            <Tabs.Trigger value="justification" className={s.tab}>
              {labels.justificationStep}
            </Tabs.Trigger>
            <Tabs.Trigger value="history" className={s.tab}>
              Approval history
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="general" className={s.tabPanel}>
            <h2 className={cn(s.h2, "mb-2")}>Details</h2>
            <DefinitionList rows={rows.map((row) => ({ label: row.label, value: row.value }))} />
          </Tabs.Content>
          <Tabs.Content value="items" className={cn(s.tabPanel, "p-0")}>
            <Table caption="Requisition items">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">{labels.itemDescription}</th>
                  <th scope="col" className={s.tdRight}>
                    {labels.quantity}
                  </th>
                  <th scope="col" className={s.tdRight}>
                    {labels.unitPrice}
                  </th>
                  <th scope="col">{labels.deliveryDate}</th>
                  <th scope="col" className={s.tdRight}>
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody>
                {requisition.items.map((entry, index) => (
                  <tr key={entry.id}>
                    <td className={s.num}>{index + 1}</td>
                    <td>{entry.description}</td>
                    <td className={s.tdRight}>{entry.quantity}</td>
                    <td className={s.tdRight}>{formatCurrency(entry.unitPrice)}</td>
                    <td className={s.num}>{formatDate(entry.deliveryDate)}</td>
                    <td className={s.tdRight}>{formatCurrency(entry.quantity * entry.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="font-semibold">
                    Total value
                  </td>
                  <td className={cn(s.tdRight, "font-semibold")}>{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </Table>
          </Tabs.Content>
          <Tabs.Content value="justification" className={s.tabPanel}>
            <h2 className={cn(s.h2, "mb-2")}>{labels.justification}</h2>
            {requisition.justification ? <p className="m-0 max-w-[70ch] whitespace-pre-line">{requisition.justification}</p> : <p className={cn(s.faint, "m-0")}>No justification entered.</p>}
          </Tabs.Content>
          <Tabs.Content value="history" className={s.tabPanel}>
            <ol className={s.timeline}>
              {history.map((entry) => (
                <li key={entry.id} className={s.timelineItem}>
                  <div className={cn(s.muted, s.num, "text-xs")}>
                    {formatDateTime(entry.at)} · {entry.actor}
                  </div>
                  <div>
                    <strong>{entry.action}</strong>
                    {entry.comment ? <span className="block">{entry.comment}</span> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Tabs.Content>
        </Tabs.Root>
      </Card>

      <ActionBar className="mt-4 rounded border border-[#d9dee5]" start={<LinkButton href="/sandbox/erp/requisitions">Back to list</LinkButton>}>
        {requisition.status === "Submitted" ? (
          <>
            <Button type="button" onClick={() => setMode("return")}>
              {labels.returnWithComment}
            </Button>
            <Button type="button" variant="primary" onClick={() => setMode("approve")}>
              {labels.approve}
            </Button>
          </>
        ) : null}
        {requisition.status === "Draft" ? (
          <Button type="button" variant="primary" onClick={submit}>
            {labels.submit}
          </Button>
        ) : null}
        {requisition.status === "Returned" ? (
          <Button type="button" variant="primary" onClick={submit}>
            Resubmit
          </Button>
        ) : null}
        {requisition.status === "Approved" ? <span className={cn(s.muted, "text-[13px]")}>Approved · released for ordering</span> : null}
      </ActionBar>

      <DecisionDialogs
        requisition={requisition}
        mode={mode}
        onClose={() => setMode(null)}
        onDone={(outcome, done) =>
          setMessage(
            outcome === "approved"
              ? { title: "Requisition approved", text: `${done.id} is released for ordering.` }
              : { title: "Requisition returned", text: `${done.id} was returned to ${done.requestedBy} with your comment.` },
          )
        }
      />
    </>
  );
}

export function RequisitionDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequisitionDetailContent />
    </Suspense>
  );
}
