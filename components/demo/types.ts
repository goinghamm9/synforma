import type { ElementRect, ExecutionMode, RunOutcome } from "@/lib/synforma/types";

/** The eight phases of Mission Control, in order. */
export type PhaseId = "connect" | "objective" | "discover" | "understand" | "act" | "guide" | "adapt" | "measure";

export const PHASES: { id: PhaseId; label: string; short: string }[] = [
  { id: "connect", label: "Connect", short: "Connect" },
  { id: "objective", label: "Objective", short: "Objective" },
  { id: "discover", label: "Discover", short: "Discover" },
  { id: "understand", label: "Understand", short: "Understand" },
  { id: "act", label: "Act", short: "Act" },
  { id: "guide", label: "Guide & Observe", short: "Guide" },
  { id: "adapt", label: "Adapt", short: "Adapt" },
  { id: "measure", label: "Measure", short: "Measure" },
];

export const PHASE_INDEX: Record<PhaseId, number> = Object.fromEntries(PHASES.map((p, i) => [p.id, i])) as Record<PhaseId, number>;

/** What the Universal Interaction Layer saw on the home page when connecting. */
export interface ConnectionInfo {
  url: string;
  title: string;
  heading: string;
  headings: string[];
  landmarks: string[];
  actions: number;
  fields: number;
  elements: number;
  tables: number;
  sampleActions: string[];
}

export type LogLevel = "info" | "warn" | "action" | "heal" | "approval" | "done";

export interface LogLine {
  id: number;
  t: number;
  level: LogLevel;
  message: string;
}

export interface OverlayTarget {
  rect: ElementRect;
  label?: string;
  /** False once the driver cleared the target: the overlay fades out in place. */
  visible: boolean;
}

export type UiVariant = "v1" | "v2";

/** UI-only preferences persisted per program (the store holds the domain data). */
export interface DemoPrefs {
  context?: Record<string, string>;
  phase?: PhaseId;
}

export const MODE_LABEL: Record<ExecutionMode, string> = { guide: "Guide", assist: "Assist", act: "Act" };

export const OUTCOME_LABEL: Record<RunOutcome, string> = { completed: "Completed", abandoned: "Abandoned", failed: "Failed" };
