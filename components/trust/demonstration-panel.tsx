"use client";
import * as React from "react";
import { Circle, MousePointerClick, Navigation, PenLine, Square } from "lucide-react";
import { Button } from "@/components/ui";
import type { Reconstruction, TraceEvent } from "@/lib/synforma/engine/demonstration";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./tone-badge";
import { formatTime } from "./trust-tone";

export type DemonstrationStatus = "idle" | "recording" | "reconstructed" | "adopted";

/**
 * Teach Synforma by doing: an expert performs the workflow once. Synforma
 * records which controls were used (never what was typed), reconstructs a
 * versioned workflow, and asks a few questions instead of guessing.
 */
export function DemonstrationPanel({
  status,
  trace,
  reconstruction,
  answers,
  onStart,
  onStop,
  onAnswer,
  onAdopt,
  onDiscard,
  busy = false,
}: {
  status: DemonstrationStatus;
  trace: TraceEvent[];
  reconstruction: Reconstruction | null;
  answers: Record<string, string>;
  onStart: () => void;
  onStop: () => void;
  onAnswer: (questionId: string, option: string) => void;
  onAdopt: () => void;
  onDiscard: () => void;
  busy?: boolean;
}) {
  const actions = trace.filter((e) => e.kind !== "navigate");
  const allAnswered = reconstruction ? reconstruction.questions.every((q) => answers[q.id]) : false;
  return (
    <div className="space-y-4" data-testid="demonstration-panel" data-status={status}>
      {status === "idle" ? (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="eyebrow">Teach by doing</div>
          <p className="mt-2 text-sm text-ink">Perform the workflow in the application the way you normally would. Synforma records which controls you use and on which screen, not what you type. Then it reconstructs the workflow and asks up to three questions about your decisions.</p>
          <Button className="mt-3" onClick={onStart} disabled={busy}>
            <Circle className="fill-signal text-signal" /> Start demonstration
          </Button>
        </div>
      ) : null}

      {status === "recording" ? (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-ink">
              <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-signal" /> Recording your demonstration
            </div>
            <Button size="sm" onClick={onStop} disabled={busy}>
              <Square /> Stop and reconstruct
            </Button>
          </div>
          <TraceList trace={trace} />
        </div>
      ) : null}

      {(status === "reconstructed" || status === "adopted") && reconstruction ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="eyebrow">Reconstructed workflow</div>
              <ToneBadge tone="amber">
                v{reconstruction.workflow.version} · {status === "adopted" ? "adopted" : "awaiting your confirmation"}
              </ToneBadge>
            </div>
            <p className="mt-2 text-sm text-ink">{reconstruction.summary}</p>
            <ol className="mt-3 space-y-1.5">
              {reconstruction.workflow.steps.map((s) => (
                <li key={s.id} className="flex gap-2 text-[13px]">
                  <span className="mono-data w-5 shrink-0 text-slate">{s.index + 1}</span>
                  <div className="min-w-0">
                    <span className="text-ink">{s.title}</span>
                    <span className="ml-2 text-[11px] uppercase tracking-wide text-slate">{s.mode}{s.commit ? " · commit" : ""}{s.judgment ? " · judgment" : ""}</span>
                    <div className="truncate text-[12px] text-graphite">{s.actions.map((a) => a.label).join(" · ")}</div>
                  </div>
                </li>
              ))}
            </ol>
            {reconstruction.deviations.length ? (
              <div className="mt-3 rounded-md border border-amber/40 bg-amber-soft/40 p-2 text-[12px] text-amber">
                <div className="font-medium">Differences from the planned workflow</div>
                <ul className="mt-1 list-disc pl-4 text-graphite">
                  {reconstruction.deviations.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {reconstruction.questions.length ? (
            <div className="rounded-lg border border-line bg-surface p-4" data-testid="clarification-questions">
              <div className="eyebrow">A few questions</div>
              <ul className="mt-2 space-y-3">
                {reconstruction.questions.map((q) => (
                  <li key={q.id}>
                    <div className="text-[13px] text-ink">{q.question}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={q.question}>
                      {q.options.map((o) => (
                        <button
                          key={o}
                          type="button"
                          role="radio"
                          aria-checked={answers[q.id] === o}
                          disabled={status === "adopted"}
                          onClick={() => onAnswer(q.id, o)}
                          className={cn("rounded-md border px-2.5 py-1 text-[12px] transition-colors", answers[q.id] === o ? "border-ink bg-ink text-paper" : "border-line-strong text-graphite hover:bg-surface-2")}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {status === "reconstructed" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onAdopt} disabled={busy || !allAnswered} title={!allAnswered ? "Answer the questions first" : undefined} data-testid="adopt-workflow">
                Adopt as workflow v{reconstruction.workflow.version}
              </Button>
              <Button variant="ghost" onClick={onDiscard} disabled={busy}>
                Discard
              </Button>
              <span className="text-[11px] text-slate">Adopting records a new version with your answers; the previous version stays in the changelog.</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {status !== "idle" && status !== "recording" && actions.length ? (
        <details className="rounded-lg border border-line bg-surface p-3">
          <summary className="cursor-pointer text-[12px] text-slate">What was recorded ({actions.length} actions, no typed values)</summary>
          <TraceList trace={trace} />
        </details>
      ) : null}
    </div>
  );
}

function TraceList({ trace }: { trace: TraceEvent[] }) {
  const items = trace.slice(-30);
  return (
    <ul className="mt-3 max-h-56 space-y-1 overflow-auto text-[12px] scrollbar-thin" data-testid="trace-list">
      {items.length === 0 ? <li className="text-slate">Waiting for your first action…</li> : null}
      {items.map((e, i) => (
        <li key={i} className="flex items-center gap-2 text-graphite">
          <span className="mono-data w-16 shrink-0 text-slate">{formatTime(e.t)}</span>
          {e.kind === "navigate" ? <Navigation className="h-3 w-3 shrink-0 text-slate" /> : e.kind === "change" ? <PenLine className="h-3 w-3 shrink-0 text-slate" /> : <MousePointerClick className="h-3 w-3 shrink-0 text-slate" />}
          <span className="min-w-0 truncate">
            {e.kind === "navigate" ? `Opened ${e.stateLabel}` : e.kind === "change" ? `Changed "${e.name}"` : `Clicked "${e.name}"`}
            <span className="text-slate"> · {e.stateLabel}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
