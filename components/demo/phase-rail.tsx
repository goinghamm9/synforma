"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASES, PHASE_INDEX, type PhaseId } from "./types";

interface Props {
  current: PhaseId;
  completed: Set<PhaseId>;
  /** Highest phase index the operator may open. */
  maxIndex: number;
  onSelect: (id: PhaseId) => void;
}

export function PhaseRail({ current, completed, maxIndex, onSelect }: Props) {
  return (
    <nav aria-label="Phases" className="scrollbar-thin overflow-x-auto border-b border-line bg-surface">
      <ol className="flex min-w-max items-stretch px-2">
        {PHASES.map((p, i) => {
          const isCurrent = p.id === current;
          const done = completed.has(p.id);
          const reachable = i <= maxIndex;
          return (
            <li key={p.id} className="flex items-center">
              <button
                type="button"
                onClick={() => reachable && onSelect(p.id)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "group flex h-11 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors",
                  reachable ? "cursor-pointer hover:bg-surface-2" : "cursor-not-allowed",
                  isCurrent ? "text-ink" : reachable ? "text-graphite" : "text-mist",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums",
                    done && !isCurrent && "border-ink bg-ink text-paper",
                    isCurrent && "border-ink bg-surface text-ink ring-2 ring-ink/15",
                    !done && !isCurrent && (reachable ? "border-line-strong text-graphite" : "border-line text-mist"),
                  )}
                  aria-hidden="true"
                >
                  {done && !isCurrent ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn("whitespace-nowrap", isCurrent && "font-medium")}>
                  <span className="hidden sm:inline">{p.label}</span>
                  <span className="sm:hidden">{p.short}</span>
                </span>
              </button>
              {i < PHASES.length - 1 ? <span className={cn("mx-0.5 h-px w-4 sm:w-6", i < PHASE_INDEX[current] ? "bg-ink/50" : "bg-line-strong")} aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
