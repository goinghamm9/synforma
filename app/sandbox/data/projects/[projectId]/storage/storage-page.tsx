"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBucket, formatBytes, formatDate, formatNumber, getProject, useDb } from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { useUi } from "../../../_lib/ui-version";
import { DataDialog } from "../../../_components/dialog";
import { ProjectNotFound } from "../../../_components/not-found";
import { Badge, Button, Card, PageHeader, PageSkeleton, Field, Table, inputMonoClass } from "../../../_components/ui";
import s from "../../../data.module.css";

export function StoragePage() {
  const params = useParams<{ projectId: string }>();
  const db = useDb();
  const { prefix } = useUi();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [isPublic, setIsPublic] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  usePageTitle("Storage");

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  const totalBytes = db.buckets.reduce((sum, b) => sum + b.sizeBytes, 0);

  function close() {
    setOpen(false);
    setName("");
    setIsPublic(false);
    setError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return setError("Enter a bucket name");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) return setError("Use lowercase letters, digits and hyphens");
    if (db?.buckets.some((b) => b.name === value)) return setError(`A bucket named ${value} already exists`);
    createBucket(value, isPublic);
    setStatus(`Bucket ${value} created.`);
    close();
  }

  return (
    <>
      <PageHeader
        title="Storage"
        description={`${db.buckets.length} buckets · ${formatBytes(totalBytes)} used`}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} aria-hidden="true" />
            New bucket
          </Button>
        }
      />
      {status ? (
        <p role="status" className={cn(s.bannerSuccess, "mb-4")}>
          {status}
        </p>
      ) : null}
      <Card title="Buckets" bodyClassName={s.cardBodyFlush}>
        <Table caption="Storage buckets">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Access</th>
              <th scope="col" className={s.tdRight}>
                Objects
              </th>
              <th scope="col" className={s.tdRight}>
                Size
              </th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {db.buckets.map((bucket) => (
              <tr key={bucket.id}>
                <td>
                  <span className={cn(s.mono, "font-semibold")}>{bucket.name}</span>
                  <span className={cn(s.muted, "block text-xs")}>{bucket.id}</span>
                </td>
                <td>{bucket.isPublic ? <Badge tone="amber">Public</Badge> : <Badge tone="gray">Private</Badge>}</td>
                <td className={cn(s.tdRight, s.num)}>{formatNumber(bucket.objects)}</td>
                <td className={cn(s.tdRight, s.num)}>{formatBytes(bucket.sizeBytes)}</td>
                <td className={s.num}>{formatDate(bucket.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <DataDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())} title="New bucket" description="Buckets hold files served through the storage API.">
        <form onSubmit={submit} noValidate className="mt-4 grid gap-4">
          <Field id={`${prefix}-bucket-name`} label="Bucket name" required error={error} help="Lowercase letters, digits and hyphens.">
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="text"
                className={inputMonoClass}
                value={name}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError("");
                }}
              />
            )}
          </Field>
          <label htmlFor={`${prefix}-bucket-public`} className={s.check}>
            <input id={`${prefix}-bucket-public`} type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            Public bucket
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create bucket
            </Button>
          </div>
        </form>
      </DataDialog>
    </>
  );
}
