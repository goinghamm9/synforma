import type { AssistancePreference, ElementRect, ExecutionMode, Provenance, RunOutcome, TrustState } from "@/lib/synforma/types";

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

export type LogLevel = "info" | "warn" | "action" | "heal" | "approval" | "done" | "change";

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

/**
 * UI-only preferences persisted per program (the store holds the domain data).
 * `context` is legacy: the work context now lives on `Program.context`; it is
 * still read as a fallback for programs created before the migration.
 */
export interface DemoPrefs {
  context?: Record<string, string>;
  phase?: PhaseId;
}

/**
 * A UI change detected during a run: an action's original control no longer
 * existed and was re-grounded by meaning. Carried by `action_regrounded`
 * events as `data.change`; the seed of configuration-drift detection.
 */
export interface ChangeRecord {
  id: number;
  t: number;
  stepId?: string;
  /** Route or screen the change was detected on (null when the runner did not know). */
  screen: string | null;
  from: string;
  to: string;
  risk: string;
}

export const MODE_LABEL: Record<ExecutionMode, string> = { guide: "Guide", assist: "Assist", act: "Act" };

export const OUTCOME_LABEL: Record<RunOutcome, string> = { completed: "Completed", abandoned: "Abandoned", failed: "Failed" };

export const PREFERENCE_LABEL: Record<AssistancePreference, string> = {
  just_do_it: "Just do it",
  work_with_me: "Work with me",
  teach_me: "Teach me",
  stay_out: "Stay out of the way",
};

/** Short, honest wording for each trust state ("How Synforma knows this"). */
export const TRUST_LABEL: Record<TrustState, string> = {
  AUTHORITATIVE_LIVE: "Observed on the live interface",
  AUTHORITATIVE_METADATA: "From configuration metadata",
  ORGANIZATION_APPROVED: "Organization-approved",
  VENDOR_DOCUMENTED: "Vendor-documented",
  OBSERVED_HIGH_CONFIDENCE: "Observed on the live interface",
  OBSERVED_LOW_CONFIDENCE: "Observed · low confidence",
  MODEL_INFERRED: "Model-inferred",
  UNKNOWN: "Provenance unknown",
};

export const SOURCE_LABEL: Record<Provenance["source"], string> = {
  observed_interface: "read from the live interface by the interaction layer",
  objective: "stated in the objective the organization approved",
  planner_inference: "inferred by the planner from the discovered structure",
  configuration: "read from configuration metadata",
  documentation: "taken from vendor documentation",
  human_confirmation: "confirmed by a person",
};
