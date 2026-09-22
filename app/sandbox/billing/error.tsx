"use client";
import { SandboxError } from "../_shared/sandbox-error";

export default function BillingError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SandboxError name="Ledgerline Billing" storageKeys={["ledgerline-billing-db", "ledgerline-ui-version"]} {...props} />;
}
