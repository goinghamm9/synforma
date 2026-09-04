"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { Copy, Download, ListOrdered } from "lucide-react";
import { Badge, Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { computeProgramMetrics } from "@/lib/synforma/engine/metrics";
import { cn, formatDuration, formatPercent } from "@/lib/utils";
import type { AuditEntry, Program, Run, RunEvent } from "@/lib/synforma/types";
import { ActorBadge, EmptyState, Note, OutcomeBadge, PanelHeader, Stat } from "../bits";
import { ErrorBoundary } from "../error-boundary";

const FrictionChart = dynamic(() => import("../friction-chart").then((m) => m.FrictionChart), { ssr: false, loading: () => <Skeleton className="h-[160px] w-full" /> });

interface Props {
  program: Program;
  runs: Run[];
  events: RunEvent[];
  audit: AuditEntry[];
  onOpenRun: (run: Run) => void;
  onExport: () => void;
  onCopy: () => void;
}

export function MeasurePanel({ program, runs, events, audit, onOpenRun, onExport, onCopy }: Props) {
  const metrics = React.useMemo(() => computeProgramMetrics(program, runs, events), [program, runs, events]);
  const fieldCount = program.parsed?.requirements.filter((r) => r.kind === "field").length ?? 0;
  const finished = runs.filter((r) => r.outcome).length;
  const programAudit = React.useMemo(() => audit.filter((a) => a.programId === program.id || (a.runId && runs.some((r) => r.id === a.runId))).sort((a, b) => b.t - a.t), [audit, program.id, runs]);

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

      <section className="rounded-lg border border-line bg-surface p-5" data-testid="itor-hero">
        {metrics.intentToOutcomeRate !== null ? (
          <div>
            <div className="mono-data text-5xl leading-none text-ink">{formatPercent(metrics.intentToOutcomeRate)}</div>
            <div className="mt-2 text-sm text-graphite">
              of {finished} finished runs ended with a record satisfying all {fieldCount} requirements
            </div>
          </div>
        ) : (
          <div>
            <div className="display text-2xl text-ink">Still learning</div>
            <div className="mt-1 text-sm text-graphite">
              {finished} of {metrics.minimumRuns} finished runs needed before a rate is reported.
            </div>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Runs" value={metrics.runs} hint={`${metrics.byActor.agent} agent · ${metrics.byActor.human} human · ${metrics.byActor.synthetic} synthetic`} />
          <Stat label="Completed" value={metrics.completed} hint={finished ? `${formatPercent(metrics.completed / finished)} of finished` : "no finished runs"} />
          <Stat label="Median human duration" value={metrics.medianDurationMs !== null ? formatDuration(metrics.medianDurationMs) : "—"} hint={metrics.medianDurationMs === null ? "no completed human runs" : "humans only"} />
          <Stat label="Self-healing" value={metrics.regroundings} hint="semantic re-groundings" tone={metrics.regroundings ? "verdant" : "ink"} />
        </div>
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

      <Note>Synthetic runs count toward run totals and the Intent-to-Outcome Rate denominator as labeled simulations, but never toward human timing or cohorts.</Note>
    </div>
  );
}
