import { SynformaMark } from "@/components/brand/logo";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

interface Mode {
  name: string;
  rule: string;
  when: string;
  example: string;
  human: string;
}

const MODES: Mode[] = [
  {
    name: "Guide",
    rule: "The person should perform it.",
    when: "Judgment, accountability or learning matter more than speed. Synforma stays beside the work and provides contextual help drawn from policy and precedent, without taking the step away.",
    example: "This approval requires your judgment. Here are the relevant policy considerations.",
    human: "Person decides and acts",
  },
  {
    name: "Assist",
    rule: "Human and AI work together.",
    when: "Synforma prepares the work and the person reviews it before anything is committed. The division of labor is explicit, and the review is part of the record.",
    example: "I’ve prepared the opportunity update from your notes. Review these four fields before submission.",
    human: "Synforma prepares, person approves",
  },
  {
    name: "Act",
    rule: "There is little value in the person operating the interface.",
    when: "Synforma performs the step itself under authorization, with logging and approval controls, and reports what it did in plain language.",
    example: "I’ve updated the CRM record and attached today’s call notes.",
    human: "Synforma acts, person is informed",
  },
];

export function GuideAssistAct() {
  return (
    <Section id="how">
      <SectionHeader
        index="02"
        eyebrow="How it works"
        title={
          <>
            Guide <span className="text-mist">·</span> Assist <span className="text-mist">·</span> Act
          </>
        }
        lede="For every step of every workflow, Synforma decides how much of the work belongs to the person and how much belongs to the system. The decision is continuous, evidence-based and reversible."
      />

      <div className="mt-16">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-slate">
          <span>Human judgment</span>
          <span>System execution</span>
        </div>
        <div className="relative mt-2 h-px w-full bg-line-strong" aria-hidden="true">
          <span className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink" />
          <span className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
          <span className="absolute top-1/2 right-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {MODES.map((mode, index) => (
            <Reveal key={mode.name} delay={index * 0.06} className="flex">
              <article className="flex w-full flex-col rounded-lg border border-line bg-surface">
                <div className="p-6">
                  <p className="eyebrow">{mode.human}</p>
                  <h3 className="display mt-3 text-3xl text-ink">{mode.name}</h3>
                  <p className="mt-3 text-base font-medium text-ink">{mode.rule}</p>
                  <p className="mt-3 text-sm leading-relaxed text-graphite">{mode.when}</p>
                </div>
                <div className="mt-auto border-t border-line bg-surface-2/60 p-5">
                  <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-4">
                    <SynformaMark className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
                    <p className="text-sm leading-relaxed text-ink">{mode.example}</p>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
