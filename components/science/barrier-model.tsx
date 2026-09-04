import { BARRIER_LABEL, BARRIER_SHORT } from "@/lib/synforma/science/techniques";
import type { BarrierType } from "@/lib/synforma/types";
import { Cite, ClaimTag, Prose } from "./shell";

const COMPONENTS: { name: string; comb: string; barriers: BarrierType[]; note: string }[] = [
  {
    name: "Capability",
    comb: "Psychological capability in COM-B",
    barriers: ["capability_knowledge", "capability_skill"],
    note: "Observed as hesitation without errors, backtracking, or repeated validation errors on a step.",
  },
  {
    name: "Opportunity",
    comb: "Physical opportunity in COM-B",
    barriers: ["opportunity_visibility", "opportunity_friction"],
    note: "Observed as hesitation on steps whose fields sit behind a disclosure, navigation away from the workflow, or abandonment mid-step.",
  },
  {
    name: "Motivation",
    comb: "Reflective motivation in COM-B",
    barriers: ["motivation_uncertainty", "motivation_value"],
    note: "Observed as hesitation on steps that need a judgment call, or abandonment at the point of commit.",
  },
];

export function BarrierModel() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ClaimTag tone="amber">Theoretical model</ClaimTag>
        <span className="text-sm text-slate">
          Adapted from COM-B, <Cite id="michie2011" />
        </span>
      </div>
      <Prose className="mt-5">
        <p>
          The behaviour change wheel proposes that a behavior occurs when a person has the <strong>capability</strong>, the{" "}
          <strong>opportunity</strong> and the <strong>motivation</strong> for it. Synforma borrows that structure as a taxonomy of six barriers
          that can stand between a person and a workflow step. The taxonomy names hypotheses about why a step is not happening; it is not a
          diagnosis of the person, and the engine stores every hypothesis with its confidence and the signals it rests on.
        </p>
      </Prose>
      <div className="mt-5 rounded-lg border border-line bg-surface-2/60 p-4" data-testid="barrier-wording-note">
        <p className="eyebrow">Observable wording</p>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Each barrier label names what the interface showed or what the person did: a control that is hidden, an input format that produced
          errors, an action that was found but not committed. Never a state of mind. The engine reaches a barrier through an observed
          interaction state (section 03), and the label is a sentence a person can check against their own screen.
        </p>
      </div>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {COMPONENTS.map((c) => (
          <div key={c.name} className="grid gap-4 py-6 sm:grid-cols-12 sm:gap-6">
            <div className="sm:col-span-4">
              <h3 className="text-base font-medium text-ink">{c.name}</h3>
              <p className="mt-1 text-xs text-slate">{c.comb}</p>
              <p className="mt-3 text-sm leading-relaxed text-graphite">{c.note}</p>
            </div>
            <ul className="space-y-3 sm:col-span-8">
              {c.barriers.map((b) => (
                <li key={b} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-ink">{BARRIER_SHORT[b]}</span>
                    <code className="mono-data text-[11px] text-mist">{b}</code>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-graphite">{BARRIER_LABEL[b].replace(/^[^:]+:\s*/, "")}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm leading-relaxed text-slate">
        Hidden controls are treated as an opportunity barrier rather than a failing of the person, following the recognition-over-recall heuristic (
        <Cite id="nielsen1994" />).
      </p>
    </div>
  );
}
