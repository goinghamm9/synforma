import type { PlannerKind, SynformaSettings } from "../types";
import { GeminiPlanner } from "./gemini";
import { HeuristicPlanner } from "./heuristic";
import { PlannerStatusSchema, type PlannerStatus } from "./protocol";
import type { Planner } from "./types";

export type { Planner } from "./types";
export { HeuristicPlanner } from "./heuristic";
export { GeminiPlanner } from "./gemini";

let cachedStatus: PlannerStatus | null = null;

/** Ask the server whether a live LLM planner is configured. Never exposes the key. */
export async function fetchPlannerStatus(): Promise<PlannerStatus> {
  if (cachedStatus) return cachedStatus;
  try {
    const res = await fetch("/api/planner/status", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    cachedStatus = PlannerStatusSchema.parse(await res.json());
  } catch {
    cachedStatus = { configured: false, provider: "none" };
  }
  return cachedStatus;
}

export function resolvePlannerKind(pref: SynformaSettings["plannerPreference"], status: PlannerStatus): PlannerKind {
  if (pref === "heuristic") return "heuristic";
  if (pref === "gemini") return status.configured ? "gemini" : "heuristic";
  return status.configured ? "gemini" : "heuristic";
}

export function createPlanner(kind: PlannerKind): Planner {
  return kind === "gemini" ? new GeminiPlanner() : new HeuristicPlanner();
}
