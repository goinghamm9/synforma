import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const GUARANTEES: { title: string; body: string }[] = [
  {
    title: "Identity",
    body: "Every action is bound to a verified person or a named service identity. Nothing runs as “the system”.",
  },
  {
    title: "Permissions",
    body: "Synforma can do only what the signed-in person is permitted to do, and often less. Scopes are explicit, minimal and revocable.",
  },
  {
    title: "Policy",
    body: "Data handling, approvals and separation of duties are enforced at the point of action, not reconstructed afterwards.",
  },
  {
    title: "Security",
    body: "Credentials never enter a prompt. Sessions are isolated. Every connector is least-privilege by default.",
  },
  {
    title: "Auditability",
    body: "A complete record of what was observed, inferred, proposed and executed, by whom, and under which authorization.",
  },
  {
    title: "Human approvals",
    body: "Actions that commit or destroy data require approval. The threshold is configurable; the default is conservative.",
  },
  {
    title: "Privacy",
    body: "Synforma models work, not people. Signals are aggregated at the step level; individuals are never scored or ranked.",
  },
  {
    title: "Observability",
    body: "Operators can see what Synforma is doing, why, and with what confidence, in real time and in retrospect.",
  },
];

export function TrustSection() {
  return (
    <Section id="trust">
      <SectionHeader
        index="09"
        eyebrow="Trust is the product"
        title="Without these, no enterprise lets an autonomous agent touch anything important."
        lede="The ability to act is easy to demonstrate. The right to act has to be earned, one control at a time. These are not features of Synforma; they are the conditions under which it is allowed to exist."
      />

      <ul className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {GUARANTEES.map((item, index) => (
          <li key={item.title} className="bg-surface p-6">
            <Reveal delay={index * 0.03}>
              <p className="mono-data text-xs text-mist">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-4 text-lg font-medium tracking-tight text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{item.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}
