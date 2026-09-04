import type { Metadata } from "next";
import { MissionControl } from "@/components/demo/mission-control";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Connect an application, state an objective, and watch Synforma discover, understand, act, guide, adapt and measure.",
};

export default function DemoPage() {
  return <MissionControl />;
}
