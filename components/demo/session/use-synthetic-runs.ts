"use client";
import * as React from "react";
import { toast } from "sonner";
import { useSynforma } from "@/lib/synforma/store";
import { runWorkflow } from "@/lib/synforma/engine/runner";
import { decide } from "@/lib/synforma/engine/adoption";
import { FRICTION_SHORT } from "@/lib/synforma/engine/friction";
import { PERSONAS, type Persona } from "@/lib/synforma/engine/synthetic";
import { DO_NOTHING_ID } from "@/lib/synforma/science/techniques";
import { createPlanner } from "@/lib/synforma/planner";
import type { AssistancePreference, FrictionState, RunEventType, StruggleType } from "@/lib/synforma/types";
import { shortId } from "@/lib/utils";
import { readSandboxUiVariant } from "../demo-prefs";
import type { SynthState } from "../phases/guide-panel";
import type { ConnectionApi } from "./use-connection";
import { INITIAL_SYNTH, errorMessage } from "./helpers";

export interface SyntheticRunsApi {
  state: SynthState;
  /** Run every persona through the workflow as a labeled simulation; struggle goes through the decision policy. */
  run: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

interface Options {
  connection: ConnectionApi;
  programId: string | null;
  /** Fallback work context when the program carries none. */
  context: Record<string, string>;
}

const STRUGGLE_EVENTS: Partial<Record<RunEventType, { type: StruggleType; magnitude: number }>> = {
  hesitation: { type: "hesitation", magnitude: 0.5 },
  validation_error: { type: "validation_error", magnitude: 0.7 },
  action_failed: { type: "hesitation", magnitude: 0.6 },
  backtrack: { type: "backtrack", magnitude: 0.5 },
  wrong_screen: { type: "wrong_screen", magnitude: 0.5 },
  run_abandoned: { type: "abandon", magnitude: 0.9 },
};

/** Synthetic users run under the default preference; nothing is ever displayed to them. */
const SYNTHETIC_PREFERENCE: AssistancePreference = "work_with_me";

/**
 * Friction states for synthetic runs are MAPPED from the persona's known capability limit
 * and the runner's simulated struggle event; they are not inferred from pointer or keyboard
 * windows. Every such event is marked `simulated` and carries this rule version.
 */
const SYNTHETIC_FRICTION_RULE = "synthetic-capability-map-v0";

function simulatedFriction(type: RunEventType, data: Record<string, unknown> | undefined, persona: Persona): { state: FrictionState; confidence: number; evidence: string[] } | null {
  const reason = typeof data?.reason === "string" ? data.reason : typeof data?.error === "string" ? data.error : "";
  const limits = Object.entries(persona.capabilities)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const provenance = `mapped from the simulation's capability limit${limits.length ? ` (no ${limits.join(", no ")})` : ""}, not inferred from interaction windows`;
  const who = `synthetic persona "${persona.name}"`;
  let state: FrictionState | null = null;
  let observed = "";
  switch (type) {
    case "hesitation":
    case "action_failed":
      if (/not visible|did not find|could not|no element|not found/i.test(reason) || !persona.capabilities.expand || !persona.capabilities.synonyms) {
        state = "VISUAL_SEARCH";
        observed = `${who} did not locate the control${reason ? `: ${reason}` : ""}`;
      } else {
        state = "ERROR_RECOVERY";
        observed = `${who} hit a failed action${reason ? `: ${reason}` : ""}`;
      }
      break;
    case "validation_error":
      state = "ERROR_RECOVERY";
      observed = `${who} triggered a validation message`;
      break;
    case "run_abandoned":
      state = reason === "validation" ? "ERROR_RECOVERY" : "WORKFLOW_FRICTION";
      observed = reason === "validation" ? `${who} gave up on a validation error` : `${who} abandoned the run${reason ? ` (${reason})` : ""}`;
      break;
    case "backtrack":
    case "wrong_screen":
      state = "WORKFLOW_KNOWLEDGE_GAP";
      observed = `${who} left the expected screen`;
      break;
    default:
      return null;
  }
  return { state, confidence: 0.6, evidence: [observed, provenance] };
}

/** Synthetic persona runs (Guide & Observe) and their counters. */
export function useSyntheticRuns({ connection, programId, context }: Options): SyntheticRunsApi {
  const { getDriver, driverLogSinkRef, abortRef, hideOverlays, syncUrl } = connection;
  const [synth, setSynth] = React.useState<SynthState>(INITIAL_SYNTH);

  const run = React.useCallback(async () => {
    const driver = getDriver();
    const s0 = useSynforma.getState();
    const prog = programId ? s0.programs[programId] : null;
    if (!driver || !prog?.workflow || !prog.parsed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { workflow, parsed } = prog;
    const planner = createPlanner(prog.planner);
    driver.paceMs = 0;
    driverLogSinkRef.current = null;
    setSynth({ status: "running", currentPersonaId: null, completed: 0, error: null });
    let completed = 0;
    let newInterventions = 0;
    let quiet = 0;
    let reactChain: Promise<void> = Promise.resolve();
    /** Per-run decision tally: proposals count as "shown" for the frequency cap and budget, exactly as they would for a person. */
    const tally = new Map<string, { proposed: number; lastAt: number | null }>();

    const react = (signalId: string) => {
      reactChain = reactChain.then(async () => {
        const st = useSynforma.getState();
        const signal = st.signals.find((sg) => sg.id === signalId);
        const program = st.programs[prog.id];
        if (!signal || !program) return;
        const runIdsOf = () => new Set(Object.values(useSynforma.getState().runs).filter((r) => r.programId === prog.id).map((r) => r.id));
        const before = new Set(Object.keys(st.interventions));
        const runTally = tally.get(signal.runId) ?? { proposed: 0, lastAt: null };
        tally.set(signal.runId, runTally);
        const step = workflow.steps.find((x) => x.id === signal.stepId);
        const stateLabel = signal.frictionState ? FRICTION_SHORT[signal.frictionState] : signal.type;
        try {
          const decision = await decide(signal, {
            planner,
            program,
            getSignalsForStep: (stepId) => {
              const ids = runIdsOf();
              return useSynforma.getState().signals.filter((sg) => sg.stepId === stepId && ids.has(sg.runId));
            },
            getInterventionsForStep: (stepId) => Object.values(useSynforma.getState().interventions).filter((i) => i.programId === prog.id && i.stepId === stepId),
            getRuns: () => Object.values(useSynforma.getState().runs).filter((r) => r.programId === prog.id),
            saveHypothesis: (h) => useSynforma.getState().addHypothesis(h),
            saveIntervention: (i) => useSynforma.getState().upsertIntervention(i),
            preference: SYNTHETIC_PREFERENCE,
            proficiency: useSynforma.getState().proficiency[`${prog.id}/${signal.stepId}`],
            shownThisRun: runTally.proposed,
            sinceLastShownMs: runTally.lastAt !== null ? Date.now() - runTally.lastAt : undefined,
          });
          if (!decision) return;
          const store = useSynforma.getState();
          if (decision.selected === DO_NOTHING_ID || !decision.intervention) {
            // DO_NOTHING won: recorded as deliberately as an intervention (false-intervention protection).
            quiet += 1;
            store.addEvent({
              runId: signal.runId,
              type: "intervention_withheld",
              stepId: signal.stepId,
              data: {
                selected: DO_NOTHING_ID,
                candidates: decision.candidates.slice(0, 5),
                reason: decision.reason,
                frictionState: signal.frictionState ?? null,
                frictionConfidence: signal.frictionConfidence ?? null,
                signalType: signal.type,
                hypothesisId: decision.hypothesis.id,
                preference: SYNTHETIC_PREFERENCE,
                simulated: true,
              },
              message: `Stayed quiet: ${stateLabel}`,
            });
            const run = store.runs[signal.runId];
            if (run) store.updateRun(run.id, { withheld: (run.withheld ?? 0) + 1 });
            return;
          }
          const intervention = decision.intervention;
          runTally.proposed += 1;
          runTally.lastAt = Date.now();
          const isNew = !before.has(intervention.id);
          // Nothing is displayed to a synthetic user: the selection is recorded as a proposal, never as "shown".
          store.addEvent({
            runId: signal.runId,
            type: "note",
            stepId: signal.stepId,
            data: { decision: "intervene", interventionId: intervention.id, techniqueId: intervention.techniqueId, reused: !isNew, candidates: decision.candidates.slice(0, 5), frictionState: signal.frictionState ?? null, hypothesisId: decision.hypothesis.id, simulated: true },
            message: `Would show "${intervention.content.title}" (${intervention.techniqueId}) — proposed in simulation, not displayed`,
          });
          if (isNew) {
            newInterventions += 1;
            store.addAudit({ actor: "synforma", action: "Intervention proposed", target: step?.title, programId: prog.id, runId: signal.runId, detail: `${intervention.techniqueId} · from a ${stateLabel} signal in a synthetic run · scored against do-nothing` });
          }
        } catch (e) {
          useSynforma.getState().addAudit({ actor: "synforma", action: "Diagnosis failed", programId: prog.id, runId: signal.runId, detail: errorMessage(e) });
        }
      });
    };

    for (const persona of PERSONAS) {
      if (ac.signal.aborted) break;
      setSynth((st) => ({ ...st, currentPersonaId: persona.id }));
      const runId = shortId("run");
      const startedAt = Date.now();
      const variant = readSandboxUiVariant();
      const s = useSynforma.getState();
      s.addRun({ id: runId, programId: prog.id, workflowId: workflow.id, actor: "synthetic", persona: persona.name, mode: "guide", startedAt, interventionIds: [], uiVariant: variant, requirementsMet: [], regroundings: 0, preference: SYNTHETIC_PREFERENCE, assistanceShown: 0, withheld: 0 });
      s.addEvent({ runId, type: "run_started", data: { actor: "synthetic", persona: persona.id, capabilities: { ...persona.capabilities }, preference: SYNTHETIC_PREFERENCE, simulated: true } });
      s.addAudit({ actor: "synthetic", action: `Simulation started: ${persona.name}`, runId, programId: prog.id, detail: "synthetic user — labeled simulation, excluded from human timing" });
      try {
        const result = await runWorkflow({
          driver,
          workflow,
          requirements: parsed.requirements,
          context: prog.context ?? context,
          actor: "synthetic",
          capabilities: persona.capabilities,
          // No trust gate: a simulation is never blocked by a contested claim. No ledger either: simulation stays out of provenance and undo.
          policy: { commits: "auto", scope: "all" },
          signal: ac.signal,
          hooks: {
            onEvent: (type, data, stepId, message) => {
              const store = useSynforma.getState();
              store.addEvent({ runId, type, data, stepId, message });
              const struggle = STRUGGLE_EVENTS[type];
              if (struggle && stepId) {
                const friction = simulatedFriction(type, data, persona);
                if (friction) {
                  store.addEvent({
                    runId,
                    type: "friction_inferred",
                    stepId,
                    data: { state: friction.state, confidence: friction.confidence, evidence: friction.evidence, alternatives: [], ruleVersion: SYNTHETIC_FRICTION_RULE, simulated: true, persona: persona.id },
                    message: `Simulated state: ${FRICTION_SHORT[friction.state]} (${persona.name})`,
                  });
                }
                const signal = store.addSignal({
                  runId,
                  stepId,
                  type: struggle.type,
                  magnitude: struggle.magnitude,
                  t: Date.now(),
                  detail: message ?? (data?.reason as string | undefined),
                  frictionState: friction?.state,
                  frictionConfidence: friction?.confidence,
                  evidence: friction?.evidence,
                });
                react(signal.id);
              }
            },
            requestApproval: async () => "granted",
          },
        });
        useSynforma.getState().updateRun(runId, { endedAt: Date.now(), outcome: result.outcome, requirementsMet: result.requirementsMet, regroundings: result.regroundings });
        useSynforma.getState().addAudit({ actor: "synthetic", action: `Simulation ${result.outcome}: ${persona.name}`, runId, programId: prog.id, detail: `${result.requirementsMet.length} requirements verified` });
      } catch (e) {
        const aborted = ac.signal.aborted;
        useSynforma.getState().addEvent({ runId, type: aborted ? "run_abandoned" : "run_failed", data: { reason: aborted ? "stopped by operator" : errorMessage(e), simulated: true } });
        useSynforma.getState().updateRun(runId, { endedAt: Date.now(), outcome: aborted ? "abandoned" : "failed" });
        if (aborted) break;
      }
      completed += 1;
      setSynth((st) => ({ ...st, completed }));
    }
    await reactChain;
    hideOverlays();
    syncUrl();
    const stopped = ac.signal.aborted;
    setSynth({ status: stopped ? "stopped" : "done", currentPersonaId: null, completed, error: null });
    toast(stopped ? `Simulation stopped after ${completed} synthetic run${completed === 1 ? "" : "s"}` : `${completed} synthetic runs finished (simulation)`, {
      description: `${newInterventions ? `${newInterventions} intervention${newInterventions === 1 ? "" : "s"} proposed from observed struggle` : "No new interventions proposed"} · Synforma stayed quiet ${quiet} time${quiet === 1 ? "" : "s"}`,
    });
  }, [abortRef, context, driverLogSinkRef, getDriver, hideOverlays, programId, syncUrl]);

  const stop = React.useCallback(() => abortRef.current?.abort(), [abortRef]);

  const reset = React.useCallback(() => setSynth(INITIAL_SYNTH), []);

  return { state: synth, run, stop, reset };
}
