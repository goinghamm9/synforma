import { projectParams } from "../../../_lib/static-params";
import { SqlEditorPage } from "./sql-editor";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <SqlEditorPage />;
}
