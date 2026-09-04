"use client";
import * as React from "react";
import { ExternalLink, Eye, Loader2, Play, Square, Users } from "lucide-react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { PERSONAS } from "@/lib/synforma/engine/synthetic";
import type { Program, Run, RunEvent } from "@/lib/synforma/types";
import { ActorBadge, EmptyState, ErrorNote, Note, OutcomeBadge, PanelHeader } from "../bits";

export interface SynthState {
  status: "idle" | "running" | "done" | "stopped" | "error";
  currentPersonaId: string | null;
  completed: number;
  error: string | null;
}

const STRUGGLE_EVENTS = new Set<RunEvent["type"]>(["hesitation", "validation_error", "action_failed", "run_abandoned", "backtrack", "wrong_screen"]);

interface Props {
  state: SynthState;
  program: Program;
  runs: Run[];
  events: RunEvent[];
  onRunSynthetic: () => void;
  onStop: () => void;
  onOpenRun: (run: Run) => void;
}

export function GuidePanel({ state, program, runs, events, onRunSynthetic, onStop, onOpenRun }: Props) {
  const running = state.status === "running";
  const fieldCount = program.parsed?.requirements.filter((r) => r.kind === "field").length ?? 0;
  const synthetic = runs.filter((r) => r.actor === "synthetic");
  const human = runs.filter((r) => r.actor === "human");
  const struggleCount = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) if (STRUGGLE_EVENTS.has(e.type)) map.set(e.runId, (map.get(e.runId) ?? 0) + 1);
    return map;
  }, [events]);
  const assistanceCount = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) if (e.type === "assistance_shown" || e.type === "assist_completed") map.set(e.runId, (map.get(e.runId) ?? 0) + 1);
    return map;
  }, [events]);
  const canRun = Boolean(program.workflow?.steps.length) && !running;

  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 6 · Guide & Observe"
        title="Guide people, observe struggle"
        description="In Guide mode Synforma never acts. It watches a person work in the application through the same semantic layer, keeps a live requirement checklist, and raises struggle signals — hesitation, validation errors, backtracking — for the adoption engine."
        aside={
          running ? (
            <Button variant="outline" size="sm" onClick={onStop} data-testid="stop-synthetic">
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href="/employee" target="_blank" rel="noreferrer" data-testid="open-employee">
            <ExternalLink aria-hidden="true" />
            Open employee view
          </a>
        </Button>
        <Button variant="outline" onClick={onRunSynthetic} disabled={!canRun} data-testid="run-synthetic">
          {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Users aria-hidden="true" />}
          {running ? "Simulating…" : synthetic.length ? "Run synthetic users again" : "Run synthetic users"}
        </Button>
      </div>
      <Note>The employee view opens in a new tab and shares this program. A human run recorded there appears below with the assistance that was shown.</Note>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Synthetic users · simulation</span>
          {running && state.currentPersonaId ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {PERSONAS.find((p) => p.id === state.currentPersonaId)?.name} ({state.completed}/{PERSONAS.length})
            </span>
          ) : null}
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PERSONAS.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                {running && state.currentPersonaId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink" aria-hidden="true" /> : null}
              </div>
              <p className="mt-0.5 text-xs text-graphite">{p.description}</p>
              <p className="mt-1 text-[11px] text-slate">
                {Object.entries(p.capabilities)
                  .filter(([, v]) => !v)
                  .map(([k]) => `no ${k}`)
                  .join(" · ") || "all capabilities"}
              </p>
            </li>
          ))}
        </ul>
        <Note tone="amber">A synthetic user is the real runner with capabilities switched off — a bounded agent with a specific limitation, not a model of a person. Its runs are labeled simulation everywhere and excluded from human timing.</Note>
      </section>

      {state.status === "error" ? <ErrorNote title="Simulation failed" body={state.error} action={<Button size="sm" variant="outline" onClick={onRunSynthetic}>Try again</Button>} /> : null}

      <section className="space-y-2">
        <span className="eyebrow">Results</span>
        {synthetic.length === 0 && human.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="No runs observed yet"
            body="Run synthetic users to simulate people with specific limitations, or open the employee view and complete the workflow yourself."
            action={
              <Button size="sm" onClick={onRunSynthetic} disabled={!canRun}>
                <Play aria-hidden="true" />
                Run synthetic users
              </Button>
            }
          />
        ) : (
          <Table data-testid="observe-results">
            <TableHeader>
              <TableRow>
                <TableHead>Actor</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Requirements</TableHead>
                <TableHead>Struggle</TableHead>
                <TableHead>Assistance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...synthetic, ...human]
                .sort((a, b) => b.startedAt - a.startedAt)
                .map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpenRun(r)}>
                    <TableCell>
                      <ActorBadge actor={r.actor} persona={r.persona} />
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={r.outcome} />
                    </TableCell>
                    <TableCell className="mono-data">
                      {r.requirementsMet.length}/{fieldCount}
                    </TableCell>
                    <TableCell className="mono-data">{struggleCount.get(r.id) ?? 0}</TableCell>
                    <TableCell className="mono-data">{r.actor === "human" ? (assistanceCount.get(r.id) ?? 0) : <span className="text-mist">—</span>}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
