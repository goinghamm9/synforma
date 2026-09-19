import { projectParams } from "../../../_lib/static-params";
import { TablesListPage } from "./tables-list";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <TablesListPage />;
}
