import type { PlannerKind, SynformaSettings } from "../types";
import { RemotePlanner } from "./remote";
import { HeuristicPlanner } from "./heuristic";
import { PlannerStatusSchema, type PlannerStatus } from "./protocol";
import type { Planner } from "./types";

export type { Planner } from "./types";
export { HeuristicPlanner } from "./heuristic";
export { RemotePlanner } from "./remote";

let cachedStatus: PlannerStatus | null = null;

/** Ask the server whether a live LLM planner is configured. Never exposes the key. */
export async function fetchPlannerStatus(): Promise<PlannerStatus> {
  if (cachedStatus) return cachedStatus;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/planner/status`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    cachedStatus = PlannerStatusSchema.parse(await res.json());
  } catch {
    cachedStatus = { configured: false, provider: "none" };
  }
  return cachedStatus;
}

/** The language-model kind the server reports, or null when none is configured. */
export function configuredLlmKind(status: PlannerStatus | null | undefined): Exclude<PlannerKind, "heuristic"> | null {
  if (!status?.configured) return null;
  return status.provider === "claude" || status.provider === "gemini" ? status.provider : null;
}

export function resolvePlannerKind(pref: SynformaSettings["plannerPreference"], status: PlannerStatus): PlannerKind {
  if (pref === "heuristic") return "heuristic";
  return configuredLlmKind(status) ?? "heuristic";
}

export function createPlanner(kind: PlannerKind): Planner {
  return kind === "heuristic" ? new HeuristicPlanner() : new RemotePlanner(kind);
}

/** Vendor name for prose ("Claude", "Gemini", "Heuristic"). */
export function plannerVendor(kind: PlannerKind | null | undefined): "Claude" | "Gemini" | "Heuristic" {
  return kind === "claude" ? "Claude" : kind === "gemini" ? "Gemini" : "Heuristic";
}

/** Honest planner label ("Claude planner · claude-opus-5", "Heuristic planner"). The model is shown only when the status matches the kind. */
export function plannerLabel(kind: PlannerKind | null | undefined, status?: PlannerStatus | null): string {
  if (!kind || kind === "heuristic") return "Heuristic planner";
  const model = status?.provider === kind && status.model ? ` · ${status.model}` : "";
  return `${plannerVendor(kind)} planner${model}`;
}
