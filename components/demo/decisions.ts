import { DO_NOTHING_ID } from "@/lib/synforma/science/techniques";
import type { Run, RunEvent } from "@/lib/synforma/types";

/**
 * Decision accounting for the adoption policy, computed from stored events only.
 *
 *  - `intervention_withheld` with the DO_NOTHING outcome: Synforma scored every candidate and chose to stay quiet.
 *    (Withholding for the control cohort is an experiment mechanic, not a policy decision, and is excluded.)
 *  - `assistance_shown`: an intervention was displayed to a person.
 *  - `note` with `data.decision === "intervene"`: the policy selected an intervention during a synthetic run.
 *    Nothing is displayed to a synthetic user, so this is recorded as a proposal, never as "shown".
 */
export interface DecisionSummary {
  /** DO_NOTHING decisions across all runs. */
  doNothing: number;
  /** Interventions actually shown to people. */
  shown: number;
  /** Interventions selected in simulation (synthetic runs). */
  proposed: number;
  /** All policy decisions: doNothing + shown + proposed. */
  total: number;
  /** Finished human runs. */
  humanRuns: number;
  /** Finished synthetic runs. */
  syntheticRuns: number;
  doNothingHuman: number;
  shownHuman: number;
}

/** True for an `intervention_withheld` event that records a DO_NOTHING policy decision (not a control-cohort hold). */
export function isDoNothingDecision(e: RunEvent): boolean {
  if (e.type !== "intervention_withheld") return false;
  const d = e.data ?? {};
  if (d.selected === DO_NOTHING_ID) return true;
  if (d.cohort === "control") return false;
  const reason = typeof d.reason === "string" ? d.reason : "";
  if (/control cohort/i.test(reason)) return false;
  return true;
}

export function isSimulatedIntervene(e: RunEvent): boolean {
  return e.type === "note" && e.data?.decision === "intervene";
}

export function summarizeDecisions(events: RunEvent[], runs: Run[]): DecisionSummary {
  const actorOf = new Map(runs.map((r) => [r.id, r.actor] as const));
  let doNothing = 0;
  let shown = 0;
  let proposed = 0;
  let doNothingHuman = 0;
  let shownHuman = 0;
  for (const e of events) {
    const actor = actorOf.get(e.runId);
    if (isDoNothingDecision(e)) {
      doNothing += 1;
      if (actor === "human") doNothingHuman += 1;
    } else if (e.type === "assistance_shown") {
      shown += 1;
      if (actor === "human") shownHuman += 1;
    } else if (isSimulatedIntervene(e)) proposed += 1;
  }
  return {
    doNothing,
    shown,
    proposed,
    total: doNothing + shown + proposed,
    humanRuns: runs.filter((r) => r.actor === "human" && r.outcome).length,
    syntheticRuns: runs.filter((r) => r.actor === "synthetic" && r.outcome).length,
    doNothingHuman,
    shownHuman,
  };
}

/** Per-run decision counts (for tables). Prefers the counters stored on the run when present. */
export function runDecisionCounts(run: Run, events: RunEvent[]): { shown: number; proposed: number; doNothing: number } {
  const mine = events.filter((e) => e.runId === run.id);
  const shownEvents = mine.filter((e) => e.type === "assistance_shown").length;
  const doNothingEvents = mine.filter(isDoNothingDecision).length;
  return {
    shown: run.assistanceShown ?? shownEvents,
    proposed: mine.filter(isSimulatedIntervene).length,
    doNothing: run.withheld ?? doNothingEvents,
  };
}
