"use client";
import { useParams } from "next/navigation";
import { getProject, useDb } from "../../../../_lib/db";
import { usePageTitle } from "../../../../_lib/use-page-title";
import { projectPath, useUi } from "../../../../_lib/ui-version";
import { ProjectNotFound } from "../../../../_components/not-found";
import { TableWizard } from "../../../../_components/table-wizard";
import { Breadcrumb, PageHeader, PageSkeleton } from "../../../../_components/ui";

export function NewTablePage() {
  const params = useParams<{ projectId: string }>();
  const db = useDb();
  const { labels } = useUi();
  usePageTitle(labels.newTable);

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  return (
    <>
      <Breadcrumb items={[{ label: labels.tables, href: projectPath(params.projectId, "/tables") }, { label: labels.newTable }]} />
      <PageHeader title={labels.newTable} description={`${project.name} · schema public`} />
      <TableWizard key={params.projectId} db={db} projectId={params.projectId} />
    </>
  );
}
