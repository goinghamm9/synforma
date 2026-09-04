import type { DiscoveredState } from "../engine/explorer";
import type {
  Hypothesis,
  InterventionTechnique,
  ParsedObjective,
  PlannerKind,
  Requirement,
  SemanticAnchor,
  StruggleSignal,
  WorkGraph,
  Workflow,
  WorkflowStep,
} from "../types";

/**
 * The Planner is the reasoning boundary of Synforma.
 *
 * Two implementations exist:
 *  - HeuristicPlanner: deterministic, lexical, runs without any API key.
 *  - GeminiPlanner: server-side LLM with structured JSON output validated by Zod.
 *
 * Both consume the same inputs and produce the same typed outputs, so the
 * rest of the system (explorer, runner, observer, adoption engine, UI) does not
 * care which one is active. The LLM is never the source of scientific truth:
 * techniques and citations come from the registries.
 */

export interface ParseObjectiveInput {
  objectiveText: string;
  appName: string;
}

export interface InferWorkflowInput {
  parsed: ParsedObjective;
  states: DiscoveredState[];
  graph: WorkGraph;
  startUrl: string;
}

export interface DiagnoseInput {
  step: WorkflowStep;
  workflow: Workflow;
  requirements: Requirement[];
  signals: StruggleSignal[];
}

export type DiagnoseOutput = Omit<Hypothesis, "id" | "programId" | "createdAt">;

export interface ComposeAssistanceInput {
  step: WorkflowStep;
  workflow: Workflow;
  requirements: Requirement[];
  hypothesis: DiagnoseOutput;
  technique: InterventionTechnique;
  policyConstraints: string[];
}

export interface AssistanceContent {
  title: string;
  body: string;
  anchor?: SemanticAnchor;
  offerAssist: boolean;
  source?: string;
}

export interface Planner {
  readonly kind: PlannerKind;
  parseObjective(input: ParseObjectiveInput): Promise<ParsedObjective>;
  inferWorkflow(input: InferWorkflowInput): Promise<Workflow>;
  diagnose(input: DiagnoseInput): Promise<DiagnoseOutput>;
  composeAssistance(input: ComposeAssistanceInput): Promise<AssistanceContent>;
}

/** Capabilities that can be switched off to simulate less capable (synthetic) users. */
export interface RunCapabilities {
  /** Use the synonym lexicon when re-grounding elements. */
  synonyms: boolean;
  /** Expand disclosures / open tabs to reveal hidden fields. */
  expand: boolean;
  /** Repair validation errors (e.g. date format) and retry. */
  fixValidation: boolean;
  /** Fill fields that the interface does not mark as required. */
  fillOptional: boolean;
}

export const FULL_CAPABILITIES: RunCapabilities = { synonyms: true, expand: true, fixValidation: true, fillOptional: true };
