import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const LEGACY_ASSUMPTIONS = [
  "Someone builds the adoption layer.",
  "Someone tags the elements.",
  "Someone authors the walkthroughs.",
  "Someone repairs the flows when a vendor moves a button.",
];

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "No builders",
    body: "There is no flow builder, no step recorder and no authoring console. Programs are derived from objectives stated in plain language.",
  },
  {
    title: "No tagging",
    body: "Nobody tags elements or maintains selectors. Synforma reads applications the way people do: by role, label, position and meaning.",
  },
  {
    title: "Self-healing",
    body: "Actions are anchored to semantics, not selectors. When a vendor renames a field or moves a button, the action re-grounds itself and records that it did.",
  },
  {
    title: "Guide → Assist → Act",
    body: "Every step is assigned the level of human involvement it deserves, and the assignment changes as evidence accumulates.",
  },
  {
    title: "Discovery never commits",
    body: "While exploring an application, Synforma reads and navigates. It does not create, submit or delete anything until a program is authorized.",
  },
  {
    title: "Every action audited",
    body: "Every action, whether by a person or the system, is written to an audit trail with the identity, the authorization and the approval behind it.",
  },
];

export function AssumptionSection() {
  return (
    <Section id="thesis">
      <SectionHeader
        index="01"
        eyebrow="The assumption we reject"
        title="Legacy digital adoption assumes someone must build the adoption layer."
        lede="Builders, tagged elements, authored walkthroughs, and flows that break the day a vendor ships a release. Every artifact has an owner, and every owner has a backlog. Synforma starts from a different assumption: the adoption layer builds itself."
      />

      <Reveal className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
        <div className="bg-surface p-6 sm:p-8">
          <p className="eyebrow">Legacy assumption</p>
          <ul className="mt-5 space-y-3">
            {LEGACY_ASSUMPTIONS.map((item) => (
              <li key={item} className="flex gap-3 text-base text-graphite">
                <span aria-hidden="true" className="mt-[0.6rem] h-px w-4 shrink-0 bg-line-strong" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-surface p-6 sm:p-8">
          <p className="eyebrow text-ink">Synforma’s assumption</p>
          <p className="display mt-5 text-2xl text-ink sm:text-3xl">The adoption layer builds itself.</p>
          <p className="mt-4 text-base leading-relaxed text-graphite">
            Give Synforma an application and an objective. It learns the interface, identifies the
            workflow, decides where a person adds value, and keeps adjusting as the organization and
            its software change.
          </p>
        </div>
      </Reveal>

      <div className="mt-16">
        <p className="eyebrow">Operating principles</p>
        <ol className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <li key={principle.title} className="bg-surface p-6">
              <Reveal delay={index * 0.04}>
                <p className="mono-data text-xs text-mist">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-lg font-medium tracking-tight text-ink">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite">{principle.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
