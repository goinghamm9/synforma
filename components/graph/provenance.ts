import type { PlannerKind, Provenance, TrustState } from "@/lib/synforma/types";

/**
 * Human wording for provenance: how Synforma knows a Work Graph node.
 *
 * Source authority, highest first. Live observation of the actual instance
 * outranks configuration metadata, which outranks the objective text, which
 * outranks vendor documentation, which outranks model inference. See
 * docs/KNOWLEDGE_LAYERS.md and the TrustState comment in lib/synforma/types.ts.
 */
export const TRUST_ORDER: readonly TrustState[] = [
  "AUTHORITATIVE_LIVE",
  "AUTHORITATIVE_METADATA",
  "ORGANIZATION_APPROVED",
  "VENDOR_DOCUMENTED",
  "OBSERVED_HIGH_CONFIDENCE",
  "OBSERVED_LOW_CONFIDENCE",
  "MODEL_INFERRED",
  "UNKNOWN",
];

export const TRUST_LABEL: Record<TrustState, string> = {
  AUTHORITATIVE_LIVE: "Observed on the live instance",
  AUTHORITATIVE_METADATA: "Configuration metadata",
  ORGANIZATION_APPROVED: "Organization-approved",
  VENDOR_DOCUMENTED: "Vendor documentation",
  OBSERVED_HIGH_CONFIDENCE: "Observed (high confidence)",
  OBSERVED_LOW_CONFIDENCE: "Observed (low confidence)",
  MODEL_INFERRED: "Model-inferred",
  UNKNOWN: "Unknown",
};

export type TrustTone = "verdant" | "default" | "outline" | "muted" | "amber";

/** Badge tone per trust state: settled facts in verdant/ink, observations outlined, inferences in amber (the hypothesis colour). */
export const TRUST_TONE: Record<TrustState, TrustTone> = {
  AUTHORITATIVE_LIVE: "verdant",
  AUTHORITATIVE_METADATA: "verdant",
  ORGANIZATION_APPROVED: "default",
  VENDOR_DOCUMENTED: "outline",
  OBSERVED_HIGH_CONFIDENCE: "outline",
  OBSERVED_LOW_CONFIDENCE: "muted",
  MODEL_INFERRED: "amber",
  UNKNOWN: "muted",
};

/** What each trust state means, and what produces it in this build (docs/KNOWLEDGE_LAYERS.md). */
export const TRUST_MEANING: Record<TrustState, { meaning: string; inThisBuild: string }> = {
  AUTHORITATIVE_LIVE: {
    meaning: "Confirmed on the live instance, not merely seen once.",
    inThisBuild: "Nodes confirmed during discovery. Today that is the application itself; other observed nodes keep their observed state until a later pass confirms them.",
  },
  AUTHORITATIVE_METADATA: {
    meaning: "Configuration read from the application's own metadata (schemas, required flags, picklists) rather than from its screens.",
    inThisBuild: "Not produced yet. The discovered graph stands in for tenant configuration.",
  },
  ORGANIZATION_APPROVED: {
    meaning: "Stated by the organization: requirements, judgment flags, policy constraints and the success definition.",
    inThisBuild: "The objective text, read by the planner (parseObjective). Requirement, objective and policy nodes carry it.",
  },
  VENDOR_DOCUMENTED: {
    meaning: "Vendor documentation and release notes, as structured change events.",
    inThisBuild: "Not produced yet. Re-grounding events during runs are the seed of drift detection.",
  },
  OBSERVED_HIGH_CONFIDENCE: {
    meaning: "Seen on the live interface: screens, actions, fields, objects and dialogs, addressed by role, accessible name and region.",
    inThisBuild: "Discovery (explorer.ts over snapshot.ts). The default for every observed node.",
  },
  OBSERVED_LOW_CONFIDENCE: {
    meaning: "Seen, but ambiguously: weak grounding, or an element that changed between visits.",
    inThisBuild: "Reserved. No rule assigns it yet.",
  },
  MODEL_INFERRED: {
    meaning: "A planner hypothesis: the workflow, its steps and their modes, inferred from the objective and the discovered screens.",
    inThisBuild: "inferWorkflow, by the heuristic or the Gemini planner. Never presented as fact.",
  },
  UNKNOWN: {
    meaning: "No provenance recorded.",
    inThisBuild: "The illustrative sample graph, and graphs imported from before provenance existed.",
  },
};

export const SOURCE_LABEL: Record<Provenance["source"], string> = {
  observed_interface: "Observed on the live interface",
  objective: "Stated in the objective",
  planner_inference: "Inferred by the planner",
  configuration: "Read from configuration metadata",
  documentation: "Taken from vendor documentation",
  human_confirmation: "Confirmed by a person",
};

/** "Inferred by the planner (heuristic)" when the node or the program says which planner made it. */
export function describeSource(p: Provenance, fallbackPlanner?: PlannerKind): string {
  const base = SOURCE_LABEL[p.source] ?? String(p.source);
  if (p.source !== "planner_inference") return base;
  const by = p.by ?? fallbackPlanner;
  return by ? `${base} (${by})` : base;
}

/** Tolerates values outside the known set (imported data): the raw string is shown rather than nothing. */
export function trustLabel(t: string): string {
  return (TRUST_LABEL as Record<string, string | undefined>)[t] ?? t;
}

export function trustTone(t: string): TrustTone {
  return (TRUST_TONE as Record<string, TrustTone | undefined>)[t] ?? "muted";
}
