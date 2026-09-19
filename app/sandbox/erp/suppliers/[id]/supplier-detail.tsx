"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, getSupplier, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { EditPaymentTermsDialog } from "../../_components/supplier-actions";
import { ActionBar, Banner, Breadcrumb, Button, Card, DefinitionList, EmptyState, LinkButton, ObjectHeader, PageHeader, PageSkeleton, StatusBadge, Table } from "../../_components/ui";
import s from "../../erp.module.css";

export function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const { labels } = useUi();
  const [editOpen, setEditOpen] = React.useState(false);
  const [message, setMessage] = React.useState<{ title: string; text: string } | null>(null);

  const supplier = db ? getSupplier(db, params.id) : undefined;
  usePageTitle(supplier ? supplier.name : "Supplier");

  if (!db) return <PageSkeleton />;

  if (!supplier) {
    return (
      <>
        <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "Manage Suppliers", href: "/sandbox/erp/suppliers" }, { label: params.id }]} />
        <PageHeader title="Supplier not found" description={`No supplier with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This supplier may have been removed"
            description="Return to the supplier list to find the record you were looking for."
            action={<LinkButton href="/sandbox/erp/suppliers">Back to list</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const changes = [...supplier.changes].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const lastChange = changes[0];

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "Manage Suppliers", href: "/sandbox/erp/suppliers" }, { label: supplier.id }]} />

      {message ? (
        <Banner title={message.title} onDismiss={() => setMessage(null)} className="mb-4">
          {message.text}
        </Banner>
      ) : null}

      <ObjectHeader
        title={supplier.name}
        subtitle={`Supplier ${supplier.id} · ${supplier.category}`}
        meta={<StatusBadge status={supplier.status} />}
        facts={[
          { label: "Payment terms", value: supplier.paymentTerms },
          { label: "Location", value: `${supplier.city}, ${supplier.country}` },
          { label: "Supplier since", value: formatDate(supplier.since) },
        ]}
      />

      <Card bodyClassName="p-0">
        <Tabs.Root defaultValue="general">
          <Tabs.List className={s.tabList} aria-label="Supplier sections">
            <Tabs.Trigger value="general" className={s.tab}>
              General
            </Tabs.Trigger>
            <Tabs.Trigger value="payment" className={s.tab}>
              Payment terms
            </Tabs.Trigger>
            <Tabs.Trigger value="changes" className={s.tab}>
              Change log
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="general" className={s.tabPanel}>
            <h2 className={cn(s.h2, "mb-2")}>Details</h2>
            <DefinitionList
              rows={[
                { label: "Supplier", value: supplier.id },
                { label: "Name", value: supplier.name },
                { label: "Category", value: supplier.category },
                { label: "City", value: supplier.city },
                { label: "Country", value: supplier.country },
                { label: "Contact", value: supplier.contactName },
                { label: "Email", value: supplier.email },
                { label: "Status", value: supplier.status },
                { label: "Supplier since", value: formatDate(supplier.since) },
              ]}
            />
          </Tabs.Content>
          <Tabs.Content value="payment" className={s.tabPanel}>
            <h2 className={cn(s.h2, "mb-2")}>Payment terms</h2>
            <DefinitionList
              rows={[
                { label: "Payment terms", value: supplier.paymentTerms },
                { label: "Last changed", value: lastChange ? `${formatDateTime(lastChange.at)} · ${lastChange.actor}` : "" },
                { label: "Last change reason", value: lastChange ? lastChange.reason : "" },
              ]}
            />
          </Tabs.Content>
          <Tabs.Content value="changes" className={cn(s.tabPanel, "p-0")}>
            {changes.length === 0 ? (
              <EmptyState title="No changes recorded" description="Edits to the supplier master data are listed here with their reason." />
            ) : (
              <Table caption="Supplier change log">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Field</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Changed by</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.id}>
                      <td className={s.num}>{formatDateTime(change.at)}</td>
                      <td>{change.field}</td>
                      <td>{change.from}</td>
                      <td>{change.to}</td>
                      <td className="max-w-[420px] whitespace-normal">{change.reason}</td>
                      <td>{change.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </Card>

      <ActionBar className="mt-4 rounded border border-[#d9dee5]" start={<LinkButton href="/sandbox/erp/suppliers">Back to list</LinkButton>}>
        <Button type="button" variant="primary" onClick={() => setEditOpen(true)}>
          {labels.editPaymentTerms}
        </Button>
      </ActionBar>

      <EditPaymentTermsDialog
        key={`${supplier.id}-${supplier.paymentTerms}`}
        supplier={supplier}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(from, to) => setMessage({ title: "Payment terms updated", text: `${supplier.id} changed from ${from} to ${to}.` })}
      />
    </>
  );
}
