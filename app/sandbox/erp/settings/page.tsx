"use client";
import * as React from "react";
import { Switch } from "radix-ui";
import { cn } from "@/lib/utils";
import { resetDb, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { LABELS, setUiVersion, useUiVersion } from "../_lib/ui-version";
import { ErpDialog } from "../_components/dialog";
import { Breadcrumb, Button, Card, PageHeader, PageSkeleton } from "../_components/ui";
import s from "../erp.module.css";

export default function SettingsPage() {
  usePageTitle("Settings");
  const db = useDb();
  const version = useUiVersion();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [resetMessage, setResetMessage] = React.useState("");

  if (!db) return <PageSkeleton />;

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/sandbox/erp" }, { label: "Settings" }]} />
      <PageHeader title="Settings" description="Preferences for this browser." />
      <div className="grid gap-4 lg:max-w-3xl">
        <Card title="Release">
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="ui-version-switch" className={cn(s.label, "mb-0.5 text-[13px] text-[#1d2d3e]")}>
                Simulate vendor update (Release 24.2 preview)
              </label>
              <p id="ui-version-help" className={cn(s.help, "m-0")}>
                Previews the next Atlas ERP release: renamed fields, the justification moved into the review step, a renamed order button and a new item table
                layout. Currently showing {version === "v2" ? LABELS.v2.release : LABELS.v1.release}.
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
            This workspace holds {db.requisitions.length} purchase requisitions, {db.suppliers.length} suppliers and {db.costCenters.length} cost centers. Resetting
            restores the original sample records and removes anything you created.
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

        <Card title="About Atlas ERP">
          <dl className={s.dl}>
            <dt>Product</dt>
            <dd>Atlas ERP</dd>
            <dt>Release</dt>
            <dd>{version === "v2" ? "24.2 preview" : "24.1"} (sandbox edition)</dd>
            <dt>Storage</dt>
            <dd>Records are kept in this browser&apos;s local storage. Nothing is sent to a server.</dd>
            <dt>Purpose</dt>
            <dd>Replica of an enterprise-ERP pattern built for demonstration. Not affiliated with any vendor.</dd>
          </dl>
        </Card>
      </div>

      <ErpDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset demo data"
        description="This replaces every record with the original sample data. Requisitions you created and changes to suppliers will be lost."
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
