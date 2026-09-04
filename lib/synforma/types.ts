/**
 * SYNFORMA core domain contracts.
 *
 * Everything the product reasons about is represented here:
 *   - the semantic page model produced by the Universal Interaction Layer
 *   - the Work Graph (how work actually happens)
 *   - Programs, Workflows and Steps derived from a natural-language objective
 *   - Runs and Events (agent, human, synthetic)
 *   - the Autonomous Adoption Engine (signals → hypotheses → interventions)
 *   - Audit and Metrics
 *
 * Principles encoded in the types:
 *   1. Never reference DOM ids/classes. Elements are addressed by semantic keys.
 *   2. Everything inferred carries a confidence; nothing inferred is presented as fact.
 *   3. Every recommendation stores the components of its score ("Why this?").
 */

// ───────────────────────────── Semantic page model ─────────────────────────────

export type ElementRole =
  | "button"
  | "link"
  | "textbox"
  | "textarea"
  | "combobox"
  | "checkbox"
  | "radio"
  | "switch"
  | "tab"
  | "menuitem"
  | "menu"
  | "dialog"
  | "heading"
  | "option"
  | "alert"
  | "row"
  | "cell"
  | "unknown";

export interface ElementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SemanticElement {
  /** Stable semantic key: role + accessible name + container path. Never a DOM id or class. */
  key: string;
  role: ElementRole;
  /** Accessible name (aria-label, associated <label>, text content, placeholder, title). */
  name: string;
  /** Help text or description near the element, when present. */
  description?: string;
  /** Current value for inputs. */
  value?: string;
  /** Available options for selects / radio groups. */
  options?: string[];
  inputType?: string;
  href?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  checked?: boolean;
  /** For tabs, collapsibles and menus. */
  expanded?: boolean;
  /** True when the element is rendered and not visually hidden. */
  visible: boolean;
  /** Nearest landmark / section heading. */
  region?: string;
  /** Container path: landmark and heading names from the root down. */
  path: string[];
  rect?: ElementRect;
  /** Heuristic classification: this action commits or destroys data. Discovery never executes these. */
  commit?: boolean;
  /** True when the element is inside an open dialog. */
  inDialog?: boolean;
  /** True when the element opens a popup menu (aria-haspopup). */
  popup?: boolean;
}

export interface PageModel {
  /** Route: pathname + search. */
  url: string;
  title: string;
  heading: string;
  /** Visible h1–h3 texts in document order. */
  headings: string[];
  landmarks: string[];
  elements: SemanticElement[];
  fields: SemanticElement[];
  actions: SemanticElement[];
  alerts: string[];
  dialogs: string[];
  /** Data tables: a strong signal for business objects. */
  tables: { name: string; headers: string[]; rows: number }[];
  /** Definition lists (label → value): how record detail pages expose data. */
  definitions: { label: string; value: string }[];
  /** Structural fingerprint used to de-duplicate application states. */
  fingerprint: string;
  capturedAt: number;
}

// ───────────────────────────── Actions ─────────────────────────────

export type ActionKind = "click" | "type" | "select" | "check" | "navigate" | "wait" | "expand";

export interface Action {
  kind: ActionKind;
  /** Semantic key of the target element, when applicable. */
  target?: string;
  /** Human-readable target name (used for re-grounding after UI changes). */
  targetName?: string;
  targetRole?: ElementRole;
  /** The target was classified as a commit control when planned (used to re-ground to a commit control). */
  targetCommit?: boolean;
  /** Section / heading the target lived under when planned. */
  targetRegion?: string;
  value?: string;
  url?: string;
  /** Short human-readable description ("Open the Actions menu"). */
  label: string;
}

export interface ActionResult {
  ok: boolean;
  action: Action;
  /** True when the target had to be re-resolved semantically because the original key no longer existed. */
  regrounded?: boolean;
  regroundedTo?: string;
  error?: string;
  page?: PageModel;
  durationMs: number;
}

// ───────────────────────────── Work Graph ─────────────────────────────

export type NodeType =
  | "application"
  | "screen"
  | "action"
  | "field"
  | "object"
  | "workflow"
  | "step"
  | "requirement"
  | "objective"
  | "role"
  | "person"
  | "outcome"
  | "policy"
  | "capability"
  | "intervention";

export type NodeStatus = "hypothesis" | "observed" | "confirmed";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  /** 0..1 confidence that this node is what we think it is. */
  confidence: number;
  status: NodeStatus;
  discoveredAt: number;
  data?: Record<string, unknown>;
}

export type EdgeType =
  | "contains"
  | "navigates_to"
  | "performs"
  | "requires"
  | "fulfills"
  | "produces"
  | "constrained_by"
  | "assigned_to"
  | "targets"
  | "depends_on"
  | "addresses"
  | "uses"
  | "reveals";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
  weight?: number;
}

export interface WorkGraph {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  version: number;
  updatedAt: number;
}

// ───────────────────────────── Programs & workflows ─────────────────────────────

export type RequirementKind = "field" | "policy" | "outcome" | "process";

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  /** Lexical anchors used by the heuristic planner. */
  keywords: string[];
  /** True when satisfying this requires human judgment (never automated away). */
  judgment: boolean;
  /** Optional structured expectation used to verify outcomes. */
  expectation?: {
    fieldHint: string;
    /** Values that count as satisfied; empty means "any non-empty". */
    acceptedValues?: string[];
    /** Values that do NOT count (e.g. "Unknown"). */
    rejectedValues?: string[];
    /** Date must be within N days from now. */
    withinDays?: number;
  };
}

export type ExecutionMode = "guide" | "assist" | "act";

export interface SemanticAnchor {
  route?: string;
  routePattern?: string;
  heading?: string;
  elementKey?: string;
  elementName?: string;
  role?: ElementRole;
  dialogTitle?: string;
}

export interface WorkflowStep {
  id: string;
  index: number;
  title: string;
  description?: string;
  /** Screen node id in the Work Graph. */
  screenId?: string;
  route?: string;
  actions: Action[];
  requirementIds: string[];
  mode: ExecutionMode;
  modeRationale: string;
  /** This step commits data (create / submit). Always approval-gated in Act mode. */
  commit: boolean;
  /** Requires human judgment. */
  judgment: boolean;
  anchor: SemanticAnchor;
  /** What the step looks like when it is done. */
  expected?: string;
  /** Elements that had to be expanded/opened to reveal this step's fields. */
  reveals?: string[];
}

export interface Workflow {
  id: string;
  title: string;
  startUrl: string;
  steps: WorkflowStep[];
  successCriteria: string[];
  /** Route (pattern) of the outcome screen. */
  outcomeRoutePattern?: string;
  confidence: number;
}

export interface ParsedObjective {
  title: string;
  population: string;
  targetBehavior: string;
  requirements: Requirement[];
  policyConstraints: string[];
  successDefinition: string;
  /** Hints about the object of the workflow ("opportunity", "expense report"). */
  objectHints: string[];
  /** Hints about the entry object ("lead"). */
  entryHints: string[];
  confidence: number;
}

export type PlannerKind = "heuristic" | "gemini";

export type ProgramStatus = "draft" | "discovering" | "understood" | "active" | "paused";

export interface Program {
  id: string;
  title: string;
  objectiveText: string;
  application: { name: string; baseUrl: string };
  parsed?: ParsedObjective;
  workflow?: Workflow;
  graphId: string;
  status: ProgramStatus;
  planner: PlannerKind;
  createdAt: number;
  updatedAt: number;
  /** Discovery statistics, from actual crawl. */
  discovery?: {
    startedAt: number;
    endedAt?: number;
    screens: number;
    actions: number;
    fields: number;
    objects: number;
    statesVisited: number;
  };
}

// ───────────────────────────── Runs & events ─────────────────────────────

export type RunActor = "agent" | "human" | "synthetic";

export type RunOutcome = "completed" | "abandoned" | "failed";

export type RunEventType =
  | "run_started"
  | "screen_visited"
  | "step_entered"
  | "step_completed"
  | "action_executed"
  | "action_regrounded"
  | "action_failed"
  | "validation_error"
  | "backtrack"
  | "hesitation"
  | "wrong_screen"
  | "assistance_shown"
  | "assistance_dismissed"
  | "assist_requested"
  | "assist_completed"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "outcome_verified"
  | "run_completed"
  | "run_abandoned"
  | "run_failed"
  | "note";

export interface RunEvent {
  id: string;
  runId: string;
  t: number;
  type: RunEventType;
  stepId?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface Run {
  id: string;
  programId: string;
  workflowId: string;
  actor: RunActor;
  /** Synthetic persona name or human display name. */
  persona?: string;
  mode: ExecutionMode;
  startedAt: number;
  endedAt?: number;
  outcome?: RunOutcome;
  /** Interventions that were active for this run. */
  interventionIds: string[];
  cohort?: "control" | "treatment";
  /** UI variant of the target application as observed at run start. */
  uiVariant?: string;
  /** Requirement ids verified as satisfied on the outcome screen. */
  requirementsMet: string[];
  /** Number of actions that needed semantic re-grounding. */
  regroundings: number;
}

// ───────────────────────────── Adoption engine ─────────────────────────────

/**
 * Barrier taxonomy. Inspired by the COM-B model (capability, opportunity,
 * motivation) applied to software-mediated work. This is a THEORETICAL MODEL,
 * not a measurement of anyone's mind.
 */
export type BarrierType =
  | "capability_knowledge" // does not know the step exists or what it means
  | "capability_skill" // knows, but the interaction is hard (format, sequence)
  | "opportunity_visibility" // the control is hidden, collapsed, or elsewhere
  | "opportunity_friction" // the interface makes the step slow or error-prone
  | "motivation_uncertainty" // hesitates because the right thing is unclear (policy, data)
  | "motivation_value"; // does not see why the step matters

export type StruggleType = "hesitation" | "validation_error" | "backtrack" | "abandon" | "wrong_screen";

export interface StruggleSignal {
  id: string;
  runId: string;
  stepId: string;
  type: StruggleType;
  /** 0..1 relative magnitude. */
  magnitude: number;
  t: number;
  detail?: string;
}

export interface Hypothesis {
  id: string;
  programId: string;
  stepId: string;
  barrier: BarrierType;
  confidence: number;
  evidence: string[];
  alternatives: { barrier: BarrierType; confidence: number }[];
  createdAt: number;
}

export type EvidenceClass = "strong" | "promising" | "theoretical" | "philosophical" | "experimental";

export interface InterventionTechnique {
  id: string;
  name: string;
  mechanism: string;
  barriers: BarrierType[];
  description: string;
  example: string;
  /** Which execution mode this technique produces. */
  mode: ExecutionMode;
  evidence: EvidenceClass;
  /** Ids from the citation registry. Never free-text citations. */
  sourceIds: string[];
  cautions: string[];
  /** 0..1 burden on the person. */
  burden: number;
}

export interface InterventionScore {
  barrierFit: number;
  contextFit: number;
  evidenceWeight: number;
  previousSuccess: number;
  repetitionPenalty: number;
  burdenPenalty: number;
  total: number;
  explanation: string[];
}

export type InterventionStatus = "proposed" | "testing" | "deployed" | "retired";

export interface Intervention {
  id: string;
  programId: string;
  stepId: string;
  hypothesisId: string;
  techniqueId: string;
  content: {
    title: string;
    body: string;
    anchor?: SemanticAnchor;
    /** Offer "Let Synforma do this step" (Assist). */
    offerAssist: boolean;
    /** Source of the explanatory content (policy document, requirement). */
    source?: string;
  };
  scoring: InterventionScore;
  status: InterventionStatus;
  createdAt: number;
  experiment: {
    /** Fraction of runs assigned to treatment. */
    treatmentShare: number;
    minRunsPerArm: number;
  };
  /** Whether the content was generated by a live LLM or by the heuristic planner. */
  generatedBy: PlannerKind;
}

// ───────────────────────────── Trust & audit ─────────────────────────────

export type AuditActor = RunActor | "admin" | "synforma";

export interface AuditEntry {
  id: string;
  t: number;
  actor: AuditActor;
  action: string;
  target?: string;
  detail?: string;
  runId?: string;
  programId?: string;
  approval?: "requested" | "granted" | "denied";
}

export interface ApprovalRequest {
  id: string;
  runId: string;
  stepId: string;
  title: string;
  summary: string;
  /** Field → value about to be committed. */
  payload: Record<string, string>;
  requestedAt: number;
  decision?: "granted" | "denied";
  decidedAt?: number;
}

// ───────────────────────────── Metrics ─────────────────────────────

export interface StepMetrics {
  stepId: string;
  title: string;
  entered: number;
  completed: number;
  medianDurationMs: number | null;
  errors: number;
  hesitations: number;
  backtracks: number;
  assistanceShown: number;
  assistRequested: number;
  /** 0..1 friction index derived from the above; null when insufficient data. */
  friction: number | null;
}

export interface CohortMetrics {
  runs: number;
  completed: number;
  rate: number | null;
  medianDurationMs: number | null;
}

export interface ProgramMetrics {
  runs: number;
  byActor: Record<RunActor, number>;
  completed: number;
  /** Of the intended outcomes, how many happened correctly? null until enough runs. */
  intentToOutcomeRate: number | null;
  medianDurationMs: number | null;
  steps: StepMetrics[];
  control: CohortMetrics;
  treatment: CohortMetrics;
  /** Total semantic re-groundings across runs (self-healing events). */
  regroundings: number;
  /** Minimum sample reached for descriptive statistics. */
  sufficient: boolean;
  minimumRuns: number;
}

// ───────────────────────────── Settings ─────────────────────────────

export interface SynformaSettings {
  plannerPreference: "auto" | PlannerKind;
  /** Hesitation threshold in ms before the overlay considers the person stuck. */
  hesitationThresholdMs: number;
  /** Always require approval before commit actions in Act mode. */
  requireApprovalForCommit: boolean;
  /** Share of human runs assigned to treatment for interventions under test. */
  treatmentShare: number;
}

export const DEFAULT_SETTINGS: SynformaSettings = {
  plannerPreference: "auto",
  hesitationThresholdMs: 12_000,
  requireApprovalForCommit: true,
  treatmentShare: 0.5,
};
