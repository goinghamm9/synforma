import { interruptionMultiplier, LEVEL_LABEL, LEVEL_ORDER } from "@/lib/synforma/engine/proficiency";
import type { AssistanceLevel } from "@/lib/synforma/types";
import { Cite, Prose } from "./shell";

/** The base interruption multiplier per level, read from the engine (no unassisted successes yet). */
function baseMultiplier(level: AssistanceLevel): number {
  return interruptionMultiplier({ programId: "", stepId: "", assistedRuns: 0, unassistedSuccesses: 0, recentErrors: 0, errorHistory: [], assistanceLevel: level, updatedAt: 0 });
}

const TERMS: { term: string; meaning: string }[] = [
  { term: "+ 0.45 when no friction is observed", meaning: "The state is Fluent or Unknown, or the signal carries no interaction state at all. This one term is what makes silence the default." },
  { term: "+ 0.35 × (1 − confidence)", meaning: "Doubt about the diagnosis counts for staying quiet, while the same doubt is subtracted from every technique through the uncertainty penalty." },
  {
    term: "+ 0.5 × (interruption multiplier − 1)",
    meaning: `Proficiency on this step. The multiplier is ${LEVEL_ORDER.map((l) => `${baseMultiplier(l).toFixed(2)} at ${LEVEL_LABEL[l]}`).join(", ")}, plus 0.15 per unassisted success up to 0.4, so a step the person completes reliably earns more silence.`,
  },
  { term: "+ 0.30 for Stay out of the way", meaning: "The person's assistance preference, chosen in Settings and recorded on each run." },
  { term: "+ 0.25 within 20 s of the last help", meaning: "The frequency cap. The same 20 s add 0.25 to every technique's repetition penalty." },
  { term: "− 0.15 for hesitation before a commit", meaning: "Decision uncertainty on a commit step is the one case where a single line of clarification is worth the interruption." },
];

export function DoNothingPolicy() {
  return (
    <div>
      <Prose>
        <p>
          Every decision the adoption engine makes includes a candidate called <strong>Do nothing</strong>. It is scored like the others, from a
          base of 0.30, and it often wins by design: interruption is a cost, extraneous load impairs performance (<Cite id="sweller1988" />),
          and help that would not change the outcome is noise. The registry entry states the consequence plainly: a system that always
          intervenes is measured by its false-intervention rate.
        </p>
      </Prose>

      <figure className="mt-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <figcaption className="eyebrow">Score of the Do-nothing candidate, computed for every signal</figcaption>
        <pre className="mono-data mt-4 overflow-x-auto whitespace-pre text-[13px] leading-relaxed text-ink">
          {`doNothing = 0.30
          + 0.45 · [state is FLUENT or UNKNOWN, or absent]
          + 0.35 · (1 − confidence)
          + 0.50 · (interruptionMultiplier − 1)   when above 1
          + 0.30 · [preference is stay out of the way]
          + 0.25 · [help was shown less than 20 s ago]
          − 0.15 · [decision uncertainty before a commit step]`}
        </pre>
        <p className="mt-4 text-sm leading-relaxed text-slate">
          Compared with the highest technique total from section 05. When it wins, no intervention is composed; the decision, its candidates and
          their totals are still recorded.
        </p>
      </figure>

      <dl className="mt-8 divide-y divide-line border-y border-line">
        {TERMS.map((t) => (
          <div key={t.term} className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
            <dt className="sm:col-span-4">
              <code className="mono-data text-sm text-ink">{t.term}</code>
            </dt>
            <dd className="text-sm leading-relaxed text-graphite sm:col-span-8">{t.meaning}</dd>
          </div>
        ))}
      </dl>

      <Prose className="mt-8">
        <p>
          <strong>An arithmetic consequence.</strong> With no friction state and a hypothesis at 60% confidence, the candidate starts at 0.30 +
          0.45 + 0.14 = 0.89 before proficiency is counted. A technique with a neutral prior scores at most 0.35 × 0.6 + 0.20 + 0.15 + 0.15
          − 0.10 = 0.61 before its burden penalty. Nothing appears unless the evidence says something is wrong.
        </p>
        <p>
          <strong>The false-intervention rate is a first-class quality metric.</strong> Its inputs are recorded on every run: assistance shown,
          assistance dismissed with the not-helpful flag, decisions withheld with their full candidate list, and the run&rsquo;s count of withheld
          interventions. Because the reasons are stored, why nothing appeared can be read back like any other choice (<Cite id="amershi2019" />
          ). The rate is not yet reported on the Measure page; until it is, the events are the record.
        </p>
      </Prose>
    </div>
  );
}
