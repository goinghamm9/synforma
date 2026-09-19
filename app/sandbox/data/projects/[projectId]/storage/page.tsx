import { projectParams } from "../../../_lib/static-params";
import { StoragePage } from "./storage-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <StoragePage />;
}
