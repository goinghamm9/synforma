import { projectParams } from "../../../_lib/static-params";
import { TeamPage } from "./team-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <TeamPage />;
}
