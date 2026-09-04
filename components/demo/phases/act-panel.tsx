"use client";
import * as React from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, ExternalLink, GitCompareArrows, Loader2, Play, RotateCcw, ShieldCheck, Square, Wrench, XCircle } from "lucide-react";
import { Badge, Button, Label, Switch, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn, formatDuration } from "@/lib/utils";
import type { Program, Run } from "@/lib/synforma/types";
import type { RunnerResult } from "@/lib/synforma/engine/runner";
import type { ChangeRecord, LogLine, UiVariant } from "../types";
import { ErrorNote, LogView, Note, OutcomeBadge, PanelHeader, Stat } from "../bits";

export interface ActState {
  status: "idle" | "running" | "done" | "stopped" | "error";
  runId: string | null;
  log: LogLine[];
  result: RunnerResult | null;
  currentStepId: string | null;
  stepStatus: Record<string, "entered" | "completed" | "failed">;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  regroundings: number;
  uiVariant: UiVariant | null;
  /** UI changes detected by semantic re-grounding during this run (from `action_regrounded` events). */
  changes: ChangeRecord[];
}

interface Props {
  state: ActState;
  program: Program;
  uiVariant: UiVariant;
  uiBusy: boolean;
  /** Short planner name for prose ("heuristic planner" / "Gemini planner"). */
  plannerName: string;
  requireApproval: boolean;
  agentRuns: Run[];
  onRun: () => void;
  onStop: () => void;
  onToggleUi: (v: UiVariant) => void;
  onOpenOutcome: (url: string) => void;
}

const DRIFT_TOOLTIP =
  "Configuration-drift detection, in seed form: every time a planned control no longer exists and is re-resolved by meaning, Synforma records a UI change event (screen, affected step, risk). Each change was re-verified by executing the workflow on the changed interface.";

function ChangesCounter({ count }: { count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex cursor-default items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", count ? "border-ink/20 bg-surface-2 text-ink" : "border-line text-slate")}
          data-testid="changes-counter"
          data-count={count}
        >
          <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
          {count} change{count === 1 ? "" : "s"} detected
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{DRIFT_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}

export function ActPanel({ state, program, uiVariant, uiBusy, plannerName, requireApproval, agentRuns, onRun, onStop, onToggleUi, onOpenOutcome }: Props) {
  const workflow = program.workflow;
  const parsed = program.parsed;
  const running = state.status === "running";
  const fieldReqs = parsed?.requirements.filter((r) => r.kind === "field") ?? [];
  const result = state.result;
  const metSet = new Set(result?.requirementsMet ?? []);
  const lastRun = agentRuns.length ? agentRuns[agentRuns.length - 1] : null;
  const canRun = Boolean(workflow && workflow.steps.length) && !running && !uiBusy;
  const changes = state.changes ?? [];

  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 5 · Act"
        title="Let Synforma perform the workflow"
        description={
          <>
            The agent executes the workflow inferred by the {plannerName} through the interaction layer. Commits are approval-gated; every action is audited. If the vendor changes the interface, controls are
            re-resolved by meaning rather than by selector.
          </>
        }
        aside={
          running ? (
            <Button variant="outline" size="sm" onClick={onStop} data-testid="stop-run">
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onRun} disabled={!canRun} data-testid="run-workflow">
          {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : state.status === "done" || lastRun ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
          {running ? "Running…" : state.status === "done" || lastRun ? "Run again" : "Run it"}
        </Button>
        <span className="inline-flex items-center gap-1 text-xs text-slate">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {requireApproval ? "Approval required before commit" : "Approval gate disabled in settings"}
        </span>
      </div>

      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="ui-v2" className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-slate" aria-hidden="true" />
              Simulate vendor UI update
              <Badge variant={uiVariant === "v2" ? "signal" : "muted"}>{uiVariant === "v2" ? "v2 active" : "v1"}</Badge>
            </Label>
            <p className="mt-1.5 text-xs leading-relaxed text-graphite">
              v2 renames fields (&ldquo;Funding stage&rdquo; → &ldquo;Budget confirmation&rdquo;), turns the Actions menu into a kebab called &ldquo;More options&rdquo;, moves the collapsible into a tab and changes every DOM id and
              class. A selector-based script breaks here. Synforma re-grounds each control by role, name and context, and reports every re-grounding as a self-healing event.
            </p>
          </div>
          <Switch id="ui-v2" checked={uiVariant === "v2"} onCheckedChange={(v) => onToggleUi(v ? "v2" : "v1")} disabled={running || uiBusy} data-testid="ui-v2-switch" />
        </div>
        {uiBusy ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Applying the UI version in the application…</p> : null}
      </div>

      {workflow && workflow.steps.length ? (
        <section className="space-y-2">
          <span className="eyebrow">Steps</span>
          <ol className="space-y-1" data-testid="act-steps">
            {workflow.steps.map((s) => {
              const st = state.stepStatus[s.id];
              const current = running && state.currentStepId === s.id;
              return (
                <li key={s.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-sm", current && "bg-surface-2")}>
                  {st === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-verdant" aria-hidden="true" />
                  ) : st === "failed" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
                  ) : current ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-mist" aria-hidden="true" />
                  )}
                  <span className={cn("min-w-0 flex-1 truncate", st || current ? "text-ink" : "text-graphite")}>
                    {s.index + 1}. {s.title}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-slate">{s.mode}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <Note tone="amber">The workflow has no steps. Go back to Understand and re-plan or edit the objective.</Note>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="eyebrow">Action log</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {state.regroundings ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-verdant-soft px-2 py-0.5 text-[11px] text-verdant">
                <Wrench className="h-3 w-3" aria-hidden="true" />
                {state.regroundings} self-healed
              </span>
            ) : null}
            {changes.length ? <ChangesCounter count={changes.length} /> : null}
          </div>
        </div>
        <LogView lines={state.log} height={running ? 260 : 200} emptyText="Actions will appear here as the agent performs them." className="act-log" />
      </section>

      {state.status === "error" ? <ErrorNote title="The run failed" body={state.error} action={<Button size="sm" variant="outline" onClick={onRun}>Run again</Button>} /> : null}
      {state.status === "stopped" ? <Note tone="amber">Run stopped by the operator before completion. It is recorded as abandoned.</Note> : null}

      {result && state.status === "done" ? (
        <section className="space-y-3 rounded-lg border border-line bg-surface p-4" data-testid="act-result">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Result</span>
              <OutcomeBadge outcome={result.outcome} />
              <ChangesCounter count={changes.length} />
            </div>
            <span className="mono-data text-[11px] text-slate">{state.runId}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Requirements" value={`${result.requirementsMet.length}/${fieldReqs.length}`} tone={result.requirementsMet.length === fieldReqs.length && fieldReqs.length > 0 ? "verdant" : "amber"} hint="verified on the outcome screen" />
            <Stat label="Duration" value={state.startedAt && state.endedAt ? formatDuration(state.endedAt - state.startedAt) : "—"} hint="including pacing" />
            <Stat label="Re-groundings" value={result.regroundings} tone={result.regroundings ? "verdant" : "ink"} hint={state.uiVariant ? `UI ${state.uiVariant}` : undefined} />
          </div>
          <ul className="space-y-1" data-testid="result-checklist">
            {fieldReqs.map((r) => {
              const met = metSet.has(r.id);
              return (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  {met ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-verdant" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />}
                  <span className={met ? "text-ink" : "text-graphite"}>{r.text}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-slate">{met ? "verified" : "not verified"}</span>
                </li>
              );
            })}
          </ul>
          {changes.length ? (
            <div className="space-y-1" data-testid="change-list">
              <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-slate">
                <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
                Changes detected · observed
              </div>
              <ul className="divide-y divide-line rounded-md border border-line text-xs">
                {changes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2.5 py-1.5">
                    <span className="mono-data text-slate">{c.screen ?? "unknown screen"}</span>
                    <span className="text-graphite">
                      &lsquo;{c.from}&rsquo; is now &lsquo;{c.to}&rsquo;
                    </span>
                    <span className={cn("ml-auto rounded-full border px-1.5 py-px text-[10.5px]", c.risk === "medium" || c.risk === "high" ? "border-amber/30 bg-amber-soft text-amber" : "border-line text-slate")}>{c.risk} risk</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate">Nothing was re-configured. Each change was re-resolved by meaning and re-verified by execution; this is the seed of configuration-drift detection.</p>
            </div>
          ) : null}
          {result.error ? <p className="text-xs text-signal">{result.error}</p> : null}
          {result.outcomeUrl ? (
            <Button variant="outline" size="sm" onClick={() => onOpenOutcome(result.outcomeUrl!)} data-testid="open-outcome">
              <ExternalLink aria-hidden="true" />
              Open the created record
            </Button>
          ) : null}
        </section>
      ) : null}

      {agentRuns.length ? (
        <section className="space-y-2">
          <span className="eyebrow">Agent runs · {agentRuns.length}</span>
          <ul className="divide-y divide-line rounded-lg border border-line text-xs">
            {agentRuns
              .slice()
              .reverse()
              .slice(0, 6)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="mono-data text-slate">{new Date(r.startedAt).toLocaleTimeString([], { hour12: false })}</span>
                  <OutcomeBadge outcome={r.outcome} />
                  <span className="text-graphite">
                    {r.requirementsMet.length}/{fieldReqs.length} requirements
                  </span>
                  {r.regroundings ? <span className="text-verdant">{r.regroundings} self-healed</span> : null}
                  {r.uiVariant ? <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-graphite">UI {r.uiVariant}</span> : null}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
