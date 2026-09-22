"use client";
import * as React from "react";
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Compass, Loader2, Play, RotateCcw, ShieldCheck, Square, Undo2, Wrench, XCircle } from "lucide-react";
import { Badge, Button, Input, Label, Textarea } from "@/components/ui";
import type { Program } from "@/lib/synforma/types";
import { cn, formatDuration } from "@/lib/utils";
import { ChangeList, ErrorNote, LogView, ModeBadge, Note, OutcomeBadge, PanelSkeleton, TrustStopCard } from "./bits";
import { useMissionSession } from "./session/context";
import { TargetPicker } from "./target-picker";
import type { ActState } from "./phases/act-panel";

/**
 * The one-screen view of Mission Control: three stages next to the live sandbox,
 * each with one primary action. Every action calls the same session functions the
 * advanced view uses; nothing here talks to the engine directly.
 */

function Stage({ n, title, done, aside, testId, children }: { n: number; title: string; done: boolean; aside?: React.ReactNode; testId: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4" data-testid={testId} data-done={done}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums", done ? "border-ink bg-ink text-paper" : "border-line-strong text-graphite")}
          aria-hidden="true"
        >
          {done ? <Check className="h-3 w-3" /> : n}
        </span>
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {aside ? <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ConnectStage() {
  const { ready, connection, target, targets, setTarget, program } = useMissionSession();
  const { status, error, connect } = connection;
  // Connects automatically once the store is ready and nothing has been connected yet.
  React.useEffect(() => {
    if (!ready || status !== "idle") return;
    void connect(target);
  }, [ready, status, connect, target]);
  const aside =
    status === "connected" ? (
      <Badge variant="verdant" data-testid="simple-connect-status">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Connected
      </Badge>
    ) : status === "connecting" || status === "idle" ? (
      <Badge variant="muted" data-testid="simple-connect-status">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Connecting…
      </Badge>
    ) : (
      <Badge variant="signal" data-testid="simple-connect-status">
        Not connected
      </Badge>
    );
  return (
    <Stage n={1} title="Connect" done={status === "connected"} aside={aside} testId="simple-connect">
      <TargetPicker targets={targets} value={target.id} onChange={setTarget} locked={Boolean(program)} compact />
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-ink">{target.name}</span>
        <span className="text-slate">v{target.version}</span>
        <span className="mono-data min-w-0 truncate text-[11px] text-slate">{target.baseUrl}</span>
      </div>
      <p className="text-[11px] text-slate">{target.replicaNote}</p>
      <p className="text-xs leading-relaxed text-graphite">No connector, no selectors. Synforma reads the interface through the same generic semantics a screen reader uses.</p>
      {status === "error" ? (
        <ErrorNote
          title="Could not connect"
          body={error ?? "The application did not load."}
          action={
            <Button size="sm" variant="outline" onClick={() => void connect(target)}>
              Try again
            </Button>
          }
        />
      ) : null}
    </Stage>
  );
}

function ProgressLine({ program }: { program: Program | null }) {
  const { discovery, plannerName, deciderLabel } = useMissionSession();
  const d = discovery.state;
  const c = d.counters;
  const n = (v: number) => <span className="mono-data text-ink">{v}</span>;
  const spinner = <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin align-[-2px]" aria-hidden="true" />;
  if (d.status === "running")
    return (
      <p className="text-xs leading-relaxed text-graphite" data-testid="simple-progress" data-stage="discovering">
        {spinner}
        Exploring · {n(c.screens)} screens found · {n(c.actions)} actions · {n(c.fields)} fields
      </p>
    );
  if (d.status === "planning")
    return (
      <p className="text-xs leading-relaxed text-graphite" data-testid="simple-progress" data-stage="planning">
        {spinner}
        {n(c.screens)} screens found · {n(c.actions)} actions · {n(c.fields)} fields · planning with the {plannerName}…
      </p>
    );
  const workflow = program?.workflow;
  const disc = program?.discovery;
  if (workflow)
    return (
      <p className="text-xs leading-relaxed text-graphite" data-testid="simple-progress" data-stage="planned">
        {disc ? (
          <>
            {n(disc.screens)} screens · {n(disc.actions)} actions · {n(disc.fields)} fields <span className="text-mist">→</span>{" "}
          </>
        ) : null}
        {n(workflow.steps.length)} steps · {plannerName}
        {deciderLabel ? (
          <>
            {" "}· decisions by <span title={deciderLabel}>Jev</span>
          </>
        ) : null}
      </p>
    );
  return null;
}

function ObjectiveStage({ program }: { program: Program | null }) {
  const { connection, discovery, context, act, synth, uiBusy, target } = useMissionSession();
  const [text, setText] = React.useState(program?.objectiveText ?? target.objective);
  const [ctx, setCtx] = React.useState<Record<string, string>>(context);
  const [details, setDetails] = React.useState(false);
  const busy = discovery.state.status === "running" || discovery.state.status === "planning";
  const engineBusy = busy || act.state.status === "running" || synth.state.status === "running" || uiBusy;
  const valid = text.trim().length > 10;
  const workflow = program?.workflow;
  const planned = Boolean(workflow);
  const stepStatus = act.state.stepStatus;
  const running = act.state.status === "running";
  return (
    <Stage n={2} title="Objective" done={planned} testId="simple-objective" aside={planned ? <Badge variant="muted">{program?.status === "active" ? "approved" : "planned"}</Badge> : null}>
      <div className="space-y-1.5">
        <Label htmlFor="simple-objective-text" className="sr-only">
          Objective
        </Label>
        <Textarea id="simple-objective-text" value={text} onChange={(e) => setText(e.target.value)} rows={planned ? 4 : 7} className="font-sans text-[13px] leading-relaxed" aria-invalid={!valid} disabled={busy} data-testid="simple-objective-text" />
        {!valid ? <p className="text-xs text-signal">Describe the objective in at least one sentence.</p> : null}
      </div>
      <div>
        <button type="button" onClick={() => setDetails((o) => !o)} className="inline-flex items-center gap-1 text-xs text-slate hover:text-ink" aria-expanded={details} data-testid="simple-objective-details">
          {details ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
          Details
        </button>
        {details ? (
          <fieldset className="mt-2 space-y-2" disabled={busy}>
            <p className="text-[11px] text-slate">Work context Synforma may use when acting on behalf of a person. Judgment fields are never guessed from these.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {target.contextFields.map((f) => (
                <div key={f.key} className="min-w-0 space-y-1">
                  <Label htmlFor={`simple-ctx-${f.key}`} className="text-xs">
                    {f.label}
                  </Label>
                  <Input id={`simple-ctx-${f.key}`} value={ctx[f.key] ?? ""} onChange={(e) => setCtx((c) => ({ ...c, [f.key]: e.target.value }))} className={cn("h-8 text-xs", f.key === "entryUrl" && "mono-data")} />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void discovery.start(text, ctx, "discover")} disabled={!valid || engineBusy || !connection.connected} data-testid="simple-discover">
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : planned ? <RotateCcw aria-hidden="true" /> : <Compass aria-hidden="true" />}
          {busy ? (discovery.state.status === "planning" ? "Planning…" : "Discovering…") : "Discover and plan"}
        </Button>
        {discovery.state.status === "running" ? (
          <Button variant="outline" size="sm" onClick={discovery.stop} data-testid="simple-stop-discovery">
            <Square aria-hidden="true" />
            Stop
          </Button>
        ) : null}
      </div>
      <ProgressLine program={program} />
      {discovery.state.status === "error" ? <ErrorNote title="Discovery failed" body={discovery.state.error} /> : null}
      {workflow && workflow.steps.length ? (
        <ol className="space-y-1" data-testid="simple-steps">
          {workflow.steps.map((s) => {
            const st = stepStatus[s.id];
            const current = running && act.state.currentStepId === s.id;
            return (
              <li key={s.id} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-sm", current && "bg-surface-2")}>
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
                <ModeBadge mode={s.mode} className="shrink-0" />
              </li>
            );
          })}
        </ol>
      ) : workflow ? (
        <Note tone="amber">The workflow has no steps. Edit the objective and discover again.</Note>
      ) : null}
    </Stage>
  );
}

function ResultCard({ program, state }: { program: Program; state: ActState }) {
  const s = useMissionSession();
  const { act, trust, uiVariant, uiBusy, programLedger, toggleUi, undoLedger, reviewEvidence, setDemoView, deciderLabel } = s;
  const result = state.result!;
  const running = act.state.status === "running";
  const fieldReqs = program.parsed?.requirements.filter((r) => r.kind === "field") ?? [];
  const reversible = programLedger.filter((e) => e.rollback.possible && !e.rolledBackAt).length;
  const changes = state.changes ?? [];
  const stoppedStep = state.trustStop?.stepId ? program.workflow?.steps.find((x) => x.id === state.trustStop!.stepId) : undefined;
  const openEvidence = () => {
    reviewEvidence();
    setDemoView("advanced");
  };
  return (
    <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3" data-testid="simple-result" data-outcome={result.outcome}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <OutcomeBadge outcome={result.outcome} />
        <span className="text-ink">
          <span className="mono-data">
            {result.requirementsMet.length}/{fieldReqs.length}
          </span>{" "}
          requirements verified
        </span>
        <span className="text-xs text-slate">
          · <span className="mono-data">{result.regroundings}</span> re-grounding{result.regroundings === 1 ? "" : "s"}
          {result.decisions?.asked ? (
            <>
              {" "}
              ·{" "}
              <span className="mono-data" data-testid="simple-decisions" data-asked={result.decisions.asked} data-accepted={result.decisions.accepted}>
                {result.decisions.accepted}/{result.decisions.asked}
              </span>{" "}
              Jev decision{result.decisions.asked === 1 ? "" : "s"} used
            </>
          ) : null}
          {state.startedAt && state.endedAt ? ` · ${formatDuration(state.endedAt - state.startedAt)}` : ""}
          {state.uiVariant ? ` · UI ${state.uiVariant}` : ""}
        </span>
      </div>
      {result.error ? <p className="text-xs text-signal">{result.error}</p> : null}
      {changes.length ? (
        <div className="space-y-1.5" data-testid="simple-self-healed" data-count={changes.length}>
          <div className="inline-flex items-center gap-1 text-xs font-medium text-verdant">
            <Wrench className="h-3 w-3" aria-hidden="true" />
            Self-healed {changes.length} change{changes.length === 1 ? "" : "s"}
          </div>
          <ChangeList changes={changes} />
          <p className="text-[11px] text-slate">
            The vendor renamed these controls. Each was re-resolved by meaning and re-verified by execution; nothing was re-configured.
            {changes.some((c) => c.decidedBy) ? ` Where the lexical rules were unsure, ${deciderLabel ?? "the decision model"} chose, with the probability shown.` : ""}
          </p>
        </div>
      ) : null}
      {state.trustStop ? <TrustStopCard trustStop={state.trustStop} step={stoppedStep} onReviewEvidence={openEvidence} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void undoLedger()} disabled={!reversible || trust.undoing || running} title={reversible ? undefined : "Nothing reversible in the ledger"} data-testid="simple-undo">
          {trust.undoing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
          Undo
        </Button>
        {uiVariant === "v1" ? (
          <Button size="sm" variant="outline" onClick={() => void toggleUi("v2")} disabled={running || uiBusy} data-testid="simple-vendor-update">
            {uiBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Wrench aria-hidden="true" />}
            Vendor update
          </Button>
        ) : (
          <>
            <Badge variant="signal" data-testid="simple-ui-variant">
              UI v2 active
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => void toggleUi("v1")} disabled={running || uiBusy} data-testid="simple-vendor-revert">
              Revert to v1
            </Button>
          </>
        )}
      </div>
      {uiVariant === "v2" && state.uiVariant !== "v2" ? (
        <p className="text-[11px] text-slate">The vendor renamed fields, moved the menu into a kebab and changed every DOM id. Run again: Synforma re-grounds each control by meaning and reports every change.</p>
      ) : null}
    </div>
  );
}

function RunStage({ program }: { program: Program | null }) {
  const { act, connection, discovery, synth, uiBusy, trust, settings, programRuns, approveProgram } = useMissionSession();
  const state = act.state;
  const running = state.status === "running";
  const workflow = program?.workflow;
  const agentRuns = programRuns.filter((r) => r.actor === "agent");
  const hasRun = state.status === "done" || agentRuns.length > 0;
  const engineBusy = discovery.state.status === "running" || discovery.state.status === "planning" || synth.state.status === "running" || uiBusy;
  const canRun = Boolean(workflow && workflow.steps.length) && connection.connected && !running && !engineBusy && !trust.undoing;
  const onRun = () => {
    // Running is the operator's approval of the plan: the program becomes active, as "Approve program" does in the advanced view.
    approveProgram();
    void act.run();
  };
  const done = agentRuns.some((r) => r.outcome === "completed");
  return (
    <Stage
      n={3}
      title="Run"
      done={done}
      testId="simple-run-stage"
      aside={
        running ? (
          <Button variant="outline" size="sm" onClick={act.stop} data-testid="simple-stop">
            <Square aria-hidden="true" />
            Stop
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onRun} disabled={!canRun} data-testid="simple-run">
          {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : hasRun ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
          {running ? "Running…" : hasRun ? "Run again" : "Run it"}
        </Button>
        <span className="inline-flex items-center gap-1 text-xs text-slate">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {settings.requireApprovalForCommit ? "Approval required before commit" : "Approval gate disabled in settings"}
        </span>
      </div>
      <LogView lines={state.log} height={running ? 220 : 160} emptyText={workflow ? "Actions will appear here as the agent performs them." : "Discover and plan first."} className="act-log" />
      {state.status === "error" ? <ErrorNote title="The run failed" body={state.error} /> : null}
      {state.status === "stopped" ? <Note tone="amber">Run stopped by the operator before completion. It is recorded as abandoned.</Note> : null}
      {program && state.result && state.status === "done" ? <ResultCard program={program} state={state} /> : null}
    </Stage>
  );
}

function TrustLine({ program }: { program: Program | null }) {
  const { trust, reviewEvidence, setDemoView } = useMissionSession();
  const claims = trust.claims.filter((c) => c.status !== "retired").length;
  const contested = trust.claims.filter((c) => c.status === "contested").length;
  const contract = trust.contract;
  const openDetails = () => {
    if (program?.workflow) reviewEvidence();
    setDemoView("advanced");
  };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-slate" data-testid="simple-trust-line" data-claims={claims} data-contested={contested}>
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        Evidence: <span className="mono-data text-ink">{claims}</span> claims · <span className={cn("mono-data", contested ? "text-signal" : "text-ink")}>{contested}</span> contested · Contract {contract ? `v${contract.version} ${contract.approvedAt ? "approved" : "pending"}` : "pending"}
      </span>
      <button type="button" onClick={openDetails} className="ml-auto inline-flex items-center gap-1 text-xs text-ink underline-offset-4 hover:underline" data-testid="simple-details">
        Details
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The target's presenter lines, one per scene, for a five-minute walkthrough. Collapsed by default. */
function PresenterNotes() {
  const { target, act, discovery } = useMissionSession();
  const [open, setOpen] = React.useState(false);
  const scene = act.state.status === "running" || act.state.result ? (act.state.regroundings > 0 ? 4 : 3) : discovery.state.status === "done" ? 2 : 0;
  return (
    <div className="rounded-lg border border-line bg-surface" data-testid="presenter-notes" data-open={open ? "true" : "false"}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate hover:text-ink" aria-expanded={open} data-testid="presenter-notes-toggle">
        <span>Presenter notes · {target.name}</span>
        {open ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
      </button>
      {open ? (
        <ol className="space-y-1.5 border-t border-line px-3 py-2.5">
          {target.script.map((line, i) => (
            <li key={i} className={cn("flex gap-2 text-[12px] leading-snug", i === scene ? "text-ink" : "text-slate")} data-testid="presenter-note" data-current={i === scene ? "true" : "false"}>
              <span className={cn("mono-data shrink-0 text-[10px]", i === scene ? "text-ink" : "text-mist")}>{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function SimpleView() {
  const { ready, program } = useMissionSession();
  if (!ready) return <PanelSkeleton />;
  return (
    <div className="space-y-3 p-4 sm:p-5" data-testid="simple-view">
      <ConnectStage />
      <ObjectiveStage key={program?.id ?? "new"} program={program} />
      <RunStage program={program} />
      <TrustLine program={program} />
      <PresenterNotes />
    </div>
  );
}
