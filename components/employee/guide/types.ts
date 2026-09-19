import type { ChecklistItem } from "@/lib/synforma/engine/observer";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import type {
  ApprovalRequest,
  AssistanceLevel,
  AssistancePreference,
  ElementRect,
  FrictionInference,
  FrictionState,
  Intervention,
  KeyboardWindow,
  PageModel,
  PlannerKind,
  PointerWindow,
  StruggleSignal,
  Workflow,
} from "@/lib/synforma/types";

/**
 * Public types of the guide-mode run. `useGuideRun` (../use-guide-run) re-exports
 * them, so the panel components import from there as before.
 */

export type RunPhase = "idle" | "running" | "completed" | "abandoned";

export interface OverlayHighlight {
  /** Rect in iframe viewport coordinates. */
  rect: ElementRect;
  label: string;
  kind: "step" | "assistance";
}

export interface OverlayCursor {
  rect: ElementRect;
  label?: string;
}

export interface FrameBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PendingApproval extends ApprovalRequest {
  resolve: (decision: "granted" | "denied") => void;
  /** Judgment fields Synforma left to the person (Get It Done). */
  leftForYou?: string[];
  /** Label for the non-approving button. */
  denyLabel?: string;
}

/** What the person said about a card when dismissing it. */
export type AssistanceFeedback = "helpful" | "not_helpful" | "wrong_moment" | "wrong_assumption" | "too_much_help";

/** A decision in which DO_NOTHING won: recorded, and shown discreetly. */
export interface QuietDecision {
  stepId: string;
  frictionState: FrictionState | null;
  confidence: number | null;
  /** The struggle signal that triggered the decision (a time-only hesitation carries no friction state). */
  signalType: StruggleSignal["type"];
  detail?: string;
  candidates: { techniqueId: string; total: number }[];
  reason: string;
  t: number;
}

export type SensingStatus = "on" | "paused" | "off";

export interface GetItDoneState {
  status: "idle" | "running" | "ready" | "committing";
  /** Judgment fields Synforma left to the person. */
  leftForYou: { requirementId: string | null; fieldName: string }[];
  /** Steps Synforma handled in this run (distinct ids). */
  handledStepIds: string[];
  /** Name of the commit control Synforma stopped before. */
  stoppedBefore: string | null;
  error: string | null;
}

export interface FadedStep {
  stepId: string;
  title: string;
  level: AssistanceLevel;
}

export interface GuideRunState {
  phase: RunPhase;
  runId: string | null;
  frameReady: boolean;
  frameError: string | null;
  /** Index of the workflow step the person is on; -1 when off the workflow. */
  currentIndex: number;
  completedStepIds: string[];
  checklist: ChecklistItem[];
  page: PageModel | null;
  highlight: OverlayHighlight | null;
  cursor: OverlayCursor | null;
  frame: FrameBox | null;
  intervention: Intervention | null;
  withheld: Intervention | null;
  assistingStepId: string | null;
  approval: PendingApproval | null;
  completion: { requirementsMet: string[]; outcomeUrl: string } | null;
  plannerStatus: PlannerStatus | null;
  plannerKind: PlannerKind;
  startingAnother: boolean;
  /** Assistance preference for this (or the next) run. */
  preference: AssistancePreference;
  /** Latest friction inference from the observer (every ~1.5 s during a run). */
  friction: FrictionInference | null;
  /** Latest decision in which Synforma chose to stay quiet. */
  quiet: QuietDecision | null;
  /** Latest one-second interaction windows (aggregates only). */
  lastPointer: PointerWindow | null;
  lastKeyboard: KeyboardWindow | null;
  sensing: SensingStatus;
  getItDone: GetItDoneState;
  /** Steps whose assistance level faded at the end of the last run. */
  fadedSteps: FadedStep[];
}

export interface GuideRunApi extends GuideRunState {
  workflow: Workflow;
  startUrl: string;
  context: Record<string, string>;
  startRun: () => void;
  startAnotherRun: () => Promise<void>;
  abandonRun: () => void;
  dismissIntervention: (feedback?: AssistanceFeedback | "got_it" | "resolved") => void;
  assistStep: (stepId: string) => Promise<void>;
  showAssistanceAnyway: () => void;
  decideApproval: (decision: "granted" | "denied") => void;
  reloadFrame: () => Promise<void>;
  /** The person interacted with the panel: counts as activity for the hesitation timer. */
  touch: () => void;
  setPreference: (preference: AssistancePreference) => void;
  setSensingPaused: (paused: boolean) => void;
  /** Get It Done: handle the routine steps from here and stop before the commit. */
  getItDoneNow: () => void;
  /** Re-open the approval for a Get It Done run that stopped before the commit. */
  reopenApproval: () => void;
  /** After a Get It Done run: what the next run should feel like. */
  chooseNextTime: (preference: "teach_me" | "just_do_it") => void;
  /** "Teach me anyway" / "Keep handling this": set the assistance level for a step. */
  overrideProficiency: (stepId: string, level: AssistanceLevel) => void;
}
