import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

const STEPS = [
  "Is given an application it has never seen and an objective in plain language.",
  "Explores the application without committing anything.",
  "Understands the interface by role, label and meaning, not by selector.",
  "Identifies the workflow that fulfils the objective.",
  "Performs the workflow itself, under approval controls.",
  "Guides a human through the same workflow.",
  "Observes another human attempt it unaided.",
  "Detects where they struggle and infers why.",
  "Creates contextual assistance for that moment, dynamically.",
  "Knows when to execute the step instead, and measures completion.",
];

const QA: { question: string; answer: string }[] = [
  { question: "You didn’t configure this?", answer: "No." },
  { question: "You didn’t build the walkthrough?", answer: "No." },
  { question: "You didn’t tag the UI?", answer: "No." },
  { question: "It figured out the workflow itself?", answer: "Yes." },
];

export function MagicTrick() {
  return (
    <Section id="demo">
      <SectionHeader
        index="11"
        eyebrow="One magic trick"
        title="An application it has never seen. An objective in plain language. Nothing else."
        lede="The demo is deliberately narrow. It shows the one thing that has to be true for everything else on this page to matter: that the adoption layer can build itself."
      />

      <div className="mt-16 grid gap-8 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <div className="rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-5 py-3">
              <p className="eyebrow">In one session, Synforma</p>
            </div>
            <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
              {STEPS.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 px-5 py-4 sm:border-b sm:border-line sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <span className="mono-data mt-0.5 text-xs text-mist">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm leading-relaxed text-graphite">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <Reveal delay={0.08}>
            <dl className="rounded-lg border border-line bg-surface-2/60 p-6">
              {QA.map((item) => (
                <div key={item.question} className="flex items-baseline justify-between gap-6 border-b border-line py-3 last:border-b-0">
                  <dt className="text-base text-graphite">{item.question}</dt>
                  <dd className="text-base font-medium text-ink">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="rounded-lg border border-line bg-surface p-6">
              <p className="text-base leading-relaxed text-graphite">
                The demo runs in the browser against a bundled sandbox CRM that contains no Synforma
                hooks, ids or data attributes. Every action it takes is visible and logged.
              </p>
              <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
                <Link href="/demo">
                  Run the demo
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
