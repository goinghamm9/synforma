import type { DiscoveredState } from "../engine/explorer";
import type { ParsedObjective, Workflow } from "../types";
import { HeuristicPlanner } from "./heuristic";
import { AssistanceSchema, DiagnosisSchema, FieldMappingSchema, ParsedObjectiveSchema, type PlannerRequest } from "./protocol";
import type { AssistanceContent, ComposeAssistanceInput, DiagnoseInput, DiagnoseOutput, InferWorkflowInput, ParseObjectiveInput, Planner } from "./types";

/**
 * GeminiPlanner — browser-side client for the server-side LLM planner.
 *
 * The LLM runs only on the server (app/api/planner). It receives structured
 * inputs and must return JSON that validates against the protocol schemas.
 * Structural work (paths, actions, anchors, graph edges) stays in the
 * heuristic planner: the LLM improves understanding, it does not replace the
 * deterministic machinery. Any failure falls back to the heuristic result and
 * is reported so the UI can label it.
 */

export class GeminiPlanner implements Planner {
  readonly kind = "gemini" as const;
  private readonly heuristic = new HeuristicPlanner();
  lastError: string | null = null;

  constructor(private readonly endpoint = "/api/planner") {}

  private async call<T>(req: PlannerRequest, parse: (raw: unknown) => T): Promise<T | null> {
    try {
      const res = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) {
        this.lastError = `Planner API ${res.status}`;
        return null;
      }
      const json = await res.json();
      const parsed = parse(json.result ?? json);
      this.lastError = null;
      return parsed;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async parseObjective(input: ParseObjectiveInput): Promise<ParsedObjective> {
    const llm = await this.call({ task: "parseObjective", ...input }, (raw) => ParsedObjectiveSchema.parse(raw));
    const base = await this.heuristic.parseObjective(input);
    if (!llm) return base;
    // Keep heuristic expectations when the LLM omitted them; keywords always recomputed.
    return {
      ...llm,
      requirements: llm.requirements.map((r, i) => ({
        ...r,
        keywords: r.keywords.length ? r.keywords : (base.requirements[i]?.keywords ?? []),
        expectation: r.expectation ?? base.requirements[i]?.expectation,
      })),
    };
  }

  async inferWorkflow(input: InferWorkflowInput): Promise<Workflow> {
    // Ask the LLM for requirement→field mappings and per-state modes, then let the
    // heuristic planner build the executable workflow with those hints applied.
    const states = input.states
      .filter((s) => s.page.fields.length)
      .map((s) => ({
        id: s.id,
        label: s.label,
        route: s.route,
        fields: s.page.fields.map((f) => ({ key: f.key, name: f.name, role: f.role, options: f.options, region: f.region, required: f.required })),
      }));
    const llm = await this.call({ task: "mapFields", parsed: input.parsed, states }, (raw) => FieldMappingSchema.parse(raw));
    if (!llm) return this.heuristic.inferWorkflow(input);
    // Apply the LLM mapping by boosting requirement keywords with the chosen field names.
    const boosted: ParsedObjective = {
      ...input.parsed,
      requirements: input.parsed.requirements.map((r) => {
        const m = llm.mappings.find((x) => x.requirementId === r.id && x.confidence >= 0.5);
        if (!m) return r;
        const st = input.states.find((s) => s.id === m.stateId) as DiscoveredState | undefined;
        const field = st?.page.fields.find((f) => f.key === m.fieldKey);
        if (!field) return r;
        return { ...r, expectation: { ...(r.expectation ?? { fieldHint: r.text }), fieldHint: field.name } };
      }),
    };
    const wf = await this.heuristic.inferWorkflow({ ...input, parsed: boosted });
    for (const sm of llm.stepModes) {
      const st = input.states.find((s) => s.id === sm.stateId);
      const step = st ? wf.steps.find((x) => x.screenId === st.screenNodeId && !x.commit) : undefined;
      if (step && !(step.judgment && sm.mode === "act")) {
        step.mode = sm.mode;
        step.modeRationale = `${sm.rationale} (Gemini)`;
      }
    }
    return wf;
  }

  async diagnose(input: DiagnoseInput): Promise<DiagnoseOutput> {
    const llm = await this.call(
      {
        task: "diagnose",
        step: { id: input.step.id, title: input.step.title, judgment: input.step.judgment, commit: input.step.commit, reveals: input.step.reveals, requirementIds: input.step.requirementIds },
        signals: input.signals.map((s) => ({ type: s.type, magnitude: s.magnitude, detail: s.detail })),
        requirements: input.requirements,
      },
      (raw) => DiagnosisSchema.parse(raw),
    );
    return llm ?? this.heuristic.diagnose(input);
  }

  async composeAssistance(input: ComposeAssistanceInput): Promise<AssistanceContent> {
    const base = await this.heuristic.composeAssistance(input);
    const llm = await this.call(
      {
        task: "composeAssistance",
        step: {
          id: input.step.id,
          title: input.step.title,
          judgment: input.step.judgment,
          commit: input.step.commit,
          reveals: input.step.reveals,
          requirementIds: input.step.requirementIds,
          fieldNames: input.step.actions.map((a) => a.targetName ?? "").filter(Boolean),
        },
        requirements: input.requirements,
        hypothesis: input.hypothesis,
        technique: { id: input.technique.id, name: input.technique.name, mechanism: input.technique.mechanism, description: input.technique.description, example: input.technique.example, mode: input.technique.mode, cautions: input.technique.cautions },
        policyConstraints: input.policyConstraints,
      },
      (raw) => AssistanceSchema.parse(raw),
    );
    if (!llm) return base;
    return {
      title: llm.title,
      body: llm.body,
      anchor: llm.anchorElementName ? { ...base.anchor, elementName: llm.anchorElementName } : base.anchor,
      offerAssist: input.step.judgment ? false : llm.offerAssist,
      source: llm.source ?? base.source,
    };
  }
}
