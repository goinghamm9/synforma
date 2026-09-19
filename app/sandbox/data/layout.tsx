import type { Metadata } from "next";
import { DataChrome } from "./_components/chrome";

export const metadata: Metadata = {
  title: { absolute: "Nimbus Data Console" },
  description: "Nimbus Data Console sandbox application",
};

export default function DataLayout({ children }: { children: React.ReactNode }) {
  return <DataChrome>{children}</DataChrome>;
}
