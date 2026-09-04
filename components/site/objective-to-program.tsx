import { Badge } from "@/components/ui";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

type Provenance = "stated" | "inferred" | "measured";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  stated: "Stated",
  inferred: "Inferred",
  measured: "Measured",
};

const PROVENANCE_VARIANT: Record<Provenance, "outline" | "amber" | "verdant"> = {
  stated: "outline",
  inferred: "amber",
  measured: "verdant",
};

const OBJECTIVE =
  "We rolled out ChatGPT Enterprise and want our account executives to use it to improve account research and meeting preparation without placing restricted customer data into prompts. We want 80% sustained adoption within 60 days.";

const PROGRAM: { field: string; value: string; provenance: Provenance }[] = [
  {
    field: "Target population",
    value: "Account executives, resolved from the role in the directory rather than from a maintained list.",
    provenance: "stated",
  },
  {
    field: "Target behaviors",
    value: "Use ChatGPT Enterprise for account research before outreach and for preparation before customer meetings.",
    provenance: "inferred",
  },
  {
    field: "Eligible opportunities",
    value: "Upcoming customer meetings on the calendar; accounts with no research activity since the last touch.",
    provenance: "inferred",
  },
  {
    field: "Approved tools",
    value: "ChatGPT Enterprise.",
    provenance: "stated",
  },
  {
    field: "Relevant systems",
    value: "Salesforce, Gmail, the calendar, and ChatGPT Enterprise, as they appear in the Work Graph for this role.",
    provenance: "inferred",
  },
  {
    field: "Policy constraints",
    value: "No restricted customer data in prompts. Enforced where the prompt is composed, using the organization’s data classification.",
    provenance: "stated",
  },
  {
    field: "Baseline",
    value: "How research and preparation happen today, observed before any intervention is shown.",
    provenance: "measured",
  },
  {
    field: "Success",
    value: "80% of eligible opportunities show the behavior, sustained, within 60 days. A login is not adoption; the behavior in the eligible moment is.",
    provenance: "stated",
  },
];

export function ObjectiveToProgram() {
  return (
    <Section>
      <SectionHeader
        index="04"
        eyebrow="From objective to program"
        title="State the outcome. Synforma derives the program."
        lede="A leader describes what should be different. Synforma turns that sentence into a structured program it can pursue, measure and revise. There is no flow builder, because there is nothing to build."
      />

      <div className="mt-16 grid gap-6 lg:grid-cols-12 lg:gap-8">
        <Reveal className="lg:col-span-5">
          <div className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="eyebrow">Objective</p>
              <p className="text-xs text-slate">Typed by a VP of Sales</p>
            </div>
            <blockquote className="px-5 py-6">
              <p className="text-lg leading-relaxed text-ink">“{OBJECTIVE}”</p>
            </blockquote>
            <div className="border-t border-line px-5 py-4 text-xs leading-relaxed text-slate">
              One paragraph, in the leader’s own words. No fields to fill in, no steps to record,
              no elements to select.
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-7">
          <div className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="eyebrow">Derived program</p>
              <p className="text-xs text-slate">Held as a hypothesis, tested continuously</p>
            </div>
            <dl className="divide-y divide-line">
              {PROGRAM.map((row) => (
                <div key={row.field} className="grid gap-2 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="flex items-start justify-between gap-3 sm:flex-col sm:justify-start sm:gap-2">
                    <span className="text-sm font-medium text-ink">{row.field}</span>
                    <Badge variant={PROVENANCE_VARIANT[row.provenance]}>
                      {PROVENANCE_LABEL[row.provenance]}
                    </Badge>
                  </dt>
                  <dd className="text-sm leading-relaxed text-graphite">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </div>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-slate">
        Stated fields come from the objective. Inferred fields come from the Work Graph and are
        marked as hypotheses until evidence confirms them. Measured fields are filled by observation
        before anything changes.
      </p>
    </Section>
  );
}
