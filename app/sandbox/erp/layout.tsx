import type { Metadata } from "next";
import { ErpChrome } from "./_components/chrome";

export const metadata: Metadata = {
  title: { absolute: "Atlas ERP" },
  description: "Atlas ERP sandbox application",
};

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return <ErpChrome>{children}</ErpChrome>;
}
