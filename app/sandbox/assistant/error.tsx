"use client";
import { SandboxError } from "../_shared/sandbox-error";

export default function AssistantError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SandboxError name="Lumen Workspace" storageKeys={["lumen-workspace-db", "lumen-ui-version"]} {...props} />;
}
