import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const STAGES: { name: string; body: string }[] = [
  { name: "Observe", body: "Watch how work actually happens across applications, agents and people." },
  { name: "Diagnose", body: "Locate the friction and infer the most likely barrier, with a confidence attached." },
  { name: "Intervene", body: "Generate the smallest change that could remove it: guidance, assistance or action." },
  { name: "Experiment", body: "Test it with a cohort against a control. Measure the outcome, not the impression." },
  { name: "Learn", body: "Keep what worked, retire what did not, and update the Work Graph." },
];

type EntryKind = "observed" | "hypothesis" | "action" | "measured";

const ENTRY_STYLE: Record<EntryKind, string> = {
  observed: "text-ink",
  hypothesis: "text-amber",
  action: "text-graphite",
  measured: "text-verdant",
};

const LOG: { kind: EntryKind; label: string; text: string }[] = [
  { kind: "observed", label: "Observed", text: "Reps abandon the opportunity qualification workflow at step five." },
  { kind: "observed", label: "Pattern", text: "Abandonment concentrates on one step, across reps and across weeks. Not one person’s habit." },
  { kind: "action", label: "Inspect", text: "Step five asks for a decision-maker inside a collapsed section that most reps never open." },
  { kind: "hypothesis", label: "Hypothesis", text: "A visibility barrier, not a motivation problem. Confidence moderate; alternatives retained." },
  { kind: "action", label: "Intervene", text: "Generate contextual assistance that opens the section and offers to prefill from the account’s contacts." },
  { kind: "action", label: "Experiment", text: "Half of eligible runs see the intervention; half do not." },
  { kind: "measured", label: "Measure", text: "Completion at step five, time to complete, and CRM completeness downstream." },
  { kind: "action", label: "Adjust", text: "Shorten the copy. Keep the offer to prefill." },
  { kind: "measured", label: "Deploy", text: "Roll out to the full population. Record the change in the Work Graph." },
];

export function AdoptionLoop() {
  return (
    <Section>
      <SectionHeader
        index="05"
        eyebrow="The autonomous adoption loop"
        title="Observe. Diagnose. Intervene. Experiment. Learn."
        lede="Adoption is not a launch. It is a loop that runs for as long as the organization keeps changing, and Synforma runs it without a person in the middle."
      />

      <Reveal className="mt-16">
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
          {STAGES.map((stage, index) => (
            <li key={stage.name} className="relative bg-surface p-5">
              <div className="flex items-center justify-between">
                <span className="mono-data text-xs text-mist">{String(index + 1).padStart(2, "0")}</span>
                <span aria-hidden="true" className="text-mist">
                  {index < STAGES.length - 1 ? "→" : "↺"}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-medium tracking-tight text-ink">{stage.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{stage.body}</p>
            </li>
          ))}
        </ol>
      </Reveal>

      <div className="mt-16 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">A worked example</p>
          <p className="mt-4 text-base leading-relaxed text-graphite">
            One pattern, followed from first signal to deployment. Each line is an entry Synforma
            writes for itself and for the people who audit it.
          </p>
          <p className="display mt-10 text-2xl text-ink sm:text-3xl">No administrator touched anything.</p>
        </div>
        <Reveal className="lg:col-span-8">
          <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
            {LOG.map((entry, index) => (
              <li key={`${entry.label}-${index}`} className="grid grid-cols-[2.5rem_6.5rem_1fr] gap-3 px-5 py-3.5 sm:gap-5">
                <span className="mono-data text-xs text-mist">{String(index + 1).padStart(2, "0")}</span>
                <span className={cn("mono-data text-xs uppercase tracking-wider", ENTRY_STYLE[entry.kind])}>
                  {entry.label}
                </span>
                <span className="text-sm leading-relaxed text-graphite">{entry.text}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </Section>
  );
}
