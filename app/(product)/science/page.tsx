import type { Metadata } from "next";
import Link from "next/link";
import { AutomationLevels } from "@/components/science/automation-levels";
import { BarrierModel } from "@/components/science/barrier-model";
import { CitationList } from "@/components/science/citation-list";
import { DecisionPolicy } from "@/components/science/decision-policy";
import { DoNothingPolicy } from "@/components/science/do-nothing";
import { EpistemologyLadder } from "@/components/science/epistemology";
import { FrictionStates } from "@/components/science/friction-states";
import { GuidanceFading } from "@/components/science/guidance-fading";
import { KnowledgeSources } from "@/components/science/knowledge-sources";
import { ScienceSection } from "@/components/science/shell";
import { InterventionRegistry } from "@/components/science/technique-card";
import { CITATIONS } from "@/lib/synforma/science/citations";
import { TECHNIQUES } from "@/lib/synforma/science/techniques";

export const metadata: Metadata = {
  title: "Science",
  description:
    "How Synforma separates evidence from theory, theory from stance, and all three from the product hypothesis it tests per program: the barrier model, the observable interaction states, the intervention registry, the decision policy including doing nothing, guidance fading, the levels of automation, and where its knowledge comes from.",
};

const CONTENTS: { id: string; label: string }[] = [
  { id: "epistemology", label: "Four kinds of claim" },
  { id: "barriers", label: "The barrier model" },
  { id: "friction", label: "Observable interaction states" },
  { id: "registry", label: "Intervention registry" },
  { id: "policy", label: "Decision policy" },
  { id: "do-nothing", label: "Do nothing is a decision" },
  { id: "fading", label: "Guidance fades with mastery" },
  { id: "automation", label: "Guide, Assist, Act" },
  { id: "knowledge", label: "Where knowledge comes from" },
  { id: "references", label: "References" },
];

export default function SciencePage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
      <header>
        <p className="eyebrow">Science · How Synforma decides</p>
        <h1 className="display mt-5 text-balance text-4xl text-ink sm:text-5xl">What we know, what we assume, and what we test</h1>
        <p className="mt-6 text-lg leading-relaxed text-graphite">
          Synforma chooses interventions from a fixed registry with an explainable score, then tests each one against a control cohort. This page
          states which of its claims are evidence, which are theory, which are stance, and which are hypotheses that only your program&rsquo;s runs
          can settle.
        </p>
        <nav aria-label="Contents" className="mt-8">
          <ol className="flex flex-wrap gap-x-5 gap-y-2">
            {CONTENTS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="inline-flex items-baseline gap-2 text-sm text-graphite transition-colors hover:text-ink">
                  <span className="mono-data text-xs text-mist">{String(i + 1).padStart(2, "0")}</span>
                  {c.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <dl className="mt-8 grid grid-cols-2 gap-4 border-y border-line py-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="eyebrow">Techniques</dt>
            <dd className="mono-data mt-1 text-ink">{TECHNIQUES.length}</dd>
          </div>
          <div>
            <dt className="eyebrow">Barriers</dt>
            <dd className="mono-data mt-1 text-ink">6</dd>
          </div>
          <div>
            <dt className="eyebrow">Citations</dt>
            <dd className="mono-data mt-1 text-ink">{CITATIONS.length}</dd>
          </div>
          <div>
            <dt className="eyebrow">Sources outside the registry</dt>
            <dd className="mono-data mt-1 text-ink">0</dd>
          </div>
        </dl>
      </header>

      <div className="mt-14 space-y-14 sm:mt-16 sm:space-y-16">
        <ScienceSection
          id="epistemology"
          index="01"
          eyebrow="Epistemology"
          title="Four kinds of claim, kept apart"
          lede="A product that intervenes in people's work owes them clarity about what it knows. Synforma sorts every statement it relies on into one of four layers, from most to least settled, and never lets a lower layer borrow the standing of a higher one."
        >
          <EpistemologyLadder />
        </ScienceSection>

        <ScienceSection
          id="barriers"
          index="02"
          eyebrow="Theoretical model"
          title="The barrier model"
          lede="Six reasons a step might not happen, organized by the three components of COM-B. A model for forming hypotheses, labeled as such."
        >
          <BarrierModel />
        </ScienceSection>

        <ScienceSection
          id="friction"
          index="03"
          eyebrow="Observation"
          title="Observable interaction states, not mental states"
          lede="Nine states of an interaction, each defined by the rule that produces it from the screen, the navigation and, with consent, pointer and keyboard-metadata aggregates. Labeled a product hypothesis, versioned, and never a statement about a person."
        >
          <FrictionStates />
        </ScienceSection>

        <ScienceSection
          id="registry"
          index="04"
          eyebrow="Registry"
          title="The interventions Synforma can choose from"
          lede="The adoption engine selects only from this list. Each entry names its mechanism, the barriers it addresses, its evidence class in the general literature, its cautions, and its sources. Nothing here was written by a language model."
        >
          <InterventionRegistry />
        </ScienceSection>

        <ScienceSection
          id="policy"
          index="05"
          eyebrow="Decision policy"
          title="How a technique is chosen"
          lede="One formula, six terms, every component stored with the intervention so the choice can be read back later."
        >
          <DecisionPolicy />
        </ScienceSection>

        <ScienceSection
          id="do-nothing"
          index="06"
          eyebrow="Decision policy"
          title="Do nothing is a decision"
          lede="Silence is a scored candidate in every decision, and the one that wins most often. How it is scored, and why the false-intervention rate is a quality metric rather than a footnote."
        >
          <DoNothingPolicy />
        </ScienceSection>

        <ScienceSection
          id="fading"
          index="07"
          eyebrow="Proficiency"
          title="Guidance fades with mastery"
          lede="Assistance is meant to leave. A per-step rule lowers guidance after repeated unassisted success and restores it after errors; the person can override it in either direction."
        >
          <GuidanceFading />
        </ScienceSection>

        <ScienceSection
          id="automation"
          index="08"
          eyebrow="Levels of automation"
          title="Guide, Assist, Act"
          lede="Three levels of automation chosen per step, with two invariants that no planner, heuristic or model, can override."
        >
          <AutomationLevels />
        </ScienceSection>

        <ScienceSection
          id="knowledge"
          index="09"
          eyebrow="Knowledge"
          title="Where knowledge comes from"
          lede="Every node in the Work Graph says how Synforma knows it. A fixed authority hierarchy decides what outranks what, and inferences are never allowed to pass as observations."
        >
          <KnowledgeSources />
        </ScienceSection>

        <ScienceSection
          id="references"
          index="10"
          eyebrow="References"
          title="Citations"
          lede="Every research reference used anywhere in Synforma. Each entry is a published work with its DOI, and states carefully what Synforma takes from it."
        >
          <CitationList />
          <p className="mt-8 text-sm leading-relaxed text-slate">
            Want to see the policy at work? Interventions and their &ldquo;Why this?&rdquo; panels appear in{" "}
            <Link href="/demo" className="text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink">
              Mission Control
            </Link>{" "}
            once a program has human runs. Planner and cohort settings live in{" "}
            <Link href="/settings" className="text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink">
              Settings
            </Link>
            .
          </p>
        </ScienceSection>
      </div>
    </article>
  );
}
