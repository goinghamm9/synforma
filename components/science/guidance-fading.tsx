import { interruptionMultiplier, LEVEL_LABEL, LEVEL_ORDER } from "@/lib/synforma/engine/proficiency";
import type { AssistanceLevel } from "@/lib/synforma/types";
import { Cite, ClaimTag, Prose } from "./shell";

const LEVEL_NOTE: Record<AssistanceLevel, string> = {
  do_with_me: "The fullest assistance. Interrupting costs least here.",
  guide: "The starting level for every step. Pointers, explanations and checklists on the live interface.",
  explain: "Guidance has faded once. Interruptions cost more, so shorter help wins.",
  observe: "Guidance has faded twice. Synforma keeps measuring; nothing appears unless the evidence says something is wrong.",
};

function baseMultiplier(level: AssistanceLevel): number {
  return interruptionMultiplier({ programId: "", stepId: "", assistedRuns: 0, unassistedSuccesses: 0, recentErrors: 0, errorHistory: [], assistanceLevel: level, updatedAt: 0 });
}

export function GuidanceFading() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ClaimTag tone="outline">Product hypothesis</ClaimTag>
        <span className="text-sm text-slate">
          Cognitive-load basis from <Cite id="sweller1988" />; the fading rule itself is Synforma&rsquo;s
        </span>
      </div>
      <Prose className="mt-5">
        <p>
          Assistance that never leaves becomes a dependency. Synforma keeps, per program and per step, how many runs a person completed with
          help, how many without, and whether each of the last five runs produced an error. From these it moves the step&rsquo;s assistance
          level one notch at a time along a fixed ladder, and the person can move it back at any moment.
        </p>
      </Prose>

      <ol className="mt-8 grid gap-3 sm:grid-cols-4" data-testid="fading-ladder">
        {LEVEL_ORDER.map((level, i) => (
          <li key={level} className="rounded-lg border border-line bg-surface p-4">
            <p className="mono-data text-xs text-mist">Level {i + 1}</p>
            <p className="mt-1 text-sm font-medium text-ink">{LEVEL_LABEL[level]}</p>
            <p className="mono-data mt-1 text-[11px] text-slate">interruption × {baseMultiplier(level).toFixed(2)}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-graphite">{LEVEL_NOTE[level]}</p>
          </li>
        ))}
      </ol>

      <dl className="mt-8 divide-y divide-line border-y border-line">
        <div className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
          <dt className="text-sm font-medium text-ink sm:col-span-4">Fade</dt>
          <dd className="text-sm leading-relaxed text-graphite sm:col-span-8">
            After a run completed without assistance, when unassisted successes since the last fade reach three and fewer than 34% of the last
            five runs produced an error, the level moves one step toward Observe and the counter restarts. Do with me → Guide → Explain only →
            Observe.
          </dd>
        </div>
        <div className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
          <dt className="text-sm font-medium text-ink sm:col-span-4">Regress</dt>
          <dd className="text-sm leading-relaxed text-graphite sm:col-span-8">
            Two error runs among the last five return the step to Guide from Explain only or Observe. Errors here are validation errors observed
            on the step, never a judgment about the person.
          </dd>
        </div>
        <div className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
          <dt className="text-sm font-medium text-ink sm:col-span-4">Override</dt>
          <dd className="text-sm leading-relaxed text-graphite sm:col-span-8">
            <em>Teach me anyway</em> sets a step back to Guide; <em>Keep handling this</em> sets it to Do with me. Both live in Settings under
            Your independence, and both take effect on the next run.
          </dd>
        </div>
        <div className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
          <dt className="text-sm font-medium text-ink sm:col-span-4">Effect</dt>
          <dd className="text-sm leading-relaxed text-graphite sm:col-span-8">
            In the current rule version the level acts through one number, the interruption multiplier above, which raises the burden penalty
            of every technique and the score of the Do-nothing candidate (section 06). Safety rules are untouched: judgment steps are never
            automated and commits stay approval-gated at every level.
          </dd>
        </div>
      </dl>

      <Prose className="mt-8">
        <p>
          <strong>What the literature supports, and what it does not.</strong> Cognitive load theory explains why worked examples and pointers
          help a novice: they remove extraneous load (<Cite id="sweller1988" />). Mastery experiences build the confidence to act alone (
          <Cite id="bandura1977" />), and assistance that can be declined supports autonomy rather than eroding it (<Cite id="ryan2000" />).
          That is the basis for starting with guidance and letting it recede. The transfer of worked examples and guidance fading to enterprise
          software is a product hypothesis, and the thresholds above, three successes and a 34% error rate over five runs, are prototype
          choices, not findings. Whether fading preserves completion is measured per program from stored runs, like every other claim on this
          page.
        </p>
      </Prose>
    </div>
  );
}
