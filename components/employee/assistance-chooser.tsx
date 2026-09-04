"use client";
import { Check } from "lucide-react";
import { NativeSelect } from "@/components/ui";
import type { AssistancePreference } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";

/** How the person wants Synforma to help. A preference, never an override of the safety rules. */
export const PREFERENCES: { value: AssistancePreference; label: string; description: string }[] = [
  { value: "just_do_it", label: "Just do it", description: "Handle everything safe to automate" },
  { value: "work_with_me", label: "Work with me", description: "Help when useful. Let me make the decisions" },
  { value: "teach_me", label: "Teach me", description: "Explain the process as we go so I can learn it" },
  { value: "stay_out", label: "Stay out of the way", description: "Only interrupt for important risk or errors" },
];

export const PREFERENCE_LABEL: Record<AssistancePreference, string> = Object.fromEntries(PREFERENCES.map((p) => [p.value, p.label])) as Record<AssistancePreference, string>;

interface AssistanceChooserProps {
  value: AssistancePreference;
  onChange: (value: AssistancePreference) => void;
  /** "list": radio cards before a run. "compact": a select while the run is live. */
  variant?: "list" | "compact";
  disabled?: boolean;
}

export function AssistanceChooser({ value, onChange, variant = "list", disabled }: AssistanceChooserProps) {
  if (variant === "compact") {
    const current = PREFERENCES.find((p) => p.value === value);
    return (
      <label className="flex min-w-0 items-center gap-2 text-[12px] text-slate" title={current?.description}>
        <span className="whitespace-nowrap">Assistance</span>
        <span className="min-w-0 flex-1">
          <NativeSelect
            value={value}
            onChange={(e) => onChange(e.target.value as AssistancePreference)}
            disabled={disabled}
            className="h-8 text-[12px]"
            aria-label="How Synforma helps during this run"
            data-testid="assistance-chooser-compact"
          >
            {PREFERENCES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </span>
      </label>
    );
  }
  return (
    <div role="radiogroup" aria-label="How should Synforma help?" className="grid gap-1.5 sm:grid-cols-2" data-testid="assistance-chooser">
      {PREFERENCES.map((p) => {
        const selected = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(p.value)}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "border-ink bg-surface-2" : "border-line bg-surface hover:bg-surface-2/60",
            )}
            data-testid={`preference-${p.value}`}
          >
            <span className={cn("mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border", selected ? "border-ink bg-ink text-paper" : "border-line-strong")} aria-hidden="true">
              {selected ? <Check className="h-2.5 w-2.5" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">{p.label}</span>
              <span className="block text-[11px] leading-snug text-slate">{p.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
