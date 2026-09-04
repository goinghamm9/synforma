import type { DiscoveredState } from "./explorer";
import { similarity } from "../interaction/text";
import { requirementFieldScore } from "../planner/heuristic";
import { nodeId } from "../graph/work-graph";
import type { Claim, Program, RunEvent, TrustState, WorkGraph } from "../types";
import { shortId } from "@/lib/utils";

/**
 * Evidence / Truth engine.
 *
 * Synforma does not store "facts". It stores claims with a source, an
 * authority level, freshness, confidence and scope, and it represents
 * disagreement explicitly. Belief is resolved by an authority hierarchy;
 * unresolved conflicts are surfaced (and stop autonomous action) instead of
 * being guessed away.
 */

export const AUTHORITY_ORDER: TrustState[] = [
  "AUTHORITATIVE_LIVE",
  "AUTHORITATIVE_METADATA",
  "ORGANIZATION_APPROVED",
  "VENDOR_DOCUMENTED",
  "OBSERVED_HIGH_CONFIDENCE",
  "OBSERVED_LOW_CONFIDENCE",
  "MODEL_INFERRED",
  "UNKNOWN",
];

export const TRUST_LABEL: Record<TrustState, string> = {
  AUTHORITATIVE_LIVE: "Observed on the live instance",
  AUTHORITATIVE_METADATA: "Configuration metadata",
  ORGANIZATION_APPROVED: "Organization-approved",
  VENDOR_DOCUMENTED: "Vendor documentation",
  OBSERVED_HIGH_CONFIDENCE: "Observed (high confidence)",
  OBSERVED_LOW_CONFIDENCE: "Observed (low confidence)",
  MODEL_INFERRED: "Model-inferred",
  UNKNOWN: "Unknown",
};

export function authorityRank(t: TrustState): number {
  return AUTHORITY_ORDER.indexOf(t);
}

function mk(programId: string, partial: Omit<Claim, "id" | "programId" | "contradicts" | "status"> & { contradicts?: string[]; status?: Claim["status"] }): Claim {
  return { id: shortId("clm"), programId, contradicts: [], status: "asserted", ...partial };
}

/**
 * Derive the claim set for a program from the objective (organization-approved),
 * the observed interface (live) and the planner's mappings (inferred), then
 * detect contradictions between them.
 */
export function claimsFromProgram(program: Program, graph: WorkGraph, states: DiscoveredState[]): Claim[] {
  const claims: Claim[] = [];
  const parsed = program.parsed;
  const workflow = program.workflow;
  const now = Date.now();
  const scope = parsed?.population ?? "all users";

  // 1. Objective claims: requirements and policy constraints.
  for (const r of parsed?.requirements ?? []) {
    claims.push(
      mk(program.id, {
        subject: `requirement:${r.id}`,
        predicate: "requires",
        object: r.text,
        statement: `A qualified record requires: ${r.text}`,
        source: "objective",
        sourceRef: "objective",
        authority: "ORGANIZATION_APPROVED",
        confidence: 1,
        scope,
        observedAt: program.createdAt,
      }),
    );
    if (r.expectation?.acceptedValues?.length) {
      claims.push(
        mk(program.id, {
          subject: `requirement:${r.id}`,
          predicate: "accepts",
          object: r.expectation.acceptedValues.join(" | "),
          statement: `Requirement ${r.id.replace("r", "")} counts as met only with: ${r.expectation.acceptedValues.join(", ")}`,
          source: "objective",
          sourceRef: "objective",
          authority: "ORGANIZATION_APPROVED",
          confidence: 1,
          scope,
          observedAt: program.createdAt,
        }),
      );
    }
  }
  for (const pc of parsed?.policyConstraints ?? []) {
    claims.push(
      mk(program.id, {
        subject: "policy",
        predicate: "constrains",
        object: pc,
        statement: pc,
        source: "objective",
        sourceRef: "objective",
        authority: "ORGANIZATION_APPROVED",
        confidence: 1,
        scope,
        observedAt: program.createdAt,
      }),
    );
  }

  // 2. Observed interface claims: fields with their options on each screen (one claim per field).
  for (const st of states) {
    for (const f of st.page.fields) {
      const fid = nodeId("field", st.route, f.key);
      claims.push(
        mk(program.id, {
          subject: fid,
          predicate: "exists_on",
          object: st.label,
          statement: `"${f.name}" (${f.role}${f.options?.length ? `: ${f.options.join(" / ")}` : ""}) exists on ${st.label}${f.required ? ", required" : ""}`,
          source: "observed_interface",
          sourceRef: `screen:${st.route}`,
          authority: "AUTHORITATIVE_LIVE",
          confidence: 0.95,
          scope: "UI as observed during discovery",
          observedAt: st.page.capturedAt || now,
        }),
      );
    }
    for (const a of st.page.actions.filter((x) => x.commit)) {
      claims.push(
        mk(program.id, {
          subject: nodeId("action", st.route, a.key),
          predicate: "commits",
          object: a.name,
          statement: `"${a.name}" on ${st.label} commits data (never executed during discovery)`,
          source: "observed_interface",
          sourceRef: `screen:${st.route}`,
          authority: "AUTHORITATIVE_LIVE",
          confidence: 0.85,
          observedAt: st.page.capturedAt || now,
        }),
      );
    }
  }

  // 3. Inferred claims: requirement → field mappings from the workflow.
  if (workflow && parsed) {
    for (const step of workflow.steps) {
      for (const action of step.actions) {
        const m = /^\{\{req:(\w+)(?::date)?\}\}$/.exec(action.value ?? "");
        if (!m) continue;
        const r = parsed.requirements.find((x) => x.id === m[1]);
        if (!r) continue;
        const st = states.find((s) => s.screenNodeId === step.screenId);
        const field = st?.page.fields.find((f) => f.key === action.target || f.name === action.targetName);
        const score = field ? requirementFieldScore(r, field) : 0.4;
        claims.push(
          mk(program.id, {
            subject: st ? nodeId("field", st.route, field?.key ?? action.target ?? "") : `field:${action.targetName}`,
            predicate: "fulfills",
            object: `requirement:${r.id}`,
            statement: `"${action.targetName}" fulfills requirement ${r.id.replace("r", "")} (${r.text})`,
            source: "planner_inference",
            sourceRef: `planner:${program.planner}`,
            authority: "MODEL_INFERRED",
            confidence: Math.min(0.95, score),
            scope: workflow.version ? `workflow v${workflow.version}` : undefined,
            observedAt: program.updatedAt,
          }),
        );
      }
    }
    // Requirements with no mapping: an explicit contested claim, not silence.
    for (const r of parsed.requirements.filter((x) => x.kind === "field")) {
      const mapped = workflow.steps.some((s) => s.actions.some((a) => (a.value ?? "").startsWith(`{{req:${r.id}`)));
      if (!mapped) {
        claims.push(
          mk(program.id, {
            subject: `requirement:${r.id}`,
            predicate: "unmapped",
            object: "no field",
            statement: `No field on the observed interface appears to satisfy requirement ${r.id.replace("r", "")}`,
            source: "planner_inference",
            sourceRef: `planner:${program.planner}`,
            authority: "MODEL_INFERRED",
            confidence: 0.6,
            observedAt: program.updatedAt,
            status: "contested",
            reason: "The objective requires something the interface does not expose, or the mapping failed. Insufficient evidence to act.",
          }),
        );
      }
    }
  }

  return detectContradictions(claims, states);
}

/**
 * Contradictions handled today:
 *  - a requirement's accepted values are not offered by the mapped field's options
 *  - two claims name the same control differently (superseded after a UI change)
 */
export function detectContradictions(claims: Claim[], states: DiscoveredState[]): Claim[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  for (const map of claims.filter((c) => c.predicate === "fulfills")) {
    const reqId = map.object.replace("requirement:", "");
    const accepts = claims.find((c) => c.subject === `requirement:${reqId}` && c.predicate === "accepts");
    if (!accepts) continue;
    const fieldClaim = claims.find((c) => c.subject === map.subject && c.predicate === "exists_on");
    if (!fieldClaim) continue;
    const options = fieldClaim.statement.split(":")[1]?.split(")")[0]?.split("/").map((o) => o.trim().toLowerCase()) ?? [];
    const accepted = accepts.object.split("|").map((v) => v.trim().toLowerCase());
    // Only meaningful for option fields.
    const field = states.flatMap((s) => s.page.fields).find((f) => fieldClaim.statement.startsWith(`"${f.name}"`) && f.options?.length);
    if (!field) continue;
    const offered = (field.options ?? []).map((o) => o.toLowerCase());
    const overlap = accepted.some((v) => offered.some((o) => o === v || similarity(o, v) > 0.85));
    if (!overlap && options.length + offered.length > 0) {
      accepts.contradicts.push(fieldClaim.id);
      fieldClaim.contradicts.push(accepts.id);
      accepts.status = "contested";
      fieldClaim.status = "contested";
      map.status = "contested";
      const reason = `The objective accepts [${accepts.object}] but the interface offers [${(field.options ?? []).join(", ")}]. Sources conflict; Synforma will not guess.`;
      accepts.reason = reason;
      map.reason = reason;
    }
  }
  return Array.from(byId.values());
}

/** A re-grounding during execution supersedes the old naming claim with a live observation. */
export function claimsFromRegrounding(programId: string, event: RunEvent, existing: Claim[]): Claim[] {
  const from = String(event.data?.from ?? "");
  const to = String(event.data?.to ?? "");
  if (!from || !to) return [];
  const old = existing.find((c) => c.predicate === "exists_on" && c.statement.startsWith(`"${from}"`) && c.status !== "retired");
  const claim = mk(programId, {
    subject: old?.subject ?? `control:${from}`,
    predicate: "is_now_named",
    object: to,
    statement: `"${from}" is now "${to.replace(/^[a-z]+:/, "").replace(/-/g, " ")}" on the live interface`,
    source: "observed_interface",
    sourceRef: `run:${event.runId}`,
    authority: "AUTHORITATIVE_LIVE",
    confidence: 0.9,
    scope: "UI as observed during execution",
    observedAt: event.t,
    supersedes: old?.id,
    reason: "Vendor interface change detected during execution; the workflow was re-verified by completing.",
  });
  if (old) {
    old.status = "retired";
    old.supersededBy = claim.id;
    old.reason = "Superseded by a live observation after a UI change.";
  }
  return [claim];
}

/** Resolve what to believe about a subject/predicate: highest authority, then freshest, unless contested. */
export function resolveBelief(claims: Claim[], subject: string, predicate?: string): { belief: Claim | null; conflicting: boolean; reason: string } {
  const pool = claims.filter((c) => c.subject === subject && (!predicate || c.predicate === predicate) && c.status !== "retired");
  if (!pool.length) return { belief: null, conflicting: false, reason: "no evidence" };
  const contested = pool.filter((c) => c.status === "contested");
  if (contested.length) return { belief: null, conflicting: true, reason: contested[0].reason ?? "sources conflict" };
  const sorted = [...pool].sort((a, b) => authorityRank(a.authority) - authorityRank(b.authority) || b.observedAt - a.observedAt);
  return { belief: sorted[0], conflicting: false, reason: `${TRUST_LABEL[sorted[0].authority]}, ${new Date(sorted[0].observedAt).toISOString().slice(0, 10)}` };
}

export interface TruthReport {
  total: number;
  byAuthority: { authority: TrustState; count: number }[];
  contested: Claim[];
  retired: number;
  validated: number;
}

export function truthReport(claims: Claim[]): TruthReport {
  const counts = new Map<TrustState, number>();
  for (const c of claims) if (c.status !== "retired") counts.set(c.authority, (counts.get(c.authority) ?? 0) + 1);
  return {
    total: claims.length,
    byAuthority: AUTHORITY_ORDER.filter((a) => counts.has(a)).map((authority) => ({ authority, count: counts.get(authority)! })),
    contested: claims.filter((c) => c.status === "contested"),
    retired: claims.filter((c) => c.status === "retired").length,
    validated: claims.filter((c) => c.status === "validated").length,
  };
}

/** A person confirms or rejects a claim. Rejected claims are retired with the reason; confirmed ones become validated. */
export function validateClaim(claim: Claim, by: string, ok: boolean, note?: string): Claim {
  return ok
    ? { ...claim, status: "validated", validatedBy: by, validatedAt: Date.now(), reason: note ?? claim.reason }
    : { ...claim, status: "retired", validatedBy: by, validatedAt: Date.now(), reason: note ?? "Rejected by a person" };
}
