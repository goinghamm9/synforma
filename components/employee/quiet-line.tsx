"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FRICTION_SHORT } from "@/lib/synforma/engine/friction";
import { DO_NOTHING_ID, TECHNIQUE_BY_ID } from "@/lib/synforma/science/techniques";
import { cn } from "@/lib/utils";
import type { QuietDecision } from "./use-guide-run";

/**
 * A decision in which DO_NOTHING won. Shown discreetly so the person can see
 * that Synforma noticed something and chose not to interrupt, and why.
 */
export function QuietLine({ quiet }: { quiet: QuietDecision }) {
  const [open, setOpen] = useState(false);
  const label = quiet.frictionState ? FRICTION_SHORT[quiet.frictionState] : "a pause";
  const confidence = quiet.confidence !== null ? ` (${Math.round(quiet.confidence * 100)}%)` : "";
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-slate" data-testid="quiet-line" data-state={quiet.frictionState ?? "none"} role="status">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Synforma stayed quiet — {label}
          {confidence}.
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex cursor-pointer items-center gap-0.5 font-medium text-graphite hover:text-ink"
          data-testid="quiet-why"
        >
          Why?
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="mt-2 rounded-md border border-line bg-surface-2/60 p-2.5" data-testid="quiet-why-content">
          <p className="eyebrow">Candidates considered</p>
          <ol className="mt-1 space-y-0.5" aria-label="Top candidates and scores">
            {quiet.candidates.map((c) => (
              <li key={c.techniqueId} className="flex items-center justify-between gap-3">
                <span className={c.techniqueId === DO_NOTHING_ID ? "font-medium text-ink" : "text-graphite"}>{TECHNIQUE_BY_ID[c.techniqueId]?.name ?? c.techniqueId}</span>
                <span className="mono-data text-slate">{c.total.toFixed(3)}</span>
              </li>
            ))}
          </ol>
          {quiet.reason ? <p className="mt-1.5 text-slate">{quiet.reason}</p> : null}
          <p className="mt-1.5 text-[11px] text-mist">Doing nothing is a first-class outcome. Every quiet decision is recorded so false interventions can be measured.</p>
        </div>
      ) : null}
    </div>
  );
}
