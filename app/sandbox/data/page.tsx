import { ProjectOverview } from "./_components/project-overview";

const DEFAULT_PROJECT_ID = "PRJ-2001";

export default function DataHomePage() {
  return <ProjectOverview projectId={DEFAULT_PROJECT_ID} />;
}
