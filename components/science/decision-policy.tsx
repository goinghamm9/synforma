import { EVIDENCE_LABEL, EVIDENCE_WEIGHT } from "@/lib/synforma/science/techniques";
import type { EvidenceClass } from "@/lib/synforma/types";
import { Cite, Prose } from "./shell";

const TERMS: { term: string; weight: string; meaning: string }[] = [
  {
    term: "barrierFit",
    weight: "× 0.35",
    meaning:
      "The hypothesis confidence when the technique targets the primary barrier; 0.6 × the alternative's confidence when it targets an alternative barrier; 0 when it targets neither.",
  },
  {
    term: "contextFit",
    weight: "× 0.20",
    meaning:
      "Starts at 0.6. Set to 0 (excluded) when the step needs judgment and the technique would act; 0.4 for Assist on a judgment step; 0.9 for automation on a step with no judgment content. Raised by 0.3 for a contextual pointer when the step's fields are hidden; halved for a worked example when no field implies a format; capped at 0.5 for acting on a commit step, since approval is required anyway.",
  },
  {
    term: "evidenceWeight",
    weight: "× 0.15",
    meaning:
      "A fixed number per evidence class (table below). Deliberately the smallest positive weight: the literature sets a prior, the program's own runs decide.",
  },
  {
    term: "previousSuccess",
    weight: "× 0.30",
    meaning:
      "A neutral prior of 0.5 until the technique has at least three treated and three control human runs on this step; then 0.5 + (treatment completion rate − control completion rate), clamped to 0–1.",
  },
  {
    term: "repetitionPenalty",
    weight: "− 1.0",
    meaning: "0.15 for every intervention already created with this technique on this step, capped at 0.3, so the engine tries something else rather than repeating itself.",
  },
  {
    term: "burdenPenalty",
    weight: "− 1.0",
    meaning: "The technique's burden on the person × 0.4. Lighter interventions win ties.",
  },
];

const EVIDENCE_ORDER: EvidenceClass[] = ["strong", "promising", "theoretical", "experimental", "philosophical"];

export function DecisionPolicy() {
  return (
    <div>
      <figure className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <figcaption className="eyebrow">Selection score, computed per technique for the step under diagnosis</figcaption>
        <pre className="mono-data mt-4 overflow-x-auto whitespace-pre text-[13px] leading-relaxed text-ink">
          {`total = 0.35 · barrierFit
      + 0.20 · contextFit
      + 0.15 · evidenceWeight
      + 0.30 · previousSuccess
      − repetitionPenalty
      − burdenPenalty`}
        </pre>
        <p className="mt-4 text-sm leading-relaxed text-slate">
          The highest total among techniques with a non-zero contextFit is chosen. Every component is stored with the intervention and shown under
          &ldquo;Why this?&rdquo;.
        </p>
      </figure>

      <dl className="mt-8 divide-y divide-line border-y border-line">
        {TERMS.map((t) => (
          <div key={t.term} className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
            <dt className="flex items-baseline gap-3 sm:col-span-4">
              <code className="mono-data text-sm text-ink">{t.term}</code>
              <span className="mono-data text-xs text-mist">{t.weight}</span>
            </dt>
            <dd className="text-sm leading-relaxed text-graphite sm:col-span-8">{t.meaning}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="eyebrow mb-3 text-left">Evidence weights, from the registry</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-slate">Evidence class</th>
              <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-slate">Label</th>
              <th className="py-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate">Weight</th>
            </tr>
          </thead>
          <tbody>
            {EVIDENCE_ORDER.map((e) => (
              <tr key={e} className="border-b border-line last:border-0">
                <td className="py-2 pr-4">
                  <code className="mono-data text-xs text-graphite">{e}</code>
                </td>
                <td className="py-2 pr-4 text-graphite">{EVIDENCE_LABEL[e]}</td>
                <td className="mono-data py-2 text-right text-ink">{EVIDENCE_WEIGHT[e].toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-10 text-base font-medium text-ink">Why the language model is not the source of scientific truth</h3>
      <Prose className="mt-3">
        <p>
          When a Gemini key is configured, a language model helps with four narrow tasks: reading an objective into requirements, matching those
          requirements to discovered fields, naming a barrier from observed signals, and phrasing assistance. Each response must validate against
          a fixed schema and is discarded, then replaced by the deterministic planner, when it does not. The model cannot add a technique, cite a
          source, change a weight or assign a cohort.
        </p>
        <p>
          The score above is computed from three things a model has no say in: the registry (techniques, barriers, evidence classes, burdens), the
          hypothesis the engine recorded with its evidence, and the program&rsquo;s stored runs. That is what makes a choice explainable after the
          fact and reproducible from the same data. It follows the guidance to make clear why the system did what it did and to support efficient
          correction (<Cite id="amershi2019" />): a person can read the components, disagree, and turn the intervention off.
        </p>
      </Prose>
    </div>
  );
}
