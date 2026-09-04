import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const FINDINGS: { title: string; body: string }[] = [
  { title: "Friction", body: "Steps that take too long, require too many attempts, or send people back to a previous screen." },
  { title: "Permission issues", body: "Actions the target role cannot actually perform, discovered before a person hits the wall." },
  { title: "Ambiguity", body: "Fields and choices whose meaning is unclear from the interface alone, where people will guess." },
  { title: "Missing documentation", body: "Places where the application expects knowledge that exists nowhere Synforma can find it." },
  { title: "Failure states", body: "Validation errors, timeouts and dead ends, along with what it takes to recover from each." },
  { title: "Policy conflicts", body: "Workflows that cannot be completed without violating a rule the organization has written down." },
];

/**
 * A deterministic illustration of one simulation pass: most attempts complete,
 * a few surface friction, a few are blocked. The pattern is fixed, not data.
 */
const CELLS = Array.from({ length: 96 }, (_, index) => {
  if (index % 23 === 7) return "blocked";
  if (index % 11 === 4) return "friction";
  return "completed";
});

export function Simulation() {
  return (
    <Section>
      <SectionHeader
        index="07"
        eyebrow="Simulation before rollout"
        title="Synthetic users find the friction before employees do."
        lede="Before a program reaches a single person, synthetic users attempt the workflow hundreds of times, with different starting states, different data and different mistakes. Each attempt is logged and diagnosed like a real one."
      />

      <div className="mt-16 grid gap-8 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <figure className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">One simulation pass</p>
              <p className="text-xs text-slate">Illustration, not data</p>
            </div>
            <div className="mt-4 grid grid-cols-12 gap-1" aria-hidden="true">
              {CELLS.map((cell, index) => (
                <span
                  key={index}
                  className={cn(
                    "aspect-square rounded-[2px]",
                    cell === "completed" && "bg-surface-3",
                    cell === "friction" && "bg-amber/70",
                    cell === "blocked" && "bg-signal/80",
                  )}
                />
              ))}
            </div>
            <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-surface-3" /> Completed
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-amber/70" /> Friction surfaced
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-signal/80" /> Blocked
              </span>
            </figcaption>
          </figure>
        </Reveal>

        <div className="lg:col-span-7">
          <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
            {FINDINGS.map((finding, index) => (
              <li key={finding.title} className="bg-surface p-5">
                <Reveal delay={index * 0.04}>
                  <h3 className="text-base font-medium text-ink">{finding.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">{finding.body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
