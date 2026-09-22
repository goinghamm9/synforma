"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, useDb, type Project } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { BASE_PATH, projectPath, useUi } from "../_lib/ui-version";
import { ProjectDialogs, ProjectMenu, type ProjectActionMode, type ProjectActionOutcome } from "../_components/project-actions";
import { Banner, Card, EmptyState, Field, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table, inputClass } from "../_components/ui";
import s from "../assistant.module.css";

export function ProjectsListPage() {
  const db = useDb();
  const router = useRouter();
  const { labels, prefix } = useUi();
  const [query, setQuery] = React.useState("");
  const [target, setTarget] = React.useState<Project | null>(null);
  const [mode, setMode] = React.useState<ProjectActionMode>(null);
  const [message, setMessage] = React.useState<{ title: string; text: React.ReactNode } | null>(null);
  usePageTitle(labels.projects);

  if (!db) return <PageSkeleton />;

  const all = db.projects;
  const needle = query.trim().toLowerCase();
  const projects = all
    .filter((project) => (needle ? [project.id, project.name, project.purpose, project.template].some((v) => v.toLowerCase().includes(needle)) : true))
    .sort((a, b) => a.id.localeCompare(b.id));
  const activeCount = all.filter((p) => p.status !== "Archived").length;
  const newHref = `${BASE_PATH}/projects/new`;
  const noun = labels.projects.toLowerCase();

  function open(project: Project, next: ProjectActionMode) {
    setTarget(project);
    setMode(next);
  }

  function done(outcome: ProjectActionOutcome) {
    if (outcome.kind === "archived") setMessage({ title: "Project archived", text: `${outcome.project.name} (${outcome.project.id}) no longer answers.` });
    else
      setMessage({
        title: "Project duplicated",
        text: (
          <>
            <Link href={projectPath(outcome.copy.id)} className={s.link}>
              {outcome.copy.name} ({outcome.copy.id})
            </Link>{" "}
            was created from {outcome.project.name}.
          </>
        ),
      });
  }

  return (
    <>
      <PageHeader
        title={labels.projects}
        description={`${all.length} ${all.length === 1 ? noun.replace(/s$/, "") : noun} · ${activeCount} active`}
        actions={
          <LinkButton variant="primary" href={newHref}>
            <Plus size={14} aria-hidden="true" />
            {labels.newProject}
          </LinkButton>
        }
      />
      {message ? (
        <Banner title={message.title} onDismiss={() => setMessage(null)} className="mb-4">
          {message.text}
        </Banner>
      ) : null}
      <Card bodyClassName={s.cardBodyFlush}>
        <div className="border-b border-[#e5e7eb] p-3 sm:max-w-sm">
          <Field id={`${prefix}-project-search`} label={`Search ${noun}`}>
            {({ id }) => <input id={id} type="search" className={inputClass} placeholder="Search by name, purpose or template" value={query} onChange={(event) => setQuery(event.target.value)} />}
          </Field>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            title={all.length === 0 ? `No ${noun} yet` : `No ${noun} match`}
            description={all.length === 0 ? `Create the first ${noun.replace(/s$/, "")} in this workspace.` : "Try a different search term."}
            action={
              all.length === 0 ? (
                <LinkButton variant="primary" href={newHref}>
                  {labels.newProject}
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Table caption={labels.projects}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Model</th>
                <th scope="col">Instruction template</th>
                <th scope="col">Knowledge sources</th>
                <th scope="col">Data retention</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col">
                  <span className={s.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const href = projectPath(project.id);
                return (
                  <tr
                    key={project.id}
                    className={s.rowLink}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a, button, [role=menu]")) return;
                      router.push(href);
                    }}
                  >
                    <td>
                      <Link href={href} className={s.recordName}>
                        {project.name}
                      </Link>
                      <span className={cn(s.muted, "block text-xs")}>{project.id}</span>
                    </td>
                    <td>{project.model}</td>
                    <td>{project.template}</td>
                    <td>{project.sources.join(", ")}</td>
                    <td>{project.retention}</td>
                    <td>{project.reviewer.split(" — ")[0]}</td>
                    <td>
                      <StatusBadge status={project.status} />
                    </td>
                    <td className={s.num}>{formatDate(project.updatedAt)}</td>
                    <td className={s.tdRight}>
                      <ProjectMenu project={project} onArchive={() => open(project, "archive")} onDuplicate={() => open(project, "duplicate")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ProjectDialogs db={db} project={target} mode={mode} onClose={() => setMode(null)} onDone={done} />
    </>
  );
}
