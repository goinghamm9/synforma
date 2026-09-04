import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Planner preference, observation thresholds, experiment split, and the data stored in this browser.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
