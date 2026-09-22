"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatNumber, getProject, isApprovedTemplate, usageForProject, useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { BASE_PATH, projectPath, useUi } from "../../_lib/ui-version";
import { ProjectDialogs, ProjectMenu, type ProjectActionMode, type ProjectActionOutcome } from "../../_components/project-actions";
import { Badge, Banner, Breadcrumb, Card, DefinitionList, EmptyState, LinkButton, PageHeader, PageSkeleton, StatusBadge } from "../../_components/ui";
import s from "../../assistant.module.css";

function ProjectDetailContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const db = useDb();
  const { labels } = useUi();
  const createdFlag = search.get("created") === "1";
  const [showCreated, setShowCreated] = React.useState(createdFlag);
  const [message, setMessage] = React.useState<{ title: string; text: React.ReactNode } | null>(null);
  const [mode, setMode] = React.useState<ProjectActionMode>(null);

  React.useEffect(() => {
    if (createdFlag) router.replace(pathname);
  }, [createdFlag, pathname, router]);

  const project = db ? getProject(db, params.id) : undefined;
  usePageTitle(project ? project.name : "Project");

  if (!db) return <PageSkeleton />;

  const listHref = `${BASE_PATH}/projects`;
  if (!project) {
    return (
      <>
        <Breadcrumb items={[{ label: labels.projects, href: listHref }, { label: params.id }]} />
        <PageHeader title="Project not found" description={`No project with ID ${params.id} exists in this workspace.`} />
        <Card>
          <EmptyState
            title="This project may have been removed"
            description="Return to the list to find the project you were looking for."
            action={<LinkButton href={listHref}>Back to {labels.projects}</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const usage = usageForProject(db, project.id);

  function done(outcome: ProjectActionOutcome) {
    if (outcome.kind === "archived") setMessage({ title: "Project archived", text: `${outcome.project.name} no longer answers. Its configuration is kept.` });
    else
      setMessage({
        title: "Project duplicated",
        text: (
          <>
            <Link href={projectPath(outcome.copy.id)} className={s.link}>
              {outcome.copy.name} ({outcome.copy.id})
            </Link>{" "}
            was created from this project.
          </>
        ),
      });
  }

  return (
    <>
      <Breadcrumb items={[{ label: labels.projects, href: listHref }, { label: project.id }]} />
      {showCreated ? (
        <Banner title="Project created" onDismiss={() => setShowCreated(false)} className="mb-4">
          {project.id} is ready for its reviewer and available to the organization.
        </Banner>
      ) : null}
      {message ? (
        <Banner title={message.title} onDismiss={() => setMessage(null)} className="mb-4">
          {message.text}
        </Banner>
      ) : null}
      <PageHeader
        title={project.name}
        meta={
          <>
            <StatusBadge status={project.status} />
            {!isApprovedTemplate(project.template) ? <Badge tone="amber">Custom instructions</Badge> : null}
            {project.restrictToKnowledge ? <Badge tone="indigo">Answers restricted to connected knowledge</Badge> : null}
          </>
        }
        description={`${project.id} · ${project.model}`}
        actions={<ProjectMenu project={project} variant="header" onArchive={() => setMode("archive")} onDuplicate={() => setMode("duplicate")} />}
      />

      <div className="grid grid-cols-1 gap-4">
        <Card title="Details">
          <DefinitionList
            rows={[
              { label: "Project ID", value: project.id },
              { label: "Project name", value: project.name },
              { label: "Purpose", value: project.purpose },
              { label: "Model", value: project.model },
              { label: "Instruction template", value: project.template },
              { label: "Instructions", value: <span className={s.prose}>{project.instructions}</span> },
              { label: "Knowledge sources", value: project.sources.join(", ") },
              { label: "Data retention", value: project.retention },
              { label: "Reviewer", value: project.reviewer },
              { label: "Visibility", value: project.visibility },
              { label: "Created", value: `${formatDate(project.createdAt)} · ${project.createdBy}` },
            ]}
          />
        </Card>

        <Card title="Usage (30 days)">
          {usage ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className={s.statLabel}>Conversations</div>
                  <div className={s.stat}>{formatNumber(usage.conversations)}</div>
                </div>
                <div>
                  <div className={s.statLabel}>Messages</div>
                  <div className={s.stat}>{formatNumber(usage.messages)}</div>
                </div>
                <div>
                  <div className={s.statLabel}>Active members</div>
                  <div className={s.stat}>{usage.activeUsers}</div>
                </div>
              </div>
              <p className={cn(s.muted, "mt-3 mb-0 text-xs")}>Last active {formatDateTime(usage.lastActiveAt)} · seeded demo figures, not measurements.</p>
            </>
          ) : (
            <EmptyState title="No usage yet" description="Conversations with this project appear here once members start using it." />
          )}
        </Card>
      </div>

      <ProjectDialogs db={db} project={project} mode={mode} onClose={() => setMode(null)} onDone={done} />
    </>
  );
}

export function ProjectDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectDetailContent />
    </Suspense>
  );
}
