import type { DiscoveredState } from "../engine/explorer";
import { requirementFieldScore } from "../planner/heuristic";
import { annotateNode, nodeId } from "../graph/work-graph";
import type { ParsedObjective, SemanticElement, WorkGraph } from "../types";
import { ACCEPT_PROBABILITY, JUDGMENT_PROBABILITY, type Decider } from "./types";

/**
 * Planning decisions: calibrated confidence for what the heuristic planner
 * is about to do. Two questions, asked only where the rules are weak:
 *
 *  - Mapping. A field requirement whose best lexical score across the
 *    discovered fields is below CONFIDENT_MAPPING is put to the model as a
 *    choice among the most similar fields plus "none". A choice at or above
 *    ACCEPT_PROBABILITY sets the requirement's field hint (the planner then
 *    maps it as it would a confident lexical match); the probability is kept
 *    on the requirement and becomes the weight of the fulfils edge.
 *  - Judgment. Every field requirement is put to the model as a yes / no
 *    question; a probability at or above JUDGMENT_PROBABILITY adds the
 *    judgment flag. The flag is only ever added, never removed: the model can
 *    make Synforma more careful, not less.
 *
 * A requirement the rules map confidently is never put to the model, and a
 * model that cannot be reached changes nothing.
 */

/** A lexical mapping at or above this score is kept; below it the model is asked. Same bar as the remote planner. */
export const CONFIDENT_MAPPING = 0.5;
const MAX_MAPPING_CANDIDATES = 12;

export interface PlanDecisions {
  /** Questions put to the model (one per weak mapping, one per requirement for judgment). */
  asked: number;
  mappings: { requirementId: string; fieldKey: string | null; fieldName: string | null; stateId: string | null; probability: number; accepted: boolean }[];
  judgment: { requirementId: string; probability: number; applied: boolean }[];
  /** Why the model gave no answer, when it did not. */
  unavailable: string | null;
}

export const NO_PLAN_DECISIONS: PlanDecisions = { asked: 0, mappings: [], judgment: [], unavailable: null };

export async function decidePlan(
  decider: Decider | null | undefined,
  parsed: ParsedObjective,
  states: DiscoveredState[],
  opts: { objective?: string; appName?: string } = {},
): Promise<{ parsed: ParsedObjective; decisions: PlanDecisions }> {
  if (!decider) return { parsed, decisions: NO_PLAN_DECISIONS };
  const decisions: PlanDecisions = { asked: 0, mappings: [], judgment: [], unavailable: null };
  const formStates = states.filter((s) => s.page.fields.length && !s.page.dialogs.length);
  const requirements = parsed.requirements.map((r) => ({ ...r }));

  for (const r of requirements) {
    if (r.kind !== "field") continue;
    const scored: { field: SemanticElement; state: DiscoveredState; score: number }[] = [];
    for (const s of formStates) for (const f of s.page.fields) scored.push({ field: f, state: s, score: requirementFieldScore(r, f) });
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score >= CONFIDENT_MAPPING) continue;
    const candidates = scored.slice(0, MAX_MAPPING_CANDIDATES);
    decisions.asked += 1;
    const choice = await decider.chooseMapping({ requirement: r, objective: opts.objective, appName: opts.appName, candidates: candidates.map((c) => ({ field: c.field, screen: c.state.label, score: c.score })) });
    if (!choice) {
      decisions.unavailable = decider.lastError ?? "no answer";
      continue;
    }
    const hit = choice.key ? candidates.find((c) => c.field.key === choice.key) : undefined;
    const accepted = Boolean(hit && choice.probability >= ACCEPT_PROBABILITY);
    decisions.mappings.push({ requirementId: r.id, fieldKey: hit?.field.key ?? null, fieldName: hit?.field.name ?? null, stateId: hit?.state.id ?? null, probability: choice.probability, accepted });
    if (accepted && hit) {
      r.expectation = { ...(r.expectation ?? { fieldHint: r.text }), fieldHint: hit.field.name };
      r.decided = { ...(r.decided ?? {}), by: decider.name, fieldKey: hit.field.key, fieldName: hit.field.name, probability: choice.probability };
    }
  }

  const fieldReqs = requirements.filter((r) => r.kind === "field");
  if (fieldReqs.length) {
    decisions.asked += fieldReqs.length;
    const assessed = await decider.assessJudgment({ requirements: fieldReqs, objective: opts.objective, appName: opts.appName });
    if (!assessed) decisions.unavailable = decider.lastError ?? "no answer";
    else {
      for (const a of assessed) {
        const r = requirements.find((x) => x.id === a.id);
        if (!r) continue;
        const applied = !r.judgment && a.judgment >= JUDGMENT_PROBABILITY;
        if (applied) r.judgment = true;
        r.decided = { ...(r.decided ?? {}), by: decider.name, judgmentProbability: a.judgment, judgmentApplied: applied };
        decisions.judgment.push({ requirementId: r.id, probability: a.judgment, applied });
      }
    }
  }
  return { parsed: { ...parsed, requirements }, decisions };
}

/**
 * After the workflow is inferred: the fulfils edges of decided mappings carry the model's probability and the
 * requirement nodes say who decided what, so the Work Graph and the Understand panel show it.
 */
export function annotatePlanDecisions(graph: WorkGraph, decisions: PlanDecisions, by = "Jev"): void {
  for (const m of decisions.mappings.filter((x) => x.accepted)) {
    const reqNode = nodeId("requirement", m.requirementId);
    for (const e of graph.edges) {
      if (e.type === "fulfills" && e.to === reqNode) {
        e.weight = m.probability;
        e.label = `p ${m.probability.toFixed(2)} · ${by}`;
      }
    }
    annotateNode(graph, reqNode, { data: { decidedBy: by, probability: m.probability, fieldName: m.fieldName } });
  }
  for (const j of decisions.judgment) annotateNode(graph, nodeId("requirement", j.requirementId), { data: { decidedBy: by, judgmentProbability: j.probability, judgmentApplied: j.applied } });
}

/** One line for logs and audits ("Jev placed 1 requirement (p 0.91) and flagged 0 for judgment; 6 questions"). */
export function summarizePlanDecisions(d: PlanDecisions, by = "Jev"): string {
  if (!d.asked) return `${by} was not needed: the rules mapped every requirement confidently`;
  const placed = d.mappings.filter((m) => m.accepted);
  const flagged = d.judgment.filter((j) => j.applied);
  const parts = [
    placed.length ? `${by} placed ${placed.length} requirement${placed.length === 1 ? "" : "s"} (${placed.map((m) => `${m.requirementId} → "${m.fieldName}" p ${m.probability.toFixed(2)}`).join(", ")})` : `${by} placed no requirement`,
    flagged.length ? `flagged ${flagged.length} for judgment (${flagged.map((j) => `${j.requirementId} p ${j.probability.toFixed(2)}`).join(", ")})` : "flagged none for judgment",
    `${d.asked} question${d.asked === 1 ? "" : "s"}`,
  ];
  return parts.join("; ") + (d.unavailable ? ` (${by} unavailable at times: ${d.unavailable})` : "");
}
