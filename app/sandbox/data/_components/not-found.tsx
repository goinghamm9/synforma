"use client";
import { Card, EmptyState, LinkButton, PageHeader } from "./ui";

export function ProjectNotFound({ projectId }: { projectId: string }) {
  return (
    <>
      <PageHeader title="Project not found" description={`No project with ID ${projectId} exists in this organization.`} />
      <Card>
        <EmptyState
          title="This project may have been paused or deleted"
          description="Return to the home page to pick a project."
          action={<LinkButton href="/sandbox/data">Back to home</LinkButton>}
        />
      </Card>
    </>
  );
}

export function TableNotFound({ id, listHref, listLabel }: { id: string; listHref: string; listLabel: string }) {
  return (
    <>
      <PageHeader title="Table not found" description={`No table with ID ${id} exists in this project.`} />
      <Card>
        <EmptyState
          title="This table may have been deleted"
          description="Return to the table list to find the table you were looking for."
          action={<LinkButton href={listHref}>Back to {listLabel}</LinkButton>}
        />
      </Card>
    </>
  );
}
