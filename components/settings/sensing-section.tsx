"use client";
import { ChevronRight } from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { useSynforma } from "@/lib/synforma/store";
import { CollectedDataInspector } from "./collected-data-inspector";
import { FieldRow, SettingsSection, StatusLine } from "./section";

/** Exact consent wording. Keep in step with docs/PRIVACY_MODEL.md. */
export const SENSING_CONSENT =
  "Synforma uses pointer movement patterns and keyboard metadata (never typed text) to tell whether an interface is creating friction. It does not infer emotions, personality, intelligence or employee value.";

/** The collection table from docs/PRIVACY_MODEL.md, verbatim in substance. */
const COLLECTION: { category: string; collected: string; never: string }[] = [
  {
    category: "Semantic screen state",
    collected: "Roles, accessible names, headings, dialog titles, alert text, table headers, definition-list labels",
    never: "Screenshots, the full DOM, page text bodies",
  },
  {
    category: "Navigation",
    collected: "Route patterns, step transitions, backtracks, abandonment",
    never: "URLs of applications outside the program",
  },
  {
    category: "Validation",
    collected: "Alert text shown by the application",
    never: "The field values that failed",
  },
  {
    category: "Pointer",
    collected: "One-second aggregates: distance, path efficiency, direction changes, hover dwell per semantic element, approaches and withdrawals to the current target",
    never: "Raw coordinates or movement traces",
  },
  {
    category: "Keyboard",
    collected: "One-second metadata aggregates: counts by category (character, backspace, enter, escape, shortcut, navigation), median inter-key interval, bursts",
    never: "Key values, typed text, the clipboard, anything on password, secret, card or token fields (those emit only a suppressed count)",
  },
  {
    category: "Outcome verification",
    collected: "Labels present on the outcome screen and which requirements were met",
    never: "Record values, except in the approval payload the person explicitly approved",
  },
  {
    category: "Gaze, webcam, physiology",
    collected: "Nothing. A provider interface exists; nothing implements it",
    never: "—",
  },
];

const NEVER_INFERRED = "emotion, stress, personality, intelligence, motivation as a trait, mental health, neurodivergence, performer rankings, or any employee-worth score";

export function SensingSection() {
  const sensing = useSynforma((s) => s.settings.interactionSensing);
  const paused = useSynforma((s) => s.settings.sensingPaused);
  const setSettings = useSynforma((s) => s.setSettings);

  return (
    <SettingsSection
      id="sensing"
      eyebrow="Privacy"
      title="Interaction sensing"
      lede="What Synforma senses while you work, stated exactly, with the stored data open for inspection. Everything stays in this browser."
    >
      <FieldRow label="Interaction sensing" htmlFor="interaction-sensing" hint={SENSING_CONSENT}>
        <div className="flex items-center gap-3">
          <Switch id="interaction-sensing" checked={sensing} onCheckedChange={(v) => setSettings({ interactionSensing: v })} data-testid="interaction-sensing" />
          <span className="text-sm text-graphite" data-testid="interaction-sensing-state">
            {sensing ? "On: pointer and keyboard windows are reduced to aggregates in this browser" : "Off: only navigation and validation evidence remain"}
          </span>
        </div>
        {!sensing ? (
          <StatusLine>Without sensing, most interaction states come back as Unknown and assistance relies on hesitation, validation errors and backtracks alone.</StatusLine>
        ) : paused ? (
          <div>
            <StatusLine tone="amber">Sensing is on but paused from the employee view. Nothing is being aggregated until it resumes.</StatusLine>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setSettings({ sensingPaused: false })} data-testid="resume-sensing">
              Resume sensing
            </Button>
          </div>
        ) : (
          <StatusLine>You can also pause sensing at any time from the employee view; the paused state is visible there.</StatusLine>
        )}

        <details className="group mt-4 rounded-lg border border-line bg-surface" data-testid="collected-details">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 text-slate transition-transform group-open:rotate-90" aria-hidden="true" />
            Learn exactly what is collected
          </summary>
          <div className="border-t border-line px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-[13px]" data-testid="collected-table">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="py-2 pr-3 text-[11px] font-medium uppercase tracking-wider text-slate">Category</th>
                    <th className="py-2 pr-3 text-[11px] font-medium uppercase tracking-wider text-verdant">Collected</th>
                    <th className="py-2 text-[11px] font-medium uppercase tracking-wider text-signal">Never collected</th>
                  </tr>
                </thead>
                <tbody>
                  {COLLECTION.map((row) => (
                    <tr key={row.category} className="border-b border-line align-top last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-ink">{row.category}</td>
                      <td className="py-2.5 pr-3 leading-relaxed text-graphite">{row.collected}</td>
                      <td className="py-2.5 leading-relaxed text-graphite">{row.never}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate">
              Never inferred, stored or displayed: {NEVER_INFERRED}. Enforced in code: key values are classified and discarded synchronously, snapshots carry
              no text bodies, and outcome events carry labels only. Behavioral telemetry is still personal data; purpose limitation, minimization and
              retention controls apply.
            </p>
          </div>
        </details>
      </FieldRow>

      <FieldRow label="Collected data inspector" hint="Read directly from the events stored in this browser: counts by type, and the most recent pointer and keyboard windows in full. Verify for yourself that nothing raw is kept.">
        <CollectedDataInspector />
      </FieldRow>
    </SettingsSection>
  );
}
