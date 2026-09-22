import type { Metadata } from "next";
import { LumenChrome } from "./_components/chrome";

export const metadata: Metadata = {
  title: { absolute: "Lumen Workspace" },
  description: "Lumen Workspace sandbox application",
};

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <LumenChrome>{children}</LumenChrome>;
}
