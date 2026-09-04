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

/**
 * Source authority for a piece of knowledge (highest first). Live observation of
 * the actual instance outranks configuration, which outranks the objective text,
 * which outranks documentation, which outranks model inference. See docs/KNOWLEDGE_LAYERS.md.
 */
export type TrustState =
  | "AUTHORITATIVE_LIVE"
  | "AUTHORITATIVE_METADATA"
  | "ORGANIZATION_APPROVED"
  | "VENDOR_DOCUMENTED"
  | "OBSERVED_HIGH_CONFIDENCE"
  | "OBSERVED_LOW_CONFIDENCE"
  | "MODEL_INFERRED"
  | "UNKNOWN";

export interface Provenance {
  /** How Synforma knows this: observed interface, stated objective, planner inference, configuration metadata, documentation. */
  source: "observed_interface" | "objective" | "planner_inference" | "configuration" | "documentation" | "human_confirmation";
  trust: TrustState;
  observedAt: number;
  /** Which planner produced an inference. */
  by?: PlannerKind;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  /** 0..1 confidence that this node is what we think it is. */
  confidence: number;
  status: NodeStatus;
  discoveredAt: number;
  provenance?: Provenance;
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
  /** Work context Synforma may use when acting (entry record URL, amounts, defaults). */
  context?: Record<string, string>;
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
  | "pointer_window"
  | "keyboard_window"
  | "friction_inferred"
  | "intervention_withheld"
  | "proficiency_updated"
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
  /** Assistance preference active for this run. */
  preference?: AssistancePreference;
  /** "Get It Done" was invoked during this run. */
  getItDone?: boolean;
  /** Assistance shown count (interventions displayed). */
  assistanceShown?: number;
  /** Interventions considered but withheld because DO_NOTHING won (false-intervention protection). */
  withheld?: number;
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

export type StruggleType =
  | "hesitation"
  | "validation_error"
  | "backtrack"
  | "abandon"
  | "wrong_screen"
  | "visual_search"
  | "decision_uncertainty"
  | "error_recovery";

/**
 * Friction taxonomy — observable interaction states, never emotions or traits.
 * See docs/ENGINE.md §7. This is what the friction engine infers from
 * semantic context plus pointer / keyboard metadata windows.
 */
export type FrictionState =
  | "FLUENT"
  | "VISUAL_SEARCH"
  | "DECISION_UNCERTAINTY"
  | "WORKFLOW_KNOWLEDGE_GAP"
  | "POLICY_UNCERTAINTY"
  | "ERROR_RECOVERY"
  | "WORKFLOW_FRICTION"
  | "TIME_PRESSURE"
  | "UNKNOWN";

export interface FrictionInference {
  state: FrictionState;
  confidence: number;
  evidence: string[];
  alternatives: { state: FrictionState; confidence: number }[];
  ruleVersion: string;
  stepId?: string;
  t: number;
}

/** Aggregated pointer features for a short window. Raw movement never leaves the client. */
export interface PointerWindow {
  durationMs: number;
  sampleCount: number;
  distancePx: number;
  straightLineDistancePx: number;
  /** straight-line ÷ path distance, 0..1 (1 = direct movement). */
  pathEfficiency: number;
  meanVelocityPxS: number;
  maxVelocityPxS: number;
  directionChanges: number;
  targetApproaches: number;
  targetWithdrawals: number;
  targetHoverMs: number;
  targetSeen: boolean;
  hoverTargets: { key: string; name: string; dwellMs: number }[];
  clicks: number;
  idleMs: number;
}

/** Keyboard METADATA only. Character values are discarded at capture time. */
export interface KeyboardWindow {
  durationMs: number;
  keyCount: number;
  characterCount: number;
  backspaceCount: number;
  enterCount: number;
  escapeCount: number;
  shortcutCount: number;
  navigationCount: number;
  medianInterKeyMs: number | null;
  typingBursts: number;
  /** Windows that touched a password/secret field are suppressed entirely; this counts suppressed keystrokes. */
  suppressedCount: number;
}

export interface StruggleSignal {
  id: string;
  runId: string;
  stepId: string;
  type: StruggleType;
  /** 0..1 relative magnitude. */
  magnitude: number;
  t: number;
  detail?: string;
  /** Friction state when the signal came from the friction engine. */
  frictionState?: FrictionState;
  frictionConfidence?: number;
  evidence?: string[];
}

export interface Hypothesis {
  id: string;
  programId: string;
  stepId: string;
  barrier: BarrierType;
  /** Observable interaction state this hypothesis was derived from, when available. */
  frictionState?: FrictionState;
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

// ───────────────────────────── Proficiency & preferences ─────────────────────────────

export type AssistanceLevel = "observe" | "explain" | "guide" | "do_with_me";

/** How the person wants Synforma to help. A preference, never a global override of safety rules. */
export type AssistancePreference = "just_do_it" | "work_with_me" | "teach_me" | "stay_out";

export interface ProficiencyState {
  programId: string;
  stepId: string;
  assistedRuns: number;
  unassistedSuccesses: number;
  recentErrors: number;
  /** Rolling count of errors over the last 5 runs. */
  errorHistory: boolean[];
  assistanceLevel: AssistanceLevel;
  updatedAt: number;
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
  /** Agent (Act) runs, reported separately from people. */
  agent: CohortMetrics;
  /** Human-only cohort (excludes synthetic simulation). */
  human: CohortMetrics;
  /** Synthetic (simulation) cohort, labeled as such. */
  synthetic: CohortMetrics;
  /** Total semantic re-groundings across runs (self-healing events). */
  regroundings: number;
  /** Minimum sample reached for descriptive statistics. */
  sufficient: boolean;
  minimumRuns: number;
}

// ───────────────────────────── Settings ─────────────────────────────

export interface SynformaSettings {
  plannerPreference: "auto" | PlannerKind;
  /** Default assistance preference for new runs. */
  assistancePreference: AssistancePreference;
  /** Pointer / keyboard-metadata sensing on (never raw text; never on password fields). */
  interactionSensing: boolean;
  /** Sensing paused by the person (visible state). */
  sensingPaused: boolean;
  /** Hesitation threshold in ms before the overlay considers the person stuck. */
  hesitationThresholdMs: number;
  /** Always require approval before commit actions in Act mode. */
  requireApprovalForCommit: boolean;
  /** Share of human runs assigned to treatment for interventions under test. */
  treatmentShare: number;
}

export const DEFAULT_SETTINGS: SynformaSettings = {
  plannerPreference: "auto",
  assistancePreference: "work_with_me",
  interactionSensing: true,
  sensingPaused: false,
  hesitationThresholdMs: 12_000,
  requireApprovalForCommit: true,
  treatmentShare: 0.5,
};
