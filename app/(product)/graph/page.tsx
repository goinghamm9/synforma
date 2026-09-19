import type { Metadata } from "next";
import { GraphWorkbench } from "@/components/graph/graph-workbench";

export const metadata: Metadata = {
  title: "Work Graph",
  description: "The Work Graph as a process map: the intended path, the discovered screens, observed runs and evidence, with a 3D view on the side.",
};

export default function GraphPage() {
  return <GraphWorkbench />;
}
