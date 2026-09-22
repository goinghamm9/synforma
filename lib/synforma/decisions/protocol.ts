import { z } from "zod";

/**
 * Wire contract for System One decisions: between the browser decider and
 * POST /api/decide, and between that route and a decision provider. The
 * shapes follow TypeSafe's System One API (a state plus typed questions; one
 * calibrated answer per question), so the same objects travel end to end.
 * Only "choice" and "noul" (yes / no) questions are used; a decision model
 * never generates text, so nothing here carries free-form model output.
 */

export const QUESTION_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;

export const ChoiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().max(2000).optional(),
  criteria: z.record(z.string().min(1).max(80), z.string().max(400).nullable()).refine((c) => {
    const n = Object.keys(c).length;
    return n >= 2 && n <= 48;
  }, "a choice needs between 2 and 48 options"),
});
export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;

export const NoulQuestionSchema = z.object({
  type: z.literal("noul"),
  instructions: z.string().max(2000).optional(),
  criteria: z.object({ true: z.string().max(400).optional(), false: z.string().max(400).optional() }).optional(),
});

export const QuestionSchema = z.discriminatedUnion("type", [ChoiceQuestionSchema, NoulQuestionSchema]);
export type DecisionQuestion = z.infer<typeof QuestionSchema>;

export const DecisionRequestSchema = z.object({
  /** What the model judges: a plain-language description of the situation. Never raw typed text of a person. */
  state: z.string().min(1).max(12_000),
  questions: z.record(z.string().regex(QUESTION_NAME_RE), QuestionSchema).refine((q) => {
    const n = Object.keys(q).length;
    return n >= 1 && n <= 8;
  }, "between 1 and 8 questions"),
});
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

export const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
});
export const NoulAnswerSchema = z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) });
export const AnswerSchema = z.discriminatedUnion("type", [ChoiceAnswerSchema, NoulAnswerSchema]);
export type DecisionAnswer = z.infer<typeof AnswerSchema>;

export const DecisionResponseSchema = z.object({
  answers: z.record(z.string(), AnswerSchema),
  provider: z.string(),
  model: z.string(),
  via: z.string(),
  latencyMs: z.number(),
});
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

/** What GET /api/decide/status reveals. Never a credential. */
export const DecisionStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.string(),
  model: z.string().optional(),
  via: z.string().optional(),
  /** Present only when the status was asked to probe (?probe=1): one live call with a fixed question. */
  probe: z
    .object({
      ok: z.boolean(),
      latencyMs: z.number().optional(),
      detail: z.string().optional(),
      route: z.string().optional(),
      model: z.string().optional(),
    })
    .optional(),
});
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;
