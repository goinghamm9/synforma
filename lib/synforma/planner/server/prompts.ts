import type { z } from "zod";
import { AssistanceSchema, DiagnosisSchema, FieldMappingSchema, ParsedObjectiveSchema, type PlannerRequest } from "../protocol";

/**
 * Prompts and response schemas for the server-side planner.
 *
 * One system prompt carries the non-negotiable rules for every task; each task
 * has a user-prompt builder that lays out the data and the task-specific
 * instructions. The JSON schemas below are written by hand to mirror the Zod
 * shapes in ../protocol.ts (the Zod schema remains the authority: the route
 * validates every response against it and retries once with a corrective
 * instruction).
 */

export type JsonSchema = Record<string, unknown>;

export const SYSTEM_PROMPT = [
  "You are the planning component of Synforma, a system that helps people complete workflows in enterprise software. You receive structured observations and return structured JSON. You do not talk to people directly; other components decide what is shown and when.",
  "",
  "Rules, in priority order:",
  "1. Return JSON only, matching the provided schema exactly: no prose, no markdown fences, no comments, no extra keys.",
  "2. Use only identifiers that appear in the input. When mapping requirements to fields, use the field keys and state ids verbatim. Never invent ids, fields, screens, routes, requirements, or policies.",
  "3. Do not add requirements, policies, or success criteria that the objective text does not state. If the objective is silent on something, leave it out rather than filling the gap.",
  "4. Express uncertainty through the confidence fields (0 to 1). A lower confidence is always preferable to a confident guess. Reserve values above 0.85 for cases the input settles unambiguously.",
  "5. Never claim to observe what you were not given. You cannot see the screen, the person, or their intent; you only see the observations listed in the input. Evidence strings must restate those observations, not extend them.",
  "6. Assistance text is at most two sentences, calm, specific, and in plain language. No exclamation marks, no marketing language, no praise, no urgency, no promises about results, and no first-person feelings.",
  "7. Steps that need human judgment are never automated. Never suggest that the system decides for the person, and never prefill a judgment field with a guess.",
  "8. Scientific claims are out of scope: do not cite research, name techniques beyond the one provided, or assert that anything is effective. Techniques and evidence come from a registry outside this call.",
].join("\n");

// ─────────────────────────── JSON schemas (mirror ../protocol.ts) ───────────────────────────

const REQUIREMENT_JSON_SCHEMA: JsonSchema = {
  type: "object",
  description: "One requirement the objective states.",
  properties: {
    id: { type: "string", description: "r1, r2, ... in order of appearance." },
    text: { type: "string", description: "The requirement, close to the objective's own wording." },
    kind: { type: "string", enum: ["field", "policy", "outcome", "process"] },
    keywords: { type: "array", items: { type: "string" }, description: "2 to 6 lowercase lexical anchors taken from the text." },
    judgment: { type: "boolean", description: "True when satisfying it needs human knowledge (who decides, what is funded, whether something is accurate)." },
    expectation: {
      type: "object",
      description: "How the requirement would show up in a form.",
      properties: {
        fieldHint: { type: "string", description: "Short noun phrase a form label would use." },
        acceptedValues: { type: "array", items: { type: "string" }, description: "Only when the text lists explicit acceptable values." },
        rejectedValues: { type: "array", items: { type: "string" }, description: "Only when the text excludes explicit values, e.g. 'not Unknown'." },
        withinDays: { type: "number", description: "Only when the text states a horizon in days." },
      },
      required: ["fieldHint"],
    },
  },
  required: ["id", "text", "kind", "keywords", "judgment"],
};

export const PARSED_OBJECTIVE_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short imperative title, e.g. 'Create a qualified opportunity'." },
    population: { type: "string", description: "Who is expected to perform the behavior, as named in the text." },
    targetBehavior: { type: "string", description: "The behavior in one sentence." },
    requirements: { type: "array", items: REQUIREMENT_JSON_SCHEMA },
    policyConstraints: { type: "array", items: { type: "string" }, description: "Sentences that prohibit or restrict, verbatim or near-verbatim." },
    successDefinition: { type: "string", description: "The objective's own definition of success, or a faithful restatement." },
    objectHints: { type: "array", items: { type: "string" }, description: "Lowercase singular business object being produced, e.g. 'opportunity'." },
    entryHints: { type: "array", items: { type: "string" }, description: "Lowercase singular record the workflow starts from, e.g. 'lead'." },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["title", "population", "targetBehavior", "requirements", "policyConstraints", "successDefinition", "objectHints", "entryHints", "confidence"],
};

export const FIELD_MAPPING_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    mappings: {
      type: "array",
      description: "At most one entry per requirement. Omit requirements that map to no field.",
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string", description: "A requirement id from the input, verbatim." },
          fieldKey: { type: "string", description: "A field key from the input, verbatim." },
          stateId: { type: "string", description: "The id of the state that contains the field, verbatim." },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string", description: "One sentence." },
        },
        required: ["requirementId", "fieldKey", "stateId", "confidence", "rationale"],
      },
    },
    stepModes: {
      type: "array",
      description: "One entry per state that carries fields.",
      items: {
        type: "object",
        properties: {
          stateId: { type: "string", description: "A state id from the input, verbatim." },
          mode: { type: "string", enum: ["guide", "assist", "act"] },
          rationale: { type: "string", description: "One sentence." },
        },
        required: ["stateId", "mode", "rationale"],
      },
    },
  },
  required: ["mappings", "stepModes"],
};

const BARRIER_ENUM = ["capability_knowledge", "capability_skill", "opportunity_visibility", "opportunity_friction", "motivation_uncertainty", "motivation_value"];

export const DIAGNOSIS_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    stepId: { type: "string", description: "The step id from the input, verbatim." },
    barrier: { type: "string", enum: BARRIER_ENUM },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: { type: "string" }, description: "Restatements of the signals provided. Nothing that was not observed." },
    alternatives: {
      type: "array",
      description: "Up to two other plausible barriers, most likely first.",
      items: {
        type: "object",
        properties: {
          barrier: { type: "string", enum: BARRIER_ENUM },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["barrier", "confidence"],
      },
    },
  },
  required: ["stepId", "barrier", "confidence", "evidence", "alternatives"],
};

export const ASSISTANCE_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 120, description: "Under 60 characters when possible. Plain, specific." },
    body: { type: "string", maxLength: 600, description: "At most two sentences." },
    anchorElementName: { type: "string", description: "One of the provided field names or reveal names, verbatim. Omit when none fits." },
    offerAssist: { type: "boolean", description: "True only when the technique's mode is assist or act and the step needs no judgment." },
    source: { type: "string", description: "Where the wording comes from, e.g. 'Objective requirement 2' or 'Policy constraint 1'. Omit when nothing applies." },
  },
  required: ["title", "body", "offerAssist"],
};

export const RESPONSE_JSON_SCHEMAS: Record<PlannerRequest["task"], JsonSchema> = {
  parseObjective: PARSED_OBJECTIVE_JSON_SCHEMA,
  mapFields: FIELD_MAPPING_JSON_SCHEMA,
  diagnose: DIAGNOSIS_JSON_SCHEMA,
  composeAssistance: ASSISTANCE_JSON_SCHEMA,
};

export const RESPONSE_VALIDATORS: Record<PlannerRequest["task"], z.ZodType> = {
  parseObjective: ParsedObjectiveSchema,
  mapFields: FieldMappingSchema,
  diagnose: DiagnosisSchema,
  composeAssistance: AssistanceSchema,
};

// ─────────────────────────── user prompt builders ───────────────────────────

const BARRIER_GLOSSARY = [
  "capability_knowledge: does not know the step exists or what it means",
  "capability_skill: knows what to do, but the interaction itself is hard (format, sequence)",
  "opportunity_visibility: the control is hidden, collapsed, or on another screen",
  "opportunity_friction: the interface makes the step slow or error-prone",
  "motivation_uncertainty: hesitates because the right thing is unclear (policy, data)",
  "motivation_value: does not see why the step matters",
].join("\n");

function block(label: string, content: string): string {
  return `${label}:\n<<<\n${content}\n>>>`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 1);
}

export interface TaskPrompt {
  task: PlannerRequest["task"];
  system: string;
  user: string;
  schema: JsonSchema;
  validator: z.ZodType;
}

export function buildTaskPrompt(req: PlannerRequest): TaskPrompt {
  return { task: req.task, system: SYSTEM_PROMPT, user: buildUserPrompt(req), schema: RESPONSE_JSON_SCHEMAS[req.task], validator: RESPONSE_VALIDATORS[req.task] };
}

export function buildUserPrompt(req: PlannerRequest): string {
  switch (req.task) {
    case "parseObjective":
      return [
        `Task: parseObjective. Turn an adoption objective written by an administrator into a structured program for the application "${req.appName}".`,
        "",
        block("Objective text", req.objectiveText),
        "",
        "Instructions:",
        "- population: the group the text names as expected to perform the behavior.",
        "- targetBehavior: the behavior in one sentence, stated as the text states it.",
        "- requirements: one entry per stated requirement, ids r1, r2, ... in order of appearance. kind is 'field' when it must appear as data in the application, 'policy' when it prohibits or restricts, 'process' when it describes how work is sequenced, 'outcome' when it describes a result to measure. Set judgment true when satisfying it needs human knowledge (who decides, what is funded, whether something is accurate or appropriate). expectation.fieldHint is the short noun phrase a form label would use; add acceptedValues only when the text lists explicit acceptable values, rejectedValues only when it excludes explicit values, withinDays only when it states a horizon in days.",
        "- policyConstraints: sentences that prohibit or restrict, near-verbatim. Do not restate field requirements here.",
        "- successDefinition: the text's own definition of success when present; otherwise a faithful restatement of what a completed instance must satisfy.",
        "- objectHints / entryHints: lowercase singular nouns only when the text names them.",
        "- Do not add anything the text does not state. confidence reflects how completely the text specifies the program.",
      ].join("\n");

    case "mapFields": {
      const reqs = req.parsed.requirements.map((r) => ({ id: r.id, text: r.text, kind: r.kind, judgment: r.judgment, expectation: r.expectation }));
      const states = req.states.map((s) => ({ id: s.id, label: s.label, route: s.route, fields: s.fields.map((f) => ({ key: f.key, name: f.name, role: f.role, options: f.options, region: f.region, required: f.required })) }));
      return [
        "Task: mapFields. Decide which discovered form field satisfies each requirement, and how much automation each form state permits.",
        "",
        block("Program", json({ title: req.parsed.title, targetBehavior: req.parsed.targetBehavior, objectHints: req.parsed.objectHints, entryHints: req.parsed.entryHints, policyConstraints: req.parsed.policyConstraints })),
        "",
        block("Requirements", json(reqs)),
        "",
        block("Discovered states and their fields", json(states)),
        "",
        "Instructions:",
        "- mappings: for each requirement of kind 'field', choose at most one field. Copy fieldKey and stateId exactly from the input; a mapping with a key or id that does not appear above is invalid. Skip requirements that no field can hold, and requirements of other kinds.",
        "- Prefer a field whose name, options, or region match the requirement's expectation. When the requirement lists acceptedValues, a field whose options contain those values is strong evidence. When a requirement implies a date, prefer a date field.",
        "- confidence: 0.9 or more only when name and options both match; 0.5 to 0.8 for a plausible name match; below 0.5 when guessing. rationale: one sentence naming the matching evidence.",
        "- stepModes: one entry per state listed above. 'guide' when the state holds a field mapped from a judgment requirement (the person must decide); 'assist' when values can be derived from the entry record or defaults but the person should review; 'act' when the state has no judgment content at all. Use the state ids verbatim.",
      ].join("\n");
    }

    case "diagnose": {
      const reqs = req.requirements.filter((r) => req.step.requirementIds.includes(r.id)).map((r) => ({ id: r.id, text: r.text, kind: r.kind, judgment: r.judgment }));
      return [
        "Task: diagnose. Given struggle signals observed while a person was on one workflow step, name the most plausible barrier from the taxonomy below, with alternatives.",
        "",
        block("Barrier taxonomy", BARRIER_GLOSSARY),
        "",
        block("Step", json({ id: req.step.id, title: req.step.title, needsJudgment: req.step.judgment, commitsData: req.step.commit, fieldsHiddenBehind: req.step.reveals ?? [] })),
        "",
        block("Requirements on this step", json(reqs)),
        "",
        block("Observed signals", json(req.signals)),
        "",
        "Instructions:",
        "- stepId must equal the step id above.",
        "- barrier: the single most plausible barrier given only these signals. Validation errors point to capability_skill; hesitation on a step with hidden fields points to opportunity_visibility; hesitation on a judgment step points to motivation_uncertainty; backtracking points to capability_knowledge; abandonment at a commit step points to motivation_uncertainty, abandonment mid-step to opportunity_friction. Use these as priors, not as rules that override the signals.",
        "- evidence: one string per signal you relied on, restating it. Do not describe anything not listed under Observed signals.",
        "- alternatives: up to two other barriers with their own confidence, most plausible first. Confidences need not sum to 1.",
        "- With few or weak signals, keep confidence low (0.3 to 0.5).",
      ].join("\n");
    }

    case "composeAssistance": {
      const reqs = req.requirements.filter((r) => req.step.requirementIds.includes(r.id)).map((r) => ({ id: r.id, text: r.text, judgment: r.judgment, expectation: r.expectation }));
      return [
        `Task: composeAssistance. Write the content of one piece of in-application assistance using the technique "${req.technique.name}".`,
        "",
        block("Step", json({ id: req.step.id, title: req.step.title, needsJudgment: req.step.judgment, commitsData: req.step.commit, fieldNames: req.step.fieldNames, fieldsHiddenBehind: req.step.reveals ?? [] })),
        "",
        block("Requirements on this step", json(reqs)),
        "",
        block("Policy constraints from the objective", json(req.policyConstraints)),
        "",
        block("Current hypothesis about the barrier", json({ barrier: req.hypothesis.barrier, confidence: req.hypothesis.confidence, evidence: req.hypothesis.evidence })),
        "",
        block("Technique", json({ name: req.technique.name, mode: req.technique.mode, mechanism: req.technique.mechanism, description: req.technique.description, example: req.technique.example, cautions: req.technique.cautions })),
        "",
        "Instructions:",
        "- title: under 60 characters, names what to do or what to know. body: at most two sentences. Both in the technique's spirit and respecting its cautions.",
        "- Quote the requirement or policy wording when explaining why; never introduce a rule that is not listed above. When the technique is a worked example, give a concrete valid example only for formats implied by the field name (dates as YYYY-MM-DD).",
        "- anchorElementName: exactly one of fieldNames or fieldsHiddenBehind, verbatim, when the assistance points at a control. Omit it otherwise.",
        `- offerAssist: ${req.step.judgment ? "false, because this step needs human judgment." : "true only when the technique's mode is assist or act."}`,
        "- source: 'Objective requirement N' or 'Policy constraint N' when the body draws on one; omit otherwise.",
        "- Do not describe what the person is feeling, do not say what the system has observed beyond the hypothesis evidence, and do not promise outcomes.",
      ].join("\n");
    }
  }
}

/** Appended to the user prompt when the first response failed Zod validation. */
export function correctiveInstruction(issues: string[]): string {
  return [
    "",
    "Your previous response did not match the schema. Problems:",
    ...issues.slice(0, 12).map((i) => `- ${i}`),
    "Return only the corrected JSON object, matching the schema exactly. Do not include any text outside the JSON.",
  ].join("\n");
}

/** Compact "path: message" list from a Zod error, safe to return to a client. */
export function summarizeIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.map(String).join(".") : "(root)"}: ${i.message}`);
}
