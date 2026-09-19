"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, getProject, keysForProject, rotateApiKey, useDb, type ApiKey } from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { useUi } from "../../../_lib/ui-version";
import { DataDialog } from "../../../_components/dialog";
import { ProjectNotFound } from "../../../_components/not-found";
import { Badge, Button, Card, Code, EmptyState, Field, PageHeader, PageSkeleton, Table, textareaClass } from "../../../_components/ui";
import s from "../../../data.module.css";

export function ApiKeysPage() {
  const params = useParams<{ projectId: string }>();
  const db = useDb();
  const { labels, prefix } = useUi();
  const [target, setTarget] = React.useState<ApiKey | null>(null);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  usePageTitle("API keys");

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  const keys = keysForProject(db, params.projectId);
  const rotations = keys
    .flatMap((key) => key.rotations.map((rotation) => ({ ...rotation, keyName: key.name })))
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  function close() {
    setTarget(null);
    setReason("");
    setError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    const text = reason.trim();
    if (!text) {
      setError("Enter a reason for the rotation");
      return;
    }
    rotateApiKey(target.id, text);
    setStatus(`Key ${target.name} rotated. Update every client that uses it.`);
    close();
  }

  return (
    <>
      <PageHeader title="API keys" description={`${keys.length} keys for ${project.name}. Secret keys bypass row level security; keep them on the server.`} />
      {status ? (
        <p role="status" className={cn(s.bannerSuccess, "mb-4")}>
          {status}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4">
        <Card title="Keys" bodyClassName={s.cardBodyFlush}>
          <Table caption="API keys">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Key</th>
                <th scope="col">Created</th>
                <th scope="col">Last rotated</th>
                <th scope="col">
                  <span className={s.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>
                    <span className={cn(s.mono, "font-semibold")}>{key.name}</span>
                    <span className={cn(s.muted, "block text-xs")}>{key.id}</span>
                  </td>
                  <td>{key.kind === "secret" ? <Badge tone="red">Secret</Badge> : <Badge tone="blue">Public</Badge>}</td>
                  <td>
                    <Code>{key.value}</Code>
                  </td>
                  <td className={s.num}>{formatDate(key.createdAt)}</td>
                  <td className={s.num}>{formatDate(key.lastRotatedAt)}</td>
                  <td className={s.tdRight}>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className={s.btnIcon} aria-label={`${labels.actionsMenu} for ${key.name}`} title={labels.actionsMenu}>
                          <MoreVertical size={16} aria-hidden="true" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
                          <DropdownMenu.Item
                            className={s.menuItem}
                            onSelect={() => {
                              window.setTimeout(() => {
                                setStatus("");
                                setTarget(key);
                              }, 0);
                            }}
                          >
                            {labels.rotateKey}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item className={s.menuItem} onSelect={() => setStatus(`Key ${key.name} copied (simulated).`)}>
                            Copy key
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Rotation history" bodyClassName={s.cardBodyFlush}>
          {rotations.length === 0 ? (
            <EmptyState title="No rotations yet" description="Rotated keys are listed here with the reason given." />
          ) : (
            <Table caption="Key rotations">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Key</th>
                  <th scope="col">By</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rotations.map((rotation) => (
                  <tr key={`${rotation.keyName}-${rotation.at}`}>
                    <td className={s.num}>{formatDateTime(rotation.at)}</td>
                    <td className={s.mono}>{rotation.keyName}</td>
                    <td>{rotation.by}</td>
                    <td className={s.tdWrap}>{rotation.reason}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <DataDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={labels.rotateKey}
        description={
          target
            ? `Rotating ${target.name} invalidates the current value immediately. Clients still using the old key will fail until they are updated.`
            : ""
        }
      >
        <form onSubmit={submit} noValidate className="mt-4 grid gap-4">
          <Field id={`${prefix}-rotate-reason`} label="Reason" required error={error} help="Recorded in the rotation history.">
            {({ id, describedBy, invalid }) => (
              <textarea
                id={id}
                name="reason"
                rows={3}
                className={textareaClass}
                value={reason}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (error) setError("");
                }}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              {labels.rotateKey}
            </Button>
          </div>
        </form>
      </DataDialog>
    </>
  );
}
