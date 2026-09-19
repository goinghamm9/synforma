"use client";
import * as React from "react";
import { Switch } from "radix-ui";
import { cn } from "@/lib/utils";
import { resetDb, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { VERSION_LABEL, setUiVersion, useUiVersion } from "../_lib/ui-version";
import { BillingDialog } from "../_components/dialog";
import { Button, Card, PageHeader, PageSkeleton } from "../_components/ui";
import s from "../billing.module.css";

export default function SettingsPage() {
  usePageTitle("Settings");
  const db = useDb();
  const version = useUiVersion();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [resetMessage, setResetMessage] = React.useState("");

  if (!db) return <PageSkeleton />;

  return (
    <>
      <PageHeader title="Settings" description="Workspace preferences for this browser." />
      <div className="grid gap-4 lg:max-w-3xl">
        <Card title="Interface">
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="ui-version-switch" className={cn(s.label, "mb-0.5")}>
                Simulate vendor UI update (v2)
              </label>
              <p id="ui-version-help" className={cn(s.help, "m-0")}>
                Previews the next Ledgerline release ({VERSION_LABEL.v2}): a renamed payment menu, a restructured refund flow and a regrouped sidebar.
                Currently showing {version === "v2" ? `the ${VERSION_LABEL.v2}` : `the current release (${VERSION_LABEL.v1})`}.
              </p>
            </div>
            <Switch.Root
              id="ui-version-switch"
              className={s.switch}
              checked={version === "v2"}
              onCheckedChange={(checked) => setUiVersion(checked ? "v2" : "v1")}
              aria-describedby="ui-version-help"
            >
              <Switch.Thumb className={s.switchThumb} />
            </Switch.Root>
          </div>
        </Card>

        <Card title="Demo data">
          <p className={cn(s.muted, "mt-0 mb-3")}>
            This workspace holds {db.customers.length} customers, {db.payments.length} payments, {db.invoices.length} invoices and {db.refunds.length} refunds.
            Resetting restores the original sample records and removes anything you created.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Reset demo data
            </Button>
            {resetMessage ? (
              <span role="status" className={cn(s.muted, "text-[13px]")}>
                {resetMessage}
              </span>
            ) : null}
          </div>
        </Card>

        <Card title={`About Ledgerline Billing ${VERSION_LABEL.v1}`}>
          <dl className={s.dl}>
            <dt>Product</dt>
            <dd>Ledgerline Billing</dd>
            <dt>Version</dt>
            <dd>3.8 (sandbox edition)</dd>
            <dt>Storage</dt>
            <dd>Records are kept in this browser&apos;s local storage. Nothing is sent to a server.</dd>
            <dt>Purpose</dt>
            <dd>Replica of a billing-dashboard pattern built for demonstration. Not affiliated with any vendor.</dd>
          </dl>
        </Card>
      </div>

      <BillingDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset demo data"
        description="This replaces every record with the original sample data. Refunds you issued and changes to customers and invoices will be lost."
        footer={
          <>
            <Button type="button" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                resetDb();
                setConfirmOpen(false);
                setResetMessage("Demo data has been reset.");
              }}
            >
              Reset data
            </Button>
          </>
        }
      />
    </>
  );
}
