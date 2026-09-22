"use client";
import { useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { BASE_PATH, useUi } from "../../_lib/ui-version";
import { ProjectWizard } from "../../_components/project-wizard";
import { Breadcrumb, PageHeader, PageSkeleton } from "../../_components/ui";

export function NewProjectPage() {
  const db = useDb();
  const { labels } = useUi();
  usePageTitle(labels.newProject);

  if (!db) return <PageSkeleton />;

  return (
    <>
      <Breadcrumb items={[{ label: labels.projects, href: `${BASE_PATH}/projects` }, { label: labels.newProject }]} />
      <PageHeader title={labels.newProject} description="Four steps: basics, instructions, knowledge and review." />
      <ProjectWizard db={db} />
    </>
  );
}
