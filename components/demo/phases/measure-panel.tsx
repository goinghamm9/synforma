"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { Copy, Download, ListOrdered, Stethoscope } from "lucide-react";
import { Badge, Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { computeProgramMetrics } from "@/lib/synforma/engine/metrics";
import { FRICTION_LABEL, FRICTION_SHORT } from "@/lib/synforma/engine/friction";
import { MIN_RUNS_FOR_RECOMMENDATION, RECOMMENDATION_LABEL, recommend, type Recommendation } from "@/lib/synforma/engine/recommend";
import { cn, formatDuration, formatPercent } from "@/lib/utils";
import type { AuditEntry, CohortMetrics, Hypothesis, Intervention, Program, Run, RunEvent } from "@/lib/synforma/types";
import { summarizeDecisions } from "../decisions";
import { ActorBadge, EmptyState, InfoTip, Note, OutcomeBadge, PanelHeader, Stat } from "../bits";
import { ErrorBoundary } from "../error-boundary";

const FrictionChart = dynamic(() => import("../friction-chart").then((m) => m.FrictionChart), { ssr: false, loading: () => <Skeleton className="h-[160px] w-full" /> });

interface Props {
  program: Program;
  runs: Run[];
  events: RunEvent[];
  audit: AuditEntry[];
  hypotheses?: Record<string, Hypothesis>;
  interventions?: Intervention[];
  onOpenRun: (run: Run) => void;
  onExport: () => void;
  onCopy: () => void;
}

const EMPTY_HYPOTHESES: Record<string, Hypothesis> = {};
const EMPTY_INTERVENTIONS: Intervention[] = [];

function cohortLine(c: CohortMetrics): string {
  return `${c.runs} run${c.runs === 1 ? "" : "s"} · ${c.rate === null ? "—" : `${formatPercent(c.rate)} completion`}`;
}

function DiagnosisCard({ rec, peopleRuns, simulatedFrictionShare }: { rec: Recommendation; peopleRuns: number; simulatedFrictionShare: number }) {
  const learning = rec.class === "INSUFFICIENT_EVIDENCE";
  const maxCount = rec.frictionDistribution.reduce((m, d) => Math.max(m, d.count), 0) || 1;
  const totalStates = rec.frictionDistribution.reduce((a, d) => a + d.count, 0);
  return (
    <section className={cn("rounded-lg border p-5", learning ? "border-amber/30 bg-amber-soft/40" : "border-line bg-surface")} data-testid="diagnosis-card" data-class={rec.class}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">System-vs-human diagnosis · Hypothesis</span>
            <Badge variant={learning ? "amber" : "default"} data-testid="diagnosis-class">
              {RECOMMENDATION_LABEL[rec.class]}
            </Badge>
          </div>
          <h3 className="display mt-2 text-xl text-ink" data-testid="diagnosis-headline">
            {rec.headline}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-graphite">{rec.rationale}</p>
          {rec.stepTitle ? (
            <p className="mt-1 text-[11px] text-slate">
              Highest-friction step: <span className="text-ink">{rec.stepTitle}</span>
            </p>
          ) : null}
        </div>
        <Stethoscope className="h-4 w-4 shrink-0 text-slate" aria-hidden="true" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate">Evidence · observed</div>
            {rec.evidence.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-graphite" data-testid="diagnosis-evidence">
                {rec.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-slate">No aggregate evidence yet.</p>
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate">Unlikely to help</div>
            {rec.unlikelyToHelp.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-graphite" data-testid="diagnosis-unlikely">
                {rec.unlikelyToHelp.map((u, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-[7px] h-px w-2 shrink-0 bg-signal" aria-hidden="true" />
                    {u}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-slate">{learning ? "Nothing to rule out until a pattern is observed." : "—"}</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-slate">
              <span>Confidence</span>
              <span className="mono-data text-ink" data-testid="diagnosis-confidence">
                {formatPercent(rec.confidence)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(rec.confidence * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Recommendation confidence">
              <div className={cn("h-full", learning ? "bg-amber" : "bg-ink")} style={{ width: `${Math.round(rec.confidence * 100)}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-slate">
              {learning ? `${peopleRuns} of ${MIN_RUNS_FOR_RECOMMENDATION} finished runs by people needed before Synforma classifies the friction.` : `From ${peopleRuns} finished runs by people (human and labeled simulation). Aggregate evidence only; no individual telemetry.`}
            </p>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate">
            Friction states observed
            <InfoTip text="Observable interaction states inferred per step during people's runs (fluent and unknown excluded). Never an emotion, trait or score of a person." label="About friction states" />
          </div>
          {rec.frictionDistribution.length ? (
            <ul className="mt-1.5 space-y-1.5" data-testid="friction-distribution">
              {rec.frictionDistribution.map((d) => (
                <li key={d.state} className="grid grid-cols-[minmax(0,120px)_1fr_auto] items-center gap-2 text-xs" title={FRICTION_LABEL[d.state]}>
                  <span className="truncate text-graphite">{FRICTION_SHORT[d.state]}</span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                    <div className="h-full bg-ink" style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="mono-data text-ink">{d.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate">No friction states inferred yet. They appear once people (or synthetic users) are observed on the workflow.</p>
          )}
          {simulatedFrictionShare > 0 ? (
            <p className="mt-2 text-[11px] text-amber">
              {formatPercent(simulatedFrictionShare)} of these {totalStates} states come from synthetic runs: mapped from a capability limit of the simulation, not inferred from pointer or keyboard windows.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function MeasurePanel({ program, runs, events, audit, hypotheses = EMPTY_HYPOTHESES, interventions = EMPTY_INTERVENTIONS, onOpenRun, onExport, onCopy }: Props) {
  const metrics = React.useMemo(() => computeProgramMetrics(program, runs, events), [program, runs, events]);
  const recommendation = React.useMemo(() => recommend(program, metrics, runs, events, Object.values(hypotheses), interventions), [program, metrics, runs, events, hypotheses, interventions]);
  const decisions = React.useMemo(() => summarizeDecisions(events, runs), [events, runs]);
  const simulatedFrictionShare = React.useMemo(() => {
    const synthetic = new Set(runs.filter((r) => r.actor === "synthetic").map((r) => r.id));
    const all = events.filter((e) => e.type === "friction_inferred" && e.data?.state !== "FLUENT" && e.data?.state !== "UNKNOWN");
    if (!all.length) return 0;
    return all.filter((e) => synthetic.has(e.runId)).length / all.length;
  }, [events, runs]);
  const fieldCount = program.parsed?.requirements.filter((r) => r.kind === "field").length ?? 0;
  const finished = runs.filter((r) => r.outcome).length;
  const peopleFinished = metrics.human.runs + metrics.synthetic.runs;
  const programAudit = React.useMemo(() => audit.filter((a) => a.programId === program.id || (a.runId && runs.some((r) => r.id === a.runId))).sort((a, b) => b.t - a.t), [audit, program.id, runs]);
  const humanRuns = metrics.human.runs;
  const perHuman = (n: number) => (humanRuns ? (n / humanRuns).toFixed(1) : "—");

  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 8 · Measure"
        title="Intent-to-Outcome Rate"
        description="Of the intended outcomes, how many happened correctly? Computed from stored runs and events only. Nothing is estimated."
        aside={
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={onExport} data-testid="export-json">
              <Download aria-hidden="true" />
              Export JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopy} title="Copy the export to the clipboard (downloads are blocked in some sandboxes)">
              <Copy aria-hidden="true" />
              Copy
            </Button>
          </div>
        }
      />

      <DiagnosisCard rec={recommendation} peopleRuns={peopleFinished} simulatedFrictionShare={simulatedFrictionShare} />

      <section className="rounded-lg border border-line bg-surface p-5" data-testid="itor-hero">
        {metrics.intentToOutcomeRate !== null ? (
          <div>
            <div className="mono-data text-5xl leading-none text-ink">{formatPercent(metrics.intentToOutcomeRate)}</div>
            <div className="mt-2 text-sm text-graphite">
              of {peopleFinished} finished runs by people ({metrics.human.runs} human · {metrics.synthetic.runs} labeled simulation) ended with a record satisfying all {fieldCount} requirements. Agent runs are reported separately and never inflate this number.
            </div>
          </div>
        ) : (
          <div>
            <div className="display text-2xl text-ink">Still learning</div>
            <div className="mt-1 text-sm text-graphite">
              {peopleFinished} of {metrics.minimumRuns} finished runs by people (human or labeled simulation) needed before a rate is reported. Agent runs do not count toward it.
            </div>
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="cohort-tiles">
          <Stat label="People" value={cohortLine(metrics.human)} hint="human runs from the employee view" testId="cohort-people" />
          <Stat label="Simulation" value={cohortLine(metrics.synthetic)} hint="synthetic users, labeled simulation" tone="amber" testId="cohort-simulation" />
          <Stat label="Agent" value={cohortLine(metrics.agent)} hint="Act runs, reported separately" testId="cohort-agent" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Runs" value={metrics.runs} hint={`${metrics.byActor.agent} agent · ${metrics.byActor.human} human · ${metrics.byActor.synthetic} synthetic`} />
          <Stat label="Completed" value={metrics.completed} hint={finished ? `${formatPercent(metrics.completed / finished)} of finished` : "no finished runs"} />
          <Stat label="Median human duration" value={metrics.medianDurationMs !== null ? formatDuration(metrics.medianDurationMs) : "—"} hint={metrics.medianDurationMs === null ? "no completed human runs" : "humans only"} />
          <Stat label="Self-healing" value={metrics.regroundings} hint="semantic re-groundings" tone={metrics.regroundings ? "verdant" : "ink"} />
        </div>
      </section>

      <section className="space-y-2" data-testid="assistance-burden">
        <div className="flex items-center gap-1">
          <span className="eyebrow">Assistance burden · human runs</span>
          <InfoTip text="How much Synforma interrupts people, from events in finished human runs: interventions shown per run and do-nothing decisions per run. A low intervention count with a high do-nothing count is the intended shape." label="About assistance burden" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Interventions per human run" value={perHuman(decisions.shownHuman)} hint={humanRuns ? `${decisions.shownHuman} shown across ${humanRuns} finished human run${humanRuns === 1 ? "" : "s"}` : "no finished human runs yet"} testId="burden-interventions" />
          <Stat label="Do-nothing decisions per human run" value={perHuman(decisions.doNothingHuman)} hint={humanRuns ? `${decisions.doNothingHuman} withheld across ${humanRuns} finished human run${humanRuns === 1 ? "" : "s"}` : "no finished human runs yet"} testId="burden-do-nothing" />
        </div>
        {decisions.proposed || decisions.doNothing - decisions.doNothingHuman ? (
          <p className="text-[11px] text-slate">
            Simulation, reported separately: {decisions.proposed} intervention{decisions.proposed === 1 ? "" : "s"} proposed and {decisions.doNothing - decisions.doNothingHuman} do-nothing decision{decisions.doNothing - decisions.doNothingHuman === 1 ? "" : "s"} across {metrics.synthetic.runs} synthetic run{metrics.synthetic.runs === 1 ? "" : "s"}.
          </p>
        ) : null}
      </section>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <section className="space-y-2">
            <span className="eyebrow">Friction per step · human and synthetic runs</span>
            {metrics.steps.length ? (
              <ErrorBoundary fallback={<Note tone="amber">The chart could not render. Values: {metrics.steps.map((s) => `${s.title}: ${s.friction === null ? "insufficient data" : formatPercent(s.friction)}`).join(" · ")}</Note>}>
                <FrictionChart steps={metrics.steps} />
              </ErrorBoundary>
            ) : (
              <Note>No workflow steps to measure.</Note>
            )}
          </section>

          <section className="space-y-2">
            <span className="eyebrow">Control vs treatment · human runs</span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ["Control (no intervention)", metrics.control],
                    ["Treatment (intervention shown)", metrics.treatment],
                  ] as const
                ).map(([label, c]) => (
                  <TableRow key={label}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="mono-data text-right">{c.runs}</TableCell>
                    <TableCell className="mono-data text-right">{c.completed}</TableCell>
                    <TableCell className="mono-data text-right">{c.rate === null ? <span className="text-mist">—</span> : formatPercent(c.rate)}</TableCell>
                    <TableCell className="mono-data text-right">{c.medianDurationMs === null ? <span className="text-mist">—</span> : formatDuration(c.medianDurationMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {metrics.control.runs + metrics.treatment.runs === 0 ? <p className="text-[11px] text-slate">No human runs yet. Open the employee view to add some; synthetic runs are excluded from cohorts.</p> : null}
          </section>

          <section className="space-y-2">
            <span className="eyebrow">Per-step detail</span>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Entered</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Hesitations</TableHead>
                  <TableHead className="text-right">Assist shown</TableHead>
                  <TableHead className="text-right">Friction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.steps.map((s, i) => (
                  <TableRow key={s.stepId}>
                    <TableCell className="max-w-[200px] truncate">
                      {i + 1}. {s.title}
                    </TableCell>
                    <TableCell className="mono-data text-right">{s.entered}</TableCell>
                    <TableCell className="mono-data text-right">{s.completed}</TableCell>
                    <TableCell className="mono-data text-right">{s.errors}</TableCell>
                    <TableCell className="mono-data text-right">{s.hesitations}</TableCell>
                    <TableCell className="mono-data text-right">{s.assistanceShown}</TableCell>
                    <TableCell className={cn("text-right", s.friction === null ? "text-amber" : "mono-data")}>{s.friction === null ? "insufficient data" : formatPercent(s.friction)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="runs">
          {runs.length === 0 ? (
            <EmptyState icon={ListOrdered} title="No runs recorded" body="Runs from Act, synthetic users and the employee view appear here." />
          ) : (
            <Table data-testid="runs-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Req.</TableHead>
                  <TableHead className="text-right">Re-grounded</TableHead>
                  <TableHead>UI</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...runs]
                  .sort((a, b) => b.startedAt - a.startedAt)
                  .map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpenRun(r)} data-testid="run-row">
                      <TableCell>
                        <ActorBadge actor={r.actor} persona={r.persona} />
                      </TableCell>
                      <TableCell className="capitalize">{r.mode}</TableCell>
                      <TableCell>
                        <OutcomeBadge outcome={r.outcome} />
                      </TableCell>
                      <TableCell className="mono-data text-right">
                        {r.requirementsMet.length}/{fieldCount}
                      </TableCell>
                      <TableCell className="mono-data text-right">{r.regroundings}</TableCell>
                      <TableCell>{r.uiVariant ? <Badge variant="outline">{r.uiVariant}</Badge> : <span className="text-mist">—</span>}</TableCell>
                      <TableCell className="mono-data whitespace-nowrap text-xs">{new Date(r.startedAt).toLocaleString([], { hour12: false })}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-[11px] text-slate">Select a run to open its event timeline.</p>
        </TabsContent>

        <TabsContent value="audit">
          {programAudit.length === 0 ? (
            <EmptyState title="No audit entries" body="Every action Synforma performs, every approval and every run completion is written here." />
          ) : (
            <ol className="divide-y divide-line rounded-lg border border-line" data-testid="audit-log">
              {programAudit.slice(0, 200).map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 text-xs">
                  <span className="mono-data shrink-0 text-mist">{new Date(a.t).toLocaleTimeString([], { hour12: false })}</span>
                  <span className={cn("shrink-0 rounded px-1 font-medium", a.actor === "agent" ? "bg-ink text-paper" : a.actor === "synthetic" ? "bg-amber-soft text-amber" : "bg-surface-2 text-graphite")}>{a.actor}</span>
                  <span className="text-ink">{a.action}</span>
                  {a.target ? <span className="text-graphite">→ {a.target}</span> : null}
                  {a.approval ? <Badge variant={a.approval === "granted" ? "verdant" : a.approval === "denied" ? "signal" : "amber"}>{a.approval}</Badge> : null}
                  {a.detail ? <span className="text-slate">{a.detail}</span> : null}
                </li>
              ))}
            </ol>
          )}
          {programAudit.length > 200 ? <p className="mt-2 text-[11px] text-slate">Showing the latest 200 of {programAudit.length} entries; export for the full log.</p> : null}
        </TabsContent>
      </Tabs>

      <Note>Synthetic runs count toward run totals and the Intent-to-Outcome Rate denominator as labeled simulations, but never toward human timing, cohorts or the assistance burden. The diagnosis is a hypothesis from aggregate evidence; it names what is unlikely to help as deliberately as what might.</Note>
    </div>
  );
}
