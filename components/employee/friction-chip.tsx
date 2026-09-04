"use client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { FRICTION_LABEL, FRICTION_SHORT } from "@/lib/synforma/engine/friction";
import type { FrictionInference } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";

/**
 * The observer's current interaction-state hypothesis. Calm by design: the only
 * accent is for error recovery. Never an emotion, never a trait.
 */
export function FrictionChip({ friction }: { friction: FrictionInference | null }) {
  if (!friction) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide text-slate" data-testid="friction-chip" data-state="none">
        <span className="h-1.5 w-1.5 rounded-full bg-mist" aria-hidden="true" />
        Observing
      </span>
    );
  }
  const alarm = friction.state === "ERROR_RECOVERY";
  const calm = friction.state === "FLUENT" || friction.state === "UNKNOWN";
  const pct = Math.round(friction.confidence * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide",
            alarm ? "border-transparent bg-signal-soft text-signal" : "border-line bg-surface text-graphite",
          )}
          data-testid="friction-chip"
          data-state={friction.state}
          aria-label={`Interaction state: ${FRICTION_SHORT[friction.state]}, ${pct}% confidence`}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", alarm ? "bg-signal" : calm ? "bg-mist" : "bg-graphite")} aria-hidden="true" />
          {FRICTION_SHORT[friction.state]}
          <span className={cn("mono-data", alarm ? "text-signal/80" : "text-slate")}>{pct}%</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[300px] leading-relaxed" data-testid="friction-tooltip">
        <p className="font-medium">{FRICTION_LABEL[friction.state]}</p>
        <p className="mt-1 text-paper/70">
          Hypothesis · {pct}% · <span className="mono-data">{friction.ruleVersion}</span>
        </p>
        {friction.evidence.length ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {friction.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
        {friction.alternatives.length ? (
          <p className="mt-1.5 text-paper/70">Alternatives: {friction.alternatives.map((a) => `${FRICTION_SHORT[a.state]} ${Math.round(a.confidence * 100)}%`).join(", ")}</p>
        ) : null}
        <p className="mt-1.5 text-paper/70">An interaction state inferred from the interface and interaction aggregates. Never an emotion or a trait.</p>
      </TooltipContent>
    </Tooltip>
  );
}
