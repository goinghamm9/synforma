import type { Metadata } from "next";
import { BillingChrome } from "./_components/chrome";

export const metadata: Metadata = {
  title: { absolute: "Ledgerline Billing" },
  description: "Ledgerline Billing sandbox application",
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <BillingChrome>{children}</BillingChrome>;
}
