import { projectParams } from "../../../../_lib/static-params";
import { NewTablePage } from "./new-table";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <NewTablePage />;
}
