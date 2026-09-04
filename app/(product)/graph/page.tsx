import type { Metadata } from "next";
import { GraphWorkbench } from "@/components/graph/graph-workbench";

export const metadata: Metadata = {
  title: "Work Graph",
  description: "The interactive 3D Work Graph: how work actually happens, as discovered by Synforma.",
};

export default function GraphPage() {
  return <GraphWorkbench />;
}
