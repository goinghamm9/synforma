"use client";
import { Switch } from "@/components/ui";
import { useSynforma } from "@/lib/synforma/store";
import { FieldRow, SettingsSection, StatusLine } from "./section";

const THRESHOLD_MIN_S = 5;
const THRESHOLD_MAX_S = 30;

export function ObservationSection() {
  const settings = useSynforma((s) => s.settings);
  const setSettings = useSynforma((s) => s.setSettings);

  const thresholdS = Math.min(THRESHOLD_MAX_S, Math.max(THRESHOLD_MIN_S, Math.round(settings.hesitationThresholdMs / 1000)));
  const sharePct = Math.round(settings.treatmentShare * 100);

  return (
    <SettingsSection
      id="observation"
      eyebrow="Observation"
      title="Guide mode and experiments"
      lede="How Synforma decides that a person is stuck, what it must ask before committing data, and how human runs are split for measuring interventions."
    >
      <FieldRow
        label="Hesitation threshold"
        htmlFor="hesitation-threshold"
        hint="Time without progress on a step before the observer records a hesitation signal. Shorter thresholds find struggle sooner and produce more false positives."
      >
        <div className="flex items-center gap-4">
          <input
            id="hesitation-threshold"
            type="range"
            min={THRESHOLD_MIN_S}
            max={THRESHOLD_MAX_S}
            step={1}
            value={thresholdS}
            onChange={(e) => setSettings({ hesitationThresholdMs: Number(e.target.value) * 1000 })}
            className="h-1.5 w-full max-w-xs cursor-pointer accent-ink"
            aria-valuetext={`${thresholdS} seconds`}
          />
          <output htmlFor="hesitation-threshold" className="mono-data w-12 text-right text-sm text-ink" data-testid="hesitation-threshold-value">
            {thresholdS} s
          </output>
        </div>
        <StatusLine>
          Range {THRESHOLD_MIN_S}–{THRESHOLD_MAX_S} s. Default 12 s. Applies to the next Guide session.
        </StatusLine>
      </FieldRow>

      <FieldRow
        label="Require approval before commits"
        htmlFor="require-approval"
        hint="In Act mode, every action that creates or submits data pauses for an explicit approval, with the values about to be written shown in full."
      >
        <div className="flex items-center gap-3">
          <Switch id="require-approval" checked={settings.requireApprovalForCommit} onCheckedChange={(v) => setSettings({ requireApprovalForCommit: v })} />
          <span className="text-sm text-graphite">{settings.requireApprovalForCommit ? "On: commits wait for approval" : "Off: commits proceed and are audited"}</span>
        </div>
        {!settings.requireApprovalForCommit ? (
          <StatusLine tone="amber">Approval is the main control a person has over Act mode. Turning it off is intended for unattended synthetic runs only.</StatusLine>
        ) : null}
      </FieldRow>

      <FieldRow
        label="Treatment share"
        htmlFor="treatment-share"
        hint="Fraction of human runs assigned to the treatment cohort when an intervention is under test."
      >
        <div className="flex items-center gap-4">
          <input
            id="treatment-share"
            type="range"
            min={0}
            max={100}
            step={5}
            value={sharePct}
            onChange={(e) => setSettings({ treatmentShare: Number(e.target.value) / 100 })}
            className="h-1.5 w-full max-w-xs cursor-pointer accent-ink"
            aria-valuetext={`${sharePct} percent`}
          />
          <output htmlFor="treatment-share" className="mono-data w-12 text-right text-sm text-ink">
            {sharePct}%
          </output>
        </div>
        <div className="mt-3 grid gap-3 rounded-lg border border-line bg-surface p-4 text-[13px] leading-relaxed text-graphite sm:grid-cols-2">
          <div>
            <p className="font-medium text-ink">Control · {100 - sharePct}%</p>
            <p className="mt-1">Runs that do not see the intervention under test. They show what completion looks like without it.</p>
          </div>
          <div>
            <p className="font-medium text-ink">Treatment · {sharePct}%</p>
            <p className="mt-1">Runs that see it. The difference in completion between the two arms is the only evidence that an intervention works here.</p>
          </div>
          <p className="sm:col-span-2">
            Assignment is deterministic from the run id, so it can be audited. Each arm needs at least three finished runs before the product reports a
            difference; until then it says <span className="text-ink">Insufficient evidence</span>.
          </p>
        </div>
        {sharePct === 0 ? (
          <StatusLine tone="amber">At 0% no one sees interventions under test, so nothing can be learned.</StatusLine>
        ) : sharePct === 100 ? (
          <StatusLine tone="amber">At 100% there is no control cohort, so lift cannot be measured.</StatusLine>
        ) : null}
      </FieldRow>
    </SettingsSection>
  );
}
