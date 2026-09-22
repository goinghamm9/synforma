import type { ElementRole, Requirement, SemanticElement } from "../types";

/**
 * The engine's side of a decision model. The runner, the explorer and the
 * planner ask small typed questions when their lexical rules are unsure; the
 * model answers with a calibrated probability, and the engine decides what to
 * do with it. Every method resolves null when the model cannot be reached.
 */

/** What the runner asks when it cannot find the field it expects on a screen. */
export interface FieldChoiceInput {
  expected: {
    name: string;
    role?: ElementRole;
    /** The value about to be entered, when it is literal (never a template). */
    value?: string;
    /** The objective requirement behind the field, when there is one. */
    requirement?: string;
    region?: string;
  };
  screen: { heading: string; url: string };
  candidates: SemanticElement[];
}

export interface FieldChoice {
  /** The chosen element's semantic key, or null for "none of these". */
  key: string | null;
  name: string | null;
  /** Probability the model assigned to the chosen label (to "none" when key is null). */
  probability: number;
  confidence: number;
  latencyMs: number;
}

/** What the runner asks when a control it must activate (a button, a menu item, a tab, a link) cannot be found. */
export interface ControlChoiceInput {
  expected: {
    name: string;
    role?: ElementRole;
    /** The action's own wording ("Open the Actions menu"). */
    label: string;
    /** True when the plan knew the control as a commit (create, submit, delete): only commit controls are offered then, and never otherwise. */
    commit?: boolean;
    region?: string;
    /** The step the action belongs to. */
    purpose?: string;
  };
  screen: { heading: string; url: string };
  candidates: SemanticElement[];
}

export type ControlChoice = FieldChoice;

/** Discovery asks which of a menu's items would commit data before it tries any of them. */
export interface CommitAssessmentInput {
  screen: { heading: string; url: string };
  /** Where the controls sit ("the items of the menu \"Actions\""). */
  context?: string;
  controls: SemanticElement[];
}

export interface CommitAssessment {
  key: string;
  name: string;
  /** Probability that activating the control creates, changes, sends or deletes business data. */
  commit: number;
}

/** Planning asks where a requirement's value goes when every lexical score is weak. */
export interface MappingChoiceInput {
  requirement: Requirement;
  objective?: string;
  appName?: string;
  candidates: { field: SemanticElement; screen: string; score: number }[];
}

export type MappingChoice = FieldChoice;

export interface JudgmentAssessmentInput {
  requirements: Requirement[];
  objective?: string;
  appName?: string;
}

export interface JudgmentAssessment {
  id: string;
  /** Probability that satisfying the requirement needs a person's own judgment or knowledge. */
  judgment: number;
}

/** A decision model the engine may consult. Every method resolves null when the model cannot be reached. */
export interface Decider {
  /** Short model name for events and prose ("Jev"). */
  readonly name: string;
  /** Why the last call gave no answer, for the audit; null after a successful call. */
  readonly lastError: string | null;
  chooseField(input: FieldChoiceInput): Promise<FieldChoice | null>;
  chooseControl(input: ControlChoiceInput): Promise<ControlChoice | null>;
  assessCommits(input: CommitAssessmentInput): Promise<CommitAssessment[] | null>;
  chooseMapping(input: MappingChoiceInput): Promise<MappingChoice | null>;
  assessJudgment(input: JudgmentAssessmentInput): Promise<JudgmentAssessment[] | null>;
}

/**
 * Below this probability a choice counts as no answer and the lexical rules keep their say. Conservative on purpose: a
 * wrong placement costs a requirement, while "none" usually still succeeds through the tab search and the deferral to
 * later screens. A calibrated model at 0.8 is right about four times in five, which is where acting starts to pay.
 */
export const ACCEPT_PROBABILITY = 0.8;
/**
 * At or above this probability a menu item counts as a commit during discovery and is never tried there. Higher than the
 * acceptance threshold on purpose: the vocabulary already keeps discovery away from the obvious commits, and a false
 * positive here hides a whole form from discovery, so only a near-certain answer may add to the list.
 */
export const COMMIT_PROBABILITY = 0.95;
/** At or above this probability a requirement is flagged as needing human judgment. The flag is only ever added. */
export const JUDGMENT_PROBABILITY = 0.9;
