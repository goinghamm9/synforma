"use client";
import { SandboxError } from "../_shared/sandbox-error";

export default function CrmError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SandboxError name="Meridian CRM" storageKeys={["meridian-crm-db", "meridian-ui-version"]} {...props} />;
}
