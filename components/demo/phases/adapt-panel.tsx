"use client";
import * as React from "react";
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, FlaskConical, Lightbulb, MoonStar } from "lucide-react";
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { evaluateIntervention } from "@/lib/synforma/engine/adoption";
import { FRICTION_LABEL, FRICTION_SHORT } from "@/lib/synforma/engine/friction";
import { CITATION_BY_ID } from "@/lib/synforma/science/citations";
import { BARRIER_LABEL, BARRIER_SHORT, EVIDENCE_LABEL, TECHNIQUE_BY_ID } from "@/lib/synforma/science/techniques";
import { cn, formatPercent } from "@/lib/utils";
import type { Hypothesis, Intervention, InterventionScore, Program, Run, RunEvent } from "@/lib/synforma/types";
import { summarizeDecisions } from "../decisions";
import { EmptyState, ModeBadge, Note, PanelHeader } from "../bits";

interface Props {
  program: Program;
  interventions: Intervention[];
  hypotheses: Record<string, Hypothesis>;
  runs: Run[];
  /** Program events: the source of the decision accounting (do-nothing vs interventions). */
  events?: RunEvent[];
  onGoGuide: () => void;
}

const SCORE_ROWS: { key: keyof Omit<InterventionScore, "total" | "explanation">; label: string; weight: string; penalty?: boolean }[] = [
  { key: "barrierFit", label: "Barrier fit", weight: "×0.35" },
  { key: "contextFit", label: "Context fit", weight: "×0.20" },
  { key: "evidenceWeight", label: "Evidence weight", weight: "×0.15" },
  { key: "previousSuccess", label: "Previous success", weight: "×0.30" },
  { key: "repetitionPenalty", label: "Repetition penalty", weight: "−", penalty: true },
  { key: "burdenPenalty", label: "Burden penalty", weight: "−", penalty: true },
];

function ScoreBar({ value, penalty }: { value: number; penalty?: boolean }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
      <div className={cn("h-full", penalty ? "bg-signal/70" : "bg-ink")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function FrictionStateBadge({ state }: { state: NonNullable<Hypothesis["frictionState"]> }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1 rounded-full border border-line-strong bg-surface px-2 py-px text-[11px] text-graphite" data-testid="friction-state" data-state={state}>
          <span className="text-slate">Observed state</span>
          <span className="font-medium text-ink">{FRICTION_SHORT[state]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{FRICTION_LABEL[state]}</TooltipContent>
    </Tooltip>
  );
}

/** How often the policy chose to stay quiet versus intervene, from stored events only. */
function DecisionsSummary({ events, runs }: { events: RunEvent[]; runs: Run[] }) {
  const d = React.useMemo(() => summarizeDecisions(events, runs), [events, runs]);
  const interventions = d.shown + d.proposed;
  const quietShare = d.total ? d.doNothing / d.total : null;
  return (
    <section className="rounded-lg border border-line bg-surface p-4" data-testid="decisions-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">Decisions · observed</div>
          <div className="mt-1 text-sm font-medium text-ink">
            {d.total === 0 ? (
              "No policy decisions recorded yet"
            ) : (
              <>
                Synforma stayed quiet <span className="mono-data">{d.doNothing}</span> time{d.doNothing === 1 ? "" : "s"} (do-nothing decisions) and intervened <span className="mono-data">{interventions}</span> time{interventions === 1 ? "" : "s"}
              </>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-graphite">
            DO_NOTHING is a first-class policy action: every struggle signal is scored against staying quiet, and a system that always intervenes is judged by its false-intervention rate, not by how much help it shows.
          </p>
        </div>
        <MoonStar className="h-4 w-4 shrink-0 text-slate" aria-hidden="true" />
      </div>
      {d.total ? (
        <>
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <div className="h-full bg-ink" style={{ width: `${Math.round((quietShare ?? 0) * 100)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate">
            <span>
              <span className="mono-data text-ink">{formatPercent(quietShare)}</span> quiet
            </span>
            <span>
              <span className="mono-data text-ink">{d.shown}</span> shown to people ({d.humanRuns} human run{d.humanRuns === 1 ? "" : "s"})
            </span>
            <span>
              <span className="mono-data text-ink">{d.proposed}</span> proposed in simulation ({d.syntheticRuns} synthetic run{d.syntheticRuns === 1 ? "" : "s"}; nothing is displayed to a synthetic user)
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-slate">Decisions are recorded as events (intervention_withheld, assistance_shown) when a person or a synthetic user is observed.</p>
      )}
    </section>
  );
}

function InterventionCard({ i, program, hypothesis, runs }: { i: Intervention; program: Program; hypothesis?: Hypothesis; runs: Run[] }) {
  const [why, setWhy] = React.useState(false);
  const technique = TECHNIQUE_BY_ID[i.techniqueId];
  const step = program.workflow?.steps.find((s) => s.id === i.stepId);
  const evalr = evaluateIntervention(i, runs);
  const citations = (technique?.sourceIds ?? []).map((id) => CITATION_BY_ID[id]).filter(Boolean);
  return (
    <li className="rounded-lg border border-line bg-surface" data-testid="intervention-card">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">Step {step ? step.index + 1 : "?"}</div>
            <div className="text-sm font-medium text-ink">{step?.title ?? i.stepId}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={i.status === "deployed" ? "verdant" : i.status === "retired" ? "muted" : "outline"}>{i.status}</Badge>
            <Badge variant="muted">{i.generatedBy === "gemini" ? "Gemini planner" : "Heuristic planner"}</Badge>
          </div>
        </div>

        {hypothesis ? (
          <div className="rounded-md border border-amber/20 bg-amber-soft px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-amber">Hypothesis</span>
              <span className="text-amber">{BARRIER_LABEL[hypothesis.barrier]}</span>
              <span className="mono-data ml-auto text-amber">{formatPercent(hypothesis.confidence)} confidence</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {hypothesis.frictionState ? (
                <FrictionStateBadge state={hypothesis.frictionState} />
              ) : (
                <span className="text-[11px] text-slate" data-testid="friction-state" data-state="none">
                  No friction state: derived from navigation and validation signals only
                </span>
              )}
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-graphite">
              {hypothesis.evidence.map((e, idx) => (
                <li key={idx}>Observed: {e}</li>
              ))}
            </ul>
            {hypothesis.alternatives.length ? (
              <div className="mt-1.5 text-[11px] text-slate">
                Alternatives: {hypothesis.alternatives.map((a) => `${BARRIER_SHORT[a.barrier]} ${formatPercent(a.confidence)}`).join(" · ")}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate">Hypothesis record not found.</p>
        )}

        {technique ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-ink">{technique.name}</span>
              <ModeBadge mode={technique.mode} />
              <Badge variant={technique.evidence === "strong" || technique.evidence === "promising" ? "verdant" : "amber"}>{EVIDENCE_LABEL[technique.evidence]}</Badge>
            </div>
            <p className="text-xs text-graphite">{technique.mechanism}</p>
            {citations.length ? (
              <ul className="space-y-0.5 text-[11px] text-slate">
                {citations.map((c) => (
                  <li key={c.id} className="flex items-start gap-1">
                    <BookOpen className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                      {c.authors} ({c.year}). {c.title}. <em>{c.venue}</em>.{" "}
                      <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink underline-offset-2 hover:underline">
                        doi:{c.doi}
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {technique.cautions.length ? <p className="text-[11px] text-amber">Caution: {technique.cautions.join(" ")}</p> : null}
          </div>
        ) : (
          <Badge variant="amber">Experimental suggestion — technique not in registry</Badge>
        )}

        <div className="rounded-lg border border-line-strong bg-paper p-3" aria-label="Assistance as employees will see it">
          <div className="eyebrow mb-1">As shown to employees</div>
          <div className="text-sm font-medium text-ink">{i.content.title}</div>
          <p className="mt-1 whitespace-pre-line text-sm text-graphite">{i.content.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate">
            {i.content.anchor?.elementName ? <span>anchored to &ldquo;{i.content.anchor.elementName}&rdquo;</span> : null}
            {i.content.offerAssist ? <span className="rounded-full border border-line px-2 py-0.5">offers &ldquo;Let Synforma do this step&rdquo;</span> : null}
            {i.content.source ? <span>source: {i.content.source}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-graphite">
            <FlaskConical className="h-3.5 w-3.5 text-slate" aria-hidden="true" />
            Experiment
          </span>
          <span className="mono-data text-ink">
            treated {evalr.treatedCompleted}/{evalr.treated}
          </span>
          <span className="mono-data text-ink">
            control {evalr.controlCompleted}/{evalr.control}
          </span>
          {evalr.sufficient && evalr.lift !== null ? (
            <span className={cn("mono-data", evalr.lift >= 0 ? "text-verdant" : "text-signal")}>lift {evalr.lift >= 0 ? "+" : ""}{formatPercent(evalr.lift)}</span>
          ) : (
            <span className="text-amber">Still learning — {i.experiment.minRunsPerArm} human runs per arm needed</span>
          )}
        </div>

        <button type="button" onClick={() => setWhy((w) => !w)} className="inline-flex items-center gap-1 text-xs text-slate hover:text-ink" aria-expanded={why}>
          {why ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
          Why this?
        </button>
        {why ? (
          <div className="space-y-2 rounded-md bg-surface-2 p-3">
            <div className="grid grid-cols-[minmax(0,130px)_1fr_auto] items-center gap-x-3 gap-y-1.5 text-xs">
              {SCORE_ROWS.map((row) => (
                <React.Fragment key={row.key}>
                  <span className="text-graphite">
                    {row.label} <span className="text-mist">{row.weight}</span>
                  </span>
                  <ScoreBar value={i.scoring[row.key]} penalty={row.penalty} />
                  <span className="mono-data text-ink">{i.scoring[row.key].toFixed(2)}</span>
                </React.Fragment>
              ))}
              <span className="font-medium text-ink">Total</span>
              <span />
              <span className="mono-data font-medium text-ink">{i.scoring.total.toFixed(3)}</span>
            </div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-graphite">
              {i.scoring.explanation.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
            <p className="text-[11px] text-slate">The always-present &ldquo;Do nothing&rdquo; candidate is scored against this technique each time; it wins whenever the evidence is weak, the person is fluent or proficient, or help was shown recently.</p>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function AdaptPanel({ program, interventions, hypotheses, runs, events = [], onGoGuide }: Props) {
  const sorted = [...interventions].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 7 · Adapt"
        title="Interventions Synforma proposed"
        description="Observe → diagnose → intervene → experiment → learn. Each struggle signal becomes a barrier hypothesis tied to an observable friction state, every candidate technique is scored against doing nothing, and content is composed from the objective. Nothing here is a fact about a person."
      />
      <DecisionsSummary events={events} runs={runs} />
      {sorted.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No struggle observed yet"
          body="Run synthetic users or open the employee view. Interventions are proposed only from observed signals."
          action={
            <Button size="sm" variant="outline" onClick={onGoGuide}>
              Go to Guide & Observe
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3" data-testid="interventions">
          {sorted.map((i) => (
            <InterventionCard key={i.id} i={i} program={program} hypothesis={hypotheses[i.hypothesisId]} runs={runs} />
          ))}
        </ul>
      )}
      <Note>Techniques and citations come only from the registry; the barrier taxonomy is a theoretical model (COM-B adapted to software-mediated work) and friction states are observable interaction states, never emotions or traits. Lift is reported only once each arm has enough human runs.</Note>
    </div>
  );
}
