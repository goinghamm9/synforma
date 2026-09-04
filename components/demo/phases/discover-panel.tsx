"use client";
import * as React from "react";
import { ArrowRight, Loader2, Play, Square } from "lucide-react";
import { Badge, Button, Label, Progress, Switch } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import type { Program, WorkGraph } from "@/lib/synforma/types";
import type { ExploreStats } from "@/lib/synforma/engine/explorer";
import type { LogLine } from "../types";
import { ErrorNote, LogView, Note, PanelHeader, Stat } from "../bits";
import { GraphCounts, GraphPreview } from "../graph-preview";

export interface DiscoveryCounters {
  screens: number;
  actions: number;
  fields: number;
  objects: number;
  states: number;
}

export interface DiscoveryState {
  status: "idle" | "running" | "planning" | "done" | "error";
  log: LogLine[];
  counters: DiscoveryCounters;
  stats: ExploreStats | null;
  error: string | null;
  startedAt: number | null;
  planned: { mapped: number; total: number; steps: number } | null;
}

interface Props {
  state: DiscoveryState;
  program: Program | null;
  liveGraph: WorkGraph | null;
  plannerLabel: string;
  /** True while the engine is driving the iframe (crawl, run, simulation). */
  engineBusy: boolean;
  onStop: () => void;
  onRestart: () => void;
  onContinue: () => void;
}

export function DiscoverPanel({ state, program, liveGraph, plannerLabel, engineBusy, onStop, onRestart, onContinue }: Props) {
  const running = state.status === "running";
  // The WebGL render loop competes with the same-origin iframe for the main thread and can starve the
  // target application while the crawler waits for it to settle, so the 3D view is opt-in while busy.
  const [threeDWhileBusy, setThreeDWhileBusy] = React.useState(false);
  const show3D = !engineBusy || threeDWhileBusy;
  const planning = state.status === "planning";
  const interrupted = state.status === "idle" && program?.status === "discovering";
  const finished = state.status === "done" || (state.status === "idle" && Boolean(program?.discovery?.endedAt) && program?.status !== "discovering");
  const c = state.counters;
  const disc = program?.discovery;
  const counters = running || planning || state.status === "done" ? c : disc ? { screens: disc.screens, actions: disc.actions, fields: disc.fields, objects: disc.objects, states: disc.statesVisited } : c;
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (!running || !state.startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - state.startedAt!), 500);
    return () => clearInterval(id);
  }, [running, state.startedAt]);

  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 3 · Discover"
        title={running ? "Exploring the application" : planning ? "Inferring the workflow" : finished ? "Discovery complete" : "Discovery"}
        description="Synforma crawls links, menus, tabs, disclosures and multi-step forms, and records what it finds in the Work Graph. Watch the workspace on the left."
        aside={
          running ? (
            <Button variant="outline" size="sm" onClick={onStop} data-testid="stop-discovery">
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : null
        }
      />

      <Note tone="amber">Discovery never commits. Create, submit and delete controls are recorded but never executed.</Note>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Screens" value={counters.screens} />
        <Stat label="Actions" value={counters.actions} />
        <Stat label="Fields" value={counters.fields} />
        <Stat label="Objects" value={counters.objects} />
        <Stat label="States" value={counters.states} />
      </div>

      {running ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Crawling · {formatDuration(elapsed)} elapsed
            </span>
            <span>state limit 40 · time budget 2m</span>
          </div>
          <Progress value={Math.min(95, (counters.states / 40) * 100)} />
        </div>
      ) : null}

      {planning ? (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Parsing the objective and mapping requirements to fields with the {plannerLabel.toLowerCase()}…
        </div>
      ) : null}

      {state.status === "error" ? <ErrorNote title="Discovery failed" body={state.error} action={<Button size="sm" variant="outline" onClick={onRestart}>Retry discovery</Button>} /> : null}

      {interrupted ? (
        <ErrorNote
          title="Discovery was interrupted"
          body="The page was reloaded while Synforma was still exploring. Nothing was committed; run discovery again to continue."
          action={
            <Button size="sm" onClick={onRestart}>
              <Play aria-hidden="true" />
              Restart discovery
            </Button>
          }
        />
      ) : null}

      {liveGraph ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">Work Graph · live</span>
            <span className="mono-data text-[11px] text-slate">
              {liveGraph.nodes.length} nodes · {liveGraph.edges.length} edges
            </span>
          </div>
          {show3D ? (
            <GraphPreview graph={liveGraph} height={240} />
          ) : (
            <div style={{ height: 120 }}>
              <GraphCounts graph={liveGraph} note="3D view resumes when Synforma is idle" />
            </div>
          )}
          {engineBusy ? (
            <div className="flex items-center justify-between gap-3 text-[11px] text-slate">
              <Label htmlFor="three-d-while-busy" className="text-[11px] font-normal text-slate">
                Render the 3D graph while crawling (can slow the target application on machines without GPU acceleration)
              </Label>
              <Switch id="three-d-while-busy" checked={threeDWhileBusy} onCheckedChange={setThreeDWhileBusy} className="scale-90" />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <span className="eyebrow">Discovery log</span>
        <LogView lines={state.log} height={running ? 260 : 200} emptyText={finished ? "Log from the previous session is not retained; the Work Graph and discovery states are." : "Waiting for discovery to start."} />
      </section>

      {finished ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="verdant">Discovered</Badge>
            {state.stats ? (
              <span className="text-graphite">
                {state.stats.statesVisited} states in {formatDuration(state.stats.durationMs)} · stopped by {state.stats.stoppedBy.replace("-", " ")}
              </span>
            ) : disc?.endedAt ? (
              <span className="text-graphite">
                {disc.statesVisited} states in {formatDuration(disc.endedAt - disc.startedAt)}
              </span>
            ) : null}
          </div>
          {state.planned ? (
            <div className="text-sm text-graphite">
              {plannerLabel}: mapped <span className="mono-data text-ink">{state.planned.mapped}</span> of <span className="mono-data text-ink">{state.planned.total}</span> field requirements into a workflow of{" "}
              <span className="mono-data text-ink">{state.planned.steps}</span> steps.
            </div>
          ) : null}
          {program?.status === "understood" || program?.status === "active" ? (
            <Button onClick={onContinue} data-testid="continue-understand">
              Review what Synforma understood
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="outline" onClick={onRestart}>
              <Play aria-hidden="true" />
              Run discovery again
            </Button>
          )}
        </section>
      ) : null}
    </div>
  );
}
