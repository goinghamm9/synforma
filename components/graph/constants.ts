import type { EdgeType, NodeStatus, NodeType } from "@/lib/synforma/types";

/** Monochrome instrument palette (mirrors docs/DESIGN.md tokens). */
export const COLORS = {
  paper: "#fafaf7",
  ink: "#0b0b0c",
  graphite: "#3a3a3c",
  slate: "#6b6b70",
  mist: "#9a9a9e",
  line: "#e4e2dd",
  lineStrong: "#cfccc5",
  signal: "#b4532a",
  /** Hypothesis nodes: amber at low saturation, outlined. */
  hypothesisFill: "#e4dac2",
  hypothesisRim: "#a68f58",
  edge: "#d2cfc8",
  edgeDim: "#e7e5df",
  edgeHalf: "#a9a7a1",
} as const;

/** Vertical layer per node type: 0 is the top of the instrument, 6 the base. */
export const LAYER_OF: Record<NodeType, number> = {
  outcome: 0,
  objective: 0,
  requirement: 1,
  policy: 1,
  workflow: 2,
  step: 2,
  intervention: 2,
  screen: 3,
  action: 4,
  field: 4,
  object: 5,
  capability: 5,
  application: 6,
  role: 6,
  person: 6,
};

export const LAYER_COUNT = 7;

export const LAYER_NAMES: readonly string[] = [
  "Outcomes · Objectives",
  "Requirements · Policies",
  "Workflows · Steps · Interventions",
  "Screens",
  "Actions · Fields",
  "Objects · Capabilities",
  "Applications · Roles · People",
];

/** Display order: top layer first. */
export const TYPE_ORDER: readonly NodeType[] = [
  "outcome",
  "objective",
  "requirement",
  "policy",
  "workflow",
  "step",
  "intervention",
  "screen",
  "action",
  "field",
  "object",
  "capability",
  "application",
  "role",
  "person",
];

export const TYPE_LABEL: Record<NodeType, { one: string; many: string }> = {
  application: { one: "Application", many: "Applications" },
  screen: { one: "Screen", many: "Screens" },
  action: { one: "Action", many: "Actions" },
  field: { one: "Field", many: "Fields" },
  object: { one: "Object", many: "Objects" },
  workflow: { one: "Workflow", many: "Workflows" },
  step: { one: "Step", many: "Steps" },
  requirement: { one: "Requirement", many: "Requirements" },
  objective: { one: "Objective", many: "Objectives" },
  role: { one: "Role", many: "Roles" },
  person: { one: "Person", many: "People" },
  outcome: { one: "Outcome", many: "Outcomes" },
  policy: { one: "Policy", many: "Policies" },
  capability: { one: "Capability", many: "Capabilities" },
  intervention: { one: "Intervention", many: "Interventions" },
};

/** Sphere radius in scene units. Applications largest, fields smallest. */
export const NODE_RADIUS: Record<NodeType, number> = {
  application: 0.42,
  role: 0.3,
  person: 0.3,
  objective: 0.3,
  workflow: 0.3,
  outcome: 0.27,
  requirement: 0.22,
  policy: 0.22,
  capability: 0.22,
  screen: 0.22,
  step: 0.2,
  intervention: 0.2,
  object: 0.18,
  action: 0.12,
  field: 0.1,
};

/** Types that carry a permanent label (non-compact mode). */
export const DEFAULT_LABEL_TYPES: readonly NodeType[] = ["workflow", "step", "requirement", "objective", "screen", "outcome"];

export const STATUS_LABEL: Record<NodeStatus, string> = {
  observed: "Observed",
  hypothesis: "Hypothesis",
  confirmed: "Confirmed",
};

/** Human wording for an edge seen from a node, by direction. */
export const EDGE_LABEL: Record<EdgeType, { out: string; in: string }> = {
  contains: { out: "Contains", in: "Contained in" },
  navigates_to: { out: "Navigates to", in: "Reached from" },
  performs: { out: "Performs", in: "Performed by" },
  requires: { out: "Requires", in: "Required by" },
  fulfills: { out: "Fulfills", in: "Fulfilled by" },
  produces: { out: "Produces", in: "Produced by" },
  constrained_by: { out: "Constrained by", in: "Constrains" },
  assigned_to: { out: "Assigned to", in: "Assignees" },
  targets: { out: "Targets", in: "Targeted by" },
  depends_on: { out: "Depends on", in: "Dependency of" },
  addresses: { out: "Addresses", in: "Addressed by" },
  uses: { out: "Uses", in: "Used by" },
  reveals: { out: "Reveals", in: "Revealed by" },
};
