import { projectParams } from "../../../_lib/static-params";
import { ApiKeysPage } from "./api-keys-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <ApiKeysPage />;
}
