import type { ElementRole, SemanticElement } from "../types";

/**
 * The engine's side of a decision model. The runner asks small typed
 * questions when its lexical rules are unsure; the model answers with a
 * calibrated probability, and the runner decides what to do with it.
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
  /** The chosen field's semantic key, or null for "none of these". */
  key: string | null;
  name: string | null;
  /** Probability the model assigned to the chosen label (to "none" when key is null). */
  probability: number;
  confidence: number;
  latencyMs: number;
}

/** A decision model the runner may consult. Every method resolves null when the model cannot be reached. */
export interface Decider {
  /** Short model name for events and prose ("Jev"). */
  readonly name: string;
  /** Why the last call gave no answer, for the audit; null after a successful call. */
  readonly lastError: string | null;
  chooseField(input: FieldChoiceInput): Promise<FieldChoice | null>;
}

/**
 * Below this probability a choice counts as no answer and the lexical rules keep their say. Conservative on purpose: a
 * wrong placement costs a requirement, while "none" usually still succeeds through the tab search and the deferral to
 * later screens. A calibrated model at 0.8 is right about four times in five, which is where acting starts to pay.
 */
export const ACCEPT_PROBABILITY = 0.8;
