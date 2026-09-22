import type { DiscoveredState } from "../engine/explorer";
import { keywordsOf } from "../interaction/grounding";
import type { ParsedObjective, PlannerKind, Requirement, Workflow } from "../types";
import { HeuristicPlanner, requirementFieldScore } from "./heuristic";
import { AssistanceSchema, DiagnosisSchema, FieldMappingSchema, ParsedObjectiveSchema, type PlannerRequest } from "./protocol";
import type { AssistanceContent, ComposeAssistanceInput, DiagnoseInput, DiagnoseOutput, InferWorkflowInput, ParseObjectiveInput, Planner } from "./types";

/**
 * RemotePlanner — browser-side client for the server-side LLM planner (Claude or Gemini).
 *
 * The LLM runs only on the server (app/api/planner). It receives structured
 * inputs and must return JSON that validates against the protocol schemas.
 * Structural work (paths, actions, anchors, graph edges) stays in the
 * heuristic planner: the LLM improves understanding, it does not replace the
 * deterministic machinery. Two rules keep a live demo fast and predictable:
 *
 *  - Every call has a deadline (REMOTE_DEADLINE_MS). Serverless hosts cut a
 *    function at about ten seconds; a call that has not answered by then is
 *    abandoned and the heuristic result is used, with the reason recorded in
 *    `lastError` so the UI can label the fallback.
 *  - The model's answer is additive. The heuristic's requirement list is the
 *    executable contract (ids, wording, expectations); the model contributes
 *    titles, population, constraints, judgment flags and fills mapping gaps,
 *    but never overrides a mapping the heuristic is confident about.
 */

/** Longest wait for one planner call. The route's own deadline is shorter, so a slow host answers 504 before this fires. */
export const REMOTE_DEADLINE_MS = 10_000;

/** A heuristic mapping at or above this score is kept even when the model prefers another field. */
const CONFIDENT_HEURISTIC = 0.5;

type Mapping = { requirementId: string; fieldKey: string; stateId: string; confidence: number };

/** Merge the model's reading of an objective over the heuristic's without changing the executable requirement list. */
export function mergeParsed(base: ParsedObjective, llm: ParsedObjective): ParsedObjective {
  let requirements: Requirement[];
  if (!base.requirements.length && llm.requirements.length) {
    // The heuristic found no list: the model's requirements are all there is. Keywords are always recomputed.
    requirements = llm.requirements.map((r) => ({ ...r, keywords: keywordsOf(r.text) }));
  } else if (llm.requirements.length === base.requirements.length) {
    // Same list: the model may add caution (judgment), never remove it; wording and expectations stay the heuristic's.
    requirements = base.requirements.map((r, i) => ({ ...r, judgment: r.judgment || llm.requirements[i].judgment }));
  } else {
    requirements = base.requirements;
  }
  return {
    ...base,
    title: llm.title || base.title,
    population: llm.population || base.population,
    targetBehavior: llm.targetBehavior || base.targetBehavior,
    policyConstraints: llm.policyConstraints.length ? llm.policyConstraints : base.policyConstraints,
    successDefinition: llm.successDefinition || base.successDefinition,
    objectHints: base.objectHints.length ? base.objectHints : llm.objectHints,
    entryHints: base.entryHints.length ? base.entryHints : llm.entryHints,
    confidence: Math.max(base.confidence, llm.confidence),
    requirements,
  };
}

/**
 * Apply the model's requirement→field mappings as field hints. A mapping is used only when it names a real field,
 * the model is at least moderately confident, and the heuristic has no confident choice of its own for that requirement.
 */
export function applyMappings(parsed: ParsedObjective, mappings: Mapping[], states: DiscoveredState[]): ParsedObjective {
  const formStates = states.filter((s) => s.page.fields.length);
  return {
    ...parsed,
    requirements: parsed.requirements.map((r) => {
      if (r.kind !== "field") return r;
      const m = mappings.find((x) => x.requirementId === r.id && x.confidence >= 0.5);
      if (!m) return r;
      const field = states.find((s) => s.id === m.stateId)?.page.fields.find((f) => f.key === m.fieldKey);
      if (!field) return r;
      let bestScore = 0;
      let bestKey: string | undefined;
      for (const s of formStates) {
        for (const f of s.page.fields) {
          const score = requirementFieldScore(r, f);
          if (score > bestScore) {
            bestScore = score;
            bestKey = f.key;
          }
        }
      }
      if (bestScore >= CONFIDENT_HEURISTIC && bestKey !== field.key) return r;
      return { ...r, expectation: { ...(r.expectation ?? { fieldHint: r.text }), fieldHint: field.name } };
    }),
  };
}

export class RemotePlanner implements Planner {
  private readonly heuristic = new HeuristicPlanner();
  lastError: string | null = null;

  constructor(
    /** The vendor the server reported as configured; only used for labels and provenance. */
    readonly kind: Exclude<PlannerKind, "heuristic">,
    private readonly endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/planner`,
    private readonly deadlineMs = REMOTE_DEADLINE_MS,
  ) {}

  private async call<T>(req: PlannerRequest, parse: (raw: unknown) => T): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deadlineMs);
    try {
      const res = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal: controller.signal });
      if (!res.ok) {
        this.lastError = `Planner API ${res.status}`;
        return null;
      }
      const json = await res.json();
      const parsed = parse(json.result ?? json);
      this.lastError = null;
      return parsed;
    } catch (e) {
      const seconds = this.deadlineMs < 1000 ? (this.deadlineMs / 1000).toFixed(1) : String(Math.round(this.deadlineMs / 1000));
      this.lastError = controller.signal.aborted ? `no answer within ${seconds} s` : e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async parseObjective(input: ParseObjectiveInput): Promise<ParsedObjective> {
    const [base, llm] = await Promise.all([this.heuristic.parseObjective(input), this.call({ task: "parseObjective", ...input }, (raw) => ParsedObjectiveSchema.parse(raw))]);
    return llm ? mergeParsed(base, llm) : base;
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
    const wf = await this.heuristic.inferWorkflow({ ...input, parsed: applyMappings(input.parsed, llm.mappings, input.states) });
    for (const sm of llm.stepModes) {
      const st = input.states.find((s) => s.id === sm.stateId);
      const step = st ? wf.steps.find((x) => x.screenId === st.screenNodeId && !x.commit) : undefined;
      if (step && !(step.judgment && sm.mode === "act")) {
        step.mode = sm.mode;
        step.modeRationale = `${sm.rationale} (language model)`;
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
