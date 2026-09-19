import { projectParams } from "../../../_lib/static-params";
import { AuthPage } from "./auth-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return projectParams();
}

export default function Page() {
  return <AuthPage />;
}
