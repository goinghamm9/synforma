import { projectParams } from "../../_lib/static-params";
import { ProjectPage } from "./project-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <ProjectPage />;
}
