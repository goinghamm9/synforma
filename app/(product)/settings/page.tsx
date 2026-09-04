import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "How Synforma helps, interaction sensing and what is collected, your independence per step, planner preference, observation thresholds, experiment split, and the data stored in this browser.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
