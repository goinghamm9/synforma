"use client";
import { useParams } from "next/navigation";
import { ProjectOverview } from "../../_components/project-overview";

export function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  return <ProjectOverview projectId={params.projectId} />;
}
