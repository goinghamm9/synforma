import type { Metadata } from "next";
import { EmployeeWorkspace } from "@/components/employee/employee-workspace";

export const metadata: Metadata = {
  title: "Employee view",
  description: "Work in the target application as an employee would; Synforma guides, observes struggle and helps when you get stuck.",
};

export default function EmployeePage() {
  return <EmployeeWorkspace />;
}
