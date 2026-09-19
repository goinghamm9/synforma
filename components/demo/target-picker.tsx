"use client";
import * as React from "react";
import { Check } from "lucide-react";
import type { TargetApp } from "@/lib/synforma/targets";
import { cn } from "@/lib/utils";

/**
 * Choose the application the next program runs against. Every option is a
 * fictional replica built for the demonstration; the note under each name says
 * so. Locked while a program exists: Start over first.
 */
export function TargetPicker({ targets, value, onChange, locked, compact }: { targets: readonly TargetApp[]; value: string; onChange: (id: string) => void; locked: boolean; compact?: boolean }) {
  return (
    <div className="space-y-1.5" data-testid="target-picker" data-locked={locked ? "true" : "false"}>
      <div role="radiogroup" aria-label="Target application" className={cn("grid gap-1.5", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
        {targets.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked && !selected}
              onClick={() => !locked && onChange(t.id)}
              data-target={t.id}
              className={cn(
                "flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                selected ? "border-ink bg-surface-2" : "border-line bg-surface hover:bg-surface-2",
                locked && !selected && "cursor-not-allowed opacity-50",
              )}
            >
              <span className={cn("mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border", selected ? "border-ink bg-ink text-paper" : "border-mist")} aria-hidden="true">
                {selected ? <Check className="h-2.5 w-2.5" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-ink">{t.name}</span>
                <span className="block text-[11px] text-slate">{t.category} · v{t.version}</span>
                {!compact ? <span className="mt-0.5 block text-[11px] leading-snug text-slate">{t.replicaNote}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {locked ? <p className="text-[11px] text-slate">The program is bound to this application. Start over to pick another one.</p> : null}
    </div>
  );
}
