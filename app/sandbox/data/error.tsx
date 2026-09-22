"use client";
import { SandboxError } from "../_shared/sandbox-error";

export default function DataError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SandboxError name="Nimbus Data Console" storageKeys={["nimbus-data-db", "nimbus-ui-version"]} {...props} />;
}
