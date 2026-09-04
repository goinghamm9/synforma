import type { Metadata } from "next";
import { CrmChrome } from "./_components/chrome";

export const metadata: Metadata = {
  title: { absolute: "Meridian CRM" },
  description: "Meridian CRM sandbox application",
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <CrmChrome>{children}</CrmChrome>;
}
