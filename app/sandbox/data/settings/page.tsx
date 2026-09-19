"use client";
import * as React from "react";
import { Switch } from "radix-ui";
import { cn } from "@/lib/utils";
import { resetDb, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { PRODUCT_VERSION, setUiVersion, useUiVersion } from "../_lib/ui-version";
import { DataDialog } from "../_components/dialog";
import { Button, Card, PageHeader, PageSkeleton } from "../_components/ui";
import s from "../data.module.css";

export default function SettingsPage() {
  usePageTitle("Settings");
  const db = useDb();
  const version = useUiVersion();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [resetMessage, setResetMessage] = React.useState("");

  if (!db) return <PageSkeleton />;

  return (
    <>
      <PageHeader title="Settings" description="Console preferences for this browser." />
      <div className="grid grid-cols-1 gap-4 lg:max-w-3xl">
        <Card title="Interface">
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="ui-version-switch" className={cn(s.label, "mb-0.5")}>
                Simulate vendor UI update (v2)
              </label>
              <p id="ui-version-help" className={cn(s.help, "m-0")}>
                Previews the {PRODUCT_VERSION.v2} release: the table editor becomes &quot;Tables&quot;, row level security is called &quot;RLS
                protection&quot;, policies move to a tab on the review step and the sidebar is reordered. Currently showing{" "}
                {version === "v2" ? `the ${PRODUCT_VERSION.v2}` : `the current release (${PRODUCT_VERSION.v1})`}.
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
            This browser holds {db.tables.length} tables, {db.members.length} team members, {db.apiKeys.length} API keys and {db.authUsers.length}{" "}
            auth users. Resetting restores the original sample records and removes anything you created.
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

        <Card title={`About Nimbus Data Console ${PRODUCT_VERSION.v1}`}>
          <dl className={s.dl}>
            <dt>Product</dt>
            <dd>Nimbus Data Console</dd>
            <dt>Version</dt>
            <dd>{version === "v2" ? PRODUCT_VERSION.v2 : PRODUCT_VERSION.v1} (sandbox edition)</dd>
            <dt>Storage</dt>
            <dd>Records are kept in this browser&apos;s local storage. Nothing is sent to a server.</dd>
            <dt>Purpose</dt>
            <dd>Replica of a developer-console pattern built for demonstration. Not affiliated with any vendor.</dd>
          </dl>
        </Card>
      </div>

      <DataDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset demo data"
        description="This replaces every record with the original sample data. Tables you created, invitations and key rotations will be lost."
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
