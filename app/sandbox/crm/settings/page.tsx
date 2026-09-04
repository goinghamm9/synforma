"use client";
import * as React from "react";
import { Switch } from "radix-ui";
import { cn } from "@/lib/utils";
import { resetDb, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { setUiVersion, useUiVersion } from "../_lib/ui-version";
import { CrmDialog } from "../_components/dialog";
import { Button, Card, PageHeader, PageSkeleton } from "../_components/ui";
import s from "../crm.module.css";

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
                Previews the next Meridian release: renamed qualification fields, a reorganized lead menu and a new form layout.
                Currently showing {version === "v2" ? "the v2 preview" : "the current release (v1)"}.
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
            This workspace holds {db.leads.length} leads, {db.opportunities.length} opportunities, {db.accounts.length} accounts and{" "}
            {db.contacts.length} contacts. Resetting restores the original sample records and removes anything you created.
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

        <Card title="About Meridian CRM v4.2">
          <dl className={s.dl}>
            <dt>Product</dt>
            <dd>Meridian CRM</dd>
            <dt>Version</dt>
            <dd>4.2 (sandbox edition)</dd>
            <dt>Storage</dt>
            <dd>Records are kept in this browser&apos;s local storage. Nothing is sent to a server.</dd>
            <dt>Purpose</dt>
            <dd>A sample customer relationship management application used for demonstrations.</dd>
          </dl>
        </Card>
      </div>

      <CrmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset demo data"
        description="This replaces every record with the original sample data. Opportunities you created and changes to leads will be lost."
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
