"use client";
import { useSynforma } from "@/lib/synforma/store";
import type { AssistancePreference } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { FieldRow, SettingsSection, StatusLine } from "./section";

export const PREFERENCE_OPTIONS: { value: AssistancePreference; label: string; hint: string }[] = [
  { value: "just_do_it", label: "Just do it", hint: "Prefer prefilling and acting on your behalf. Judgment fields stay yours and commits still wait for your approval." },
  { value: "work_with_me", label: "Work with me", hint: "The default balance: point or explain when the interface is the obstacle, prepare what can be derived, ask before committing." },
  { value: "teach_me", label: "Teach me", hint: "Prefer pointers and explanations so the workflow becomes yours. Guidance costs less to show and fades as you succeed unassisted." },
  { value: "stay_out", label: "Stay out of the way", hint: "Stay quiet unless something is clearly wrong. Doing nothing scores higher and every interruption costs more." },
];

export function AssistanceSection() {
  const preference = useSynforma((s) => s.settings.assistancePreference);
  const setSettings = useSynforma((s) => s.setSettings);
  return (
    <SettingsSection
      id="assistance"
      eyebrow="How Synforma helps"
      title="How Synforma helps"
      lede="A preference, never an override of the safety rules: judgment steps are never automated and commits are always approval-gated. The decision policy scores every candidate, including doing nothing, against this preference, and each run records the preference it ran under."
    >
      <FieldRow label="Preference" hint="Applies to new Guide sessions. You can change it at any time; the change is saved immediately.">
        <fieldset>
          <legend className="sr-only">How Synforma helps</legend>
          <div className="divide-y divide-line rounded-lg border border-line bg-surface" role="radiogroup" data-testid="assistance-preference">
            {PREFERENCE_OPTIONS.map((o) => {
              const checked = preference === o.value;
              return (
                <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 p-3.5 transition-colors hover:bg-surface-2", checked && "bg-surface-2/70")}>
                  <input
                    type="radio"
                    name="assistancePreference"
                    value={o.value}
                    checked={checked}
                    onChange={() => setSettings({ assistancePreference: o.value })}
                    className="mt-0.5 h-4 w-4 accent-ink"
                    data-testid={`assistance-${o.value}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-slate">{o.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <StatusLine>
          Current preference: <span className="font-medium text-ink">{PREFERENCE_OPTIONS.find((o) => o.value === preference)?.label ?? preference}</span>. Any assistance can
          be dismissed, marked not helpful, or explained with &ldquo;Why this?&rdquo; regardless of the preference.
        </StatusLine>
      </FieldRow>
    </SettingsSection>
  );
}
