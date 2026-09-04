import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const NOT_OPTIMIZED: { metric: string; why: string }[] = [
  { metric: "Monthly active users", why: "A login is not a decision made." },
  { metric: "Walkthroughs viewed", why: "A walkthrough viewed is not a record updated." },
  { metric: "Tooltips dismissed", why: "Dismissal measures interruption, not understanding." },
  { metric: "Minutes in the application", why: "Time in software is often the cost, not the value." },
];

export function NorthStar() {
  return (
    <Section>
      <SectionHeader
        index="10"
        eyebrow="The north-star metric"
        title="Intent-to-Outcome Rate"
        lede="Of the work outcomes people intend to accomplish, how many actually happen — correctly, efficiently and compliantly. It is the only number Synforma is built to move."
      />

      <Reveal className="mt-16">
        <figure className="rounded-lg border border-line bg-surface p-6 sm:p-8">
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr] sm:gap-8">
            <p className="mono-data text-sm text-slate sm:text-base">Intent-to-Outcome Rate =</p>
            <div className="mono-data text-sm text-ink sm:text-base">
              <p className="border-b border-ink pb-2">
                outcomes achieved correctly, efficiently and compliantly
              </p>
              <p className="pt-2">outcomes people intended to accomplish</p>
            </div>
          </div>
          <figcaption className="mt-6 max-w-2xl text-sm leading-relaxed text-graphite">
            An intent counts when a person or a program set out to accomplish something. An outcome
            counts only when the result is verified in the system of record, within policy, without
            rework. Everything Synforma guides, assists or acts on is scored against this ratio.
          </figcaption>
        </figure>
      </Reveal>

      <div className="mt-12 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">What we do not optimize</p>
          <p className="mt-4 text-base leading-relaxed text-graphite">
            Each of these can rise while the work gets worse. Synforma reports them when they are
            useful for diagnosis and never treats them as success.
          </p>
        </div>
        <Reveal className="lg:col-span-8">
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {NOT_OPTIMIZED.map((item) => (
              <li key={item.metric} className="grid gap-1 px-5 py-4 sm:grid-cols-2 sm:gap-6">
                <span className="text-sm text-mist line-through decoration-line-strong">{item.metric}</span>
                <span className="text-sm text-graphite">{item.why}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}
