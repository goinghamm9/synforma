import { Badge } from "@/components/ui";
import { FRICTION_TO_BARRIER } from "@/lib/synforma/engine/adoption";
import { FRICTION_LABEL, FRICTION_RULE_VERSION, FRICTION_SHORT } from "@/lib/synforma/engine/friction";
import { BARRIER_SHORT, TECHNIQUE_BY_ID } from "@/lib/synforma/science/techniques";
import type { FrictionState } from "@/lib/synforma/types";
import { ClaimTag, Prose } from "./shell";

const STATE_ORDER: FrictionState[] = [
  "FLUENT",
  "VISUAL_SEARCH",
  "DECISION_UNCERTAINTY",
  "POLICY_UNCERTAINTY",
  "WORKFLOW_KNOWLEDGE_GAP",
  "ERROR_RECOVERY",
  "WORKFLOW_FRICTION",
  "TIME_PRESSURE",
  "UNKNOWN",
];

/** What the rule in lib/synforma/engine/friction.ts uses as evidence, stated in the rule's own thresholds. */
const EVIDENCE: Record<FrictionState, string> = {
  FLUENT:
    "Clicks or keystrokes in the last few one-second windows with no validation message visible, or the step was entered less than 4 s ago. Cut to a third while an error is being corrected.",
  VISUAL_SEARCH:
    "Sensing is on, the step's target control is known but has never been hovered or approached, more than 6 s have passed on the step and nothing was typed. An inefficient pointer path (more than 300 px travelled at a mean path efficiency below 0.55), six or more direction changes, and more than 12 s on the step add weight. Cut to a third while an error is recent.",
  DECISION_UNCERTAINTY:
    "The target control was located, hovered for at least 0.6 s or approached at least twice, and no click followed while requirements are still pending or the step commits. Hovering beyond 1.2 s, repeated approaches, withdrawals and more than 8 s without input add weight; a visible validation message halves it.",
  POLICY_UNCERTAINTY:
    "The decision-uncertainty evidence, on a judgment step whose values the objective constrains through accepted values or a policy sentence. Scored at 0.8 × that weight.",
  WORKFLOW_KNOWLEDGE_GAP:
    "More than 12 s on the step with little pointer movement (under 200 px), more than 6 s idle and the target never seen; or any backtrack to an earlier step.",
  ERROR_RECOVERY:
    "A validation message is visible, or a validation error occurred within the last 15 s. Correction keystrokes and any typing add weight; fluent evidence is cut to a third.",
  WORKFLOW_FRICTION: "Two or more validation errors on the same step within one run.",
  TIME_PRESSURE:
    "No rule reaches this state in the current rule version: it is reserved for an explicit deadline signal. Today the person's Get It Done request plays that role in scoring, favouring assistance over instruction.",
  UNKNOWN:
    "The result whenever no rule reaches 0.3, and the usual result when sensing is off, because only navigation and validation evidence remain. Confidence is then capped at 0.35.",
};

/**
 * Mirrors FRICTION_PREFERRED in lib/synforma/engine/adoption.ts, which is
 * module-private there. The first entry receives the larger context-fit boost
 * (+0.35), the others +0.15. Names come from the technique registry.
 */
const PREFERRED: Partial<Record<FrictionState, string[]>> = {
  VISUAL_SEARCH: ["contextual_pointer", "if_then_cue"],
  DECISION_UNCERTAINTY: ["clarify_consequence", "policy_clarification"],
  POLICY_UNCERTAINTY: ["policy_clarification", "clarify_consequence"],
  ERROR_RECOVERY: ["format_example", "prefill_assist"],
  WORKFLOW_KNOWLEDGE_GAP: ["inline_explanation", "if_then_cue", "requirement_checklist"],
  WORKFLOW_FRICTION: ["prefill_assist", "act_on_behalf", "recommend_redesign"],
  TIME_PRESSURE: ["prefill_assist", "act_on_behalf"],
};

const NEVER_INFERRED = [
  "Emotion",
  "Stress",
  "Personality",
  "Intelligence",
  "Motivation as a trait",
  "Mental health",
  "Neurodivergence",
  "Performer rankings, or any employee-worth score",
];

function afterColon(label: string): string {
  return label.replace(/^[^:]+:\s*/, "");
}

export function FrictionStates() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" data-testid="friction-claim">
        <ClaimTag tone="outline">Product hypothesis</ClaimTag>
        <span className="text-sm text-slate">
          Rule version <code className="mono-data text-[12px] text-graphite">{FRICTION_RULE_VERSION}</code>
        </span>
      </div>
      <Prose className="mt-5">
        <p>
          Synforma never asks how a person feels. It scores <strong>observable interaction states</strong> from three kinds of evidence: the
          semantic screen (alerts, dialogs, which requirement fields are still unmet), navigation (time on the step, backtracks) and, when sensing
          is on, one-second pointer and keyboard-metadata windows that contain counts, distances and durations and nothing else. Each state
          below is defined by the rule that produces it, in the rule&rsquo;s own thresholds, so a claim like &ldquo;visual search&rdquo; can be
          checked against the evidence stored with it.
        </p>
      </Prose>

      <ol className="mt-8 divide-y divide-line border-y border-line" data-testid="friction-states">
        {STATE_ORDER.map((state) => {
          const barrier = FRICTION_TO_BARRIER[state];
          const preferred = (PREFERRED[state] ?? []).map((id) => TECHNIQUE_BY_ID[id]).filter(Boolean);
          return (
            <li key={state} className="grid gap-4 py-6 sm:grid-cols-12 sm:gap-6" data-friction-state={state}>
              <div className="sm:col-span-4">
                <h3 className="text-base font-medium text-ink">{FRICTION_SHORT[state]}</h3>
                <code className="mono-data mt-1 block text-[11px] text-mist">{state}</code>
                <p className="mt-3 text-sm leading-relaxed text-graphite">{afterColon(FRICTION_LABEL[state])}</p>
              </div>
              <dl className="grid gap-3 sm:col-span-8">
                <div>
                  <dt className="eyebrow">Evidence the engine uses</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-graphite">{EVIDENCE[state]}</dd>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="eyebrow">Barrier hypothesis</dt>
                    <dd className="mt-1.5 text-sm text-graphite">
                      {barrier ? <Badge variant="muted">{BARRIER_SHORT[barrier]}</Badge> : <span className="text-slate">None</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Minimal intervention it prefers</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-graphite">
                      {preferred.length ? (
                        <ul className="space-y-0.5">
                          {preferred.map((t, i) => (
                            <li key={t.id}>
                              <a href={`#technique-${t.id}`} className="text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                                {t.name}
                              </a>
                              <span className="mono-data ml-2 text-[11px] text-mist">{i === 0 ? "+0.35" : "+0.15"}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate">Nothing. The Do-nothing candidate gains 0.45.</span>
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      <Prose className="mt-8">
        <p>
          <strong>Confidence and alternatives.</strong> The winning state&rsquo;s confidence is its share of all evidence weight, plus 0.15 when
          that weight exceeds 0.8, clamped to 0.05–0.95. The next three states holding more than a tenth of the weight are stored as
          alternatives. Every inference is recorded with its evidence strings and rule version; it raises a struggle signal only from a
          confidence of 0.45, once per state per step unless confidence grows by 0.1. Decision uncertainty deliberately suppresses pointers: the
          control was already found, so a highlight would add load without information.
        </p>
      </Prose>

      <div className="mt-8 rounded-lg border border-line bg-surface p-5 sm:p-6" data-testid="never-inferred">
        <p className="eyebrow">Never inferred, stored or displayed</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {NEVER_INFERRED.map((item) => (
            <li key={item} className="rounded-full border border-line-strong px-2.5 py-0.5 text-[13px] text-graphite">
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-graphite">
          Interaction features exist only to improve the current person&rsquo;s interaction with the current task. They are never used to
          identify, authenticate or rank a person, and the friction history of an individual is private to that person.
        </p>
      </div>
    </div>
  );
}
