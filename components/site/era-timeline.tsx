import { cn } from "@/lib/utils";

const ERAS: { name: string; premise: string; body: string; current?: boolean }[] = [
  {
    name: "Software 1.0",
    premise: "People adapt to software.",
    body: "Training, manuals, certifications. The interface was fixed and the human was the variable. Adoption meant attendance.",
  },
  {
    name: "DAP 1.0",
    premise: "Guidance is layered on top.",
    body: "Digital adoption platforms put tooltips and walkthroughs over the interface. Useful, but every artifact had to be built and maintained by someone, and each vendor release broke some of it.",
  },
  {
    name: "Copilot era",
    premise: "Every application gets an assistant.",
    body: "Vendors shipped copilots bound to their own data and their own interface. Adoption fragmented across assistants that did not know about one another, or about the work between them.",
  },
  {
    name: "Agent era",
    premise: "Agents can do the work.",
    body: "Work can now be executed across applications by software. The question changed from how to teach people the interface to which parts of the work should still involve a person, and who decides.",
  },
  {
    name: "Synforma era",
    premise: "The adoption layer builds itself.",
    body: "Software that learns how the organization works and continuously determines the best way for humans and AI to accomplish outcomes together. Guidance, assistance and action are decided per step, from evidence.",
    current: true,
  },
];

export function EraTimeline() {
  return (
    <ol className="my-8 rounded-lg border border-line bg-surface">
      {ERAS.map((era, index) => (
        <li
          key={era.name}
          className={cn(
            "grid gap-3 px-5 py-5 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:px-6",
            index > 0 && "border-t border-line",
          )}
        >
          <div className="flex gap-4">
            <div className="flex flex-col items-center" aria-hidden="true">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 rounded-full border",
                  era.current ? "border-ink bg-ink" : "border-line-strong bg-surface",
                )}
              />
              {index < ERAS.length - 1 ? <span className="mt-1 hidden w-px flex-1 bg-line sm:block" /> : null}
            </div>
            <p className={cn("text-sm font-medium", era.current ? "text-ink" : "text-graphite")}>{era.name}</p>
          </div>
          <div>
            <p className="text-base font-medium text-ink">{era.premise}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-graphite">{era.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
