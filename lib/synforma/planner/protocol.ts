import { z } from "zod";

/**
 * Wire protocol between the browser and the server-side LLM planner.
 * Shared by the client (GeminiPlanner) and the route handler so that any
 * provider (Gemini today; others later) must produce the same validated shapes.
 */

export const RequirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(["field", "policy", "outcome", "process"]),
  keywords: z.array(z.string()),
  judgment: z.boolean(),
  expectation: z
    .object({
      fieldHint: z.string(),
      acceptedValues: z.array(z.string()).optional(),
      rejectedValues: z.array(z.string()).optional(),
      withinDays: z.number().optional(),
    })
    .optional(),
});

export const ParsedObjectiveSchema = z.object({
  title: z.string(),
  population: z.string(),
  targetBehavior: z.string(),
  requirements: z.array(RequirementSchema),
  policyConstraints: z.array(z.string()),
  successDefinition: z.string(),
  objectHints: z.array(z.string()),
  entryHints: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const BarrierSchema = z.enum([
  "capability_knowledge",
  "capability_skill",
  "opportunity_visibility",
  "opportunity_friction",
  "motivation_uncertainty",
  "motivation_value",
]);

export const DiagnosisSchema = z.object({
  stepId: z.string(),
  barrier: BarrierSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  alternatives: z.array(z.object({ barrier: BarrierSchema, confidence: z.number().min(0).max(1) })),
});

export const AssistanceSchema = z.object({
  title: z.string().max(120),
  body: z.string().max(600),
  anchorElementName: z.string().optional(),
  offerAssist: z.boolean(),
  source: z.string().optional(),
});

/** Field mapping the LLM produces for workflow inference; the client turns it into steps. */
export const FieldMappingSchema = z.object({
  mappings: z.array(
    z.object({
      requirementId: z.string(),
      fieldKey: z.string(),
      stateId: z.string(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  ),
  stepModes: z.array(
    z.object({
      stateId: z.string(),
      mode: z.enum(["guide", "assist", "act"]),
      rationale: z.string(),
    }),
  ),
});

export const PlannerRequestSchema = z.discriminatedUnion("task", [
  z.object({ task: z.literal("parseObjective"), objectiveText: z.string().min(1).max(8000), appName: z.string() }),
  z.object({
    task: z.literal("mapFields"),
    parsed: ParsedObjectiveSchema,
    states: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        route: z.string(),
        fields: z.array(z.object({ key: z.string(), name: z.string(), role: z.string(), options: z.array(z.string()).optional(), region: z.string().optional(), required: z.boolean().optional() })),
      }),
    ),
  }),
  z.object({
    task: z.literal("diagnose"),
    step: z.object({ id: z.string(), title: z.string(), judgment: z.boolean(), commit: z.boolean(), reveals: z.array(z.string()).optional(), requirementIds: z.array(z.string()) }),
    signals: z.array(z.object({ type: z.string(), magnitude: z.number(), detail: z.string().optional() })),
    requirements: z.array(RequirementSchema),
  }),
  z.object({
    task: z.literal("composeAssistance"),
    step: z.object({ id: z.string(), title: z.string(), judgment: z.boolean(), commit: z.boolean(), reveals: z.array(z.string()).optional(), requirementIds: z.array(z.string()), fieldNames: z.array(z.string()) }),
    requirements: z.array(RequirementSchema),
    hypothesis: DiagnosisSchema,
    technique: z.object({ id: z.string(), name: z.string(), mechanism: z.string(), description: z.string(), example: z.string(), mode: z.enum(["guide", "assist", "act"]), cautions: z.array(z.string()) }),
    policyConstraints: z.array(z.string()),
  }),
]);

export type PlannerRequest = z.infer<typeof PlannerRequestSchema>;

export const PlannerStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.string(),
  model: z.string().optional(),
});
export type PlannerStatus = z.infer<typeof PlannerStatusSchema>;
