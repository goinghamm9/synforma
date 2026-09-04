import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const MODES = ["API", "MCP", "DOM", "Accessibility tree", "Vision", "Browser", "SDK", "Event streams"];

const PRECEDENCE: { title: string; body: string }[] = [
  {
    title: "Where direct APIs or audit streams exist, use them.",
    body: "Structured access is faster, more reliable and easier to authorize. Event streams give Synforma what happened without a screen in the way.",
  },
  {
    title: "Where they don’t, observe the interface.",
    body: "The DOM and the accessibility tree describe an application in the same terms a person uses: roles, labels, states. Vision fills the gaps where semantics are missing.",
  },
  {
    title: "Where neither exists, use an SDK.",
    body: "Internal applications can expose their workflows directly. The SDK is small, and it is the only place an engineer is ever asked to write code.",
  },
];

export function InteractionLayer() {
  return (
    <Section>
      <SectionHeader
        index="06"
        eyebrow="Universal interaction layer"
        title="Reach the work wherever it is."
        lede="Synforma does not depend on one way of seeing an application. It uses the most reliable channel available and falls back gracefully, so the same program runs against a modern API, a legacy web application and an internal tool."
      />

      <Reveal className="mt-16">
        <ul className="flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <li
              key={mode}
              className="rounded-md border border-line-strong bg-surface px-3 py-1.5 font-mono text-xs tracking-wider text-ink uppercase"
            >
              {mode}
            </li>
          ))}
        </ul>
      </Reveal>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
        {PRECEDENCE.map((item, index) => (
          <li key={item.title} className="bg-surface p-6">
            <Reveal delay={index * 0.05}>
              <p className="mono-data text-xs text-mist">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-4 text-base font-medium text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{item.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-base text-ink">
        Manual instrumentation is the fallback, not the product.
      </p>
    </Section>
  );
}
