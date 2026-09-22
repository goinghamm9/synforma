import { projectParams } from "../../_lib/static-params";
import { ProjectDetailPage } from "./project-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so a generous range of ids is
 * pre-generated (PRJ-1001 … PRJ-1040); the client component renders
 * "not found" for ids that do not exist yet in the browser's data.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <ProjectDetailPage />;
}
