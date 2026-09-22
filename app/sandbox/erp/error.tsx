"use client";
import { SandboxError } from "../_shared/sandbox-error";

export default function ErpError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SandboxError name="Atlas ERP" storageKeys={["atlas-erp-db", "atlas-ui-version"]} {...props} />;
}
