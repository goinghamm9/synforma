import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ArchitectureStack } from "@/components/site/architecture-stack";
import { CapabilityRouter } from "@/components/site/capability-router";
import { EraTimeline } from "@/components/site/era-timeline";
import { ArticleSection, Prose, PullQuote } from "@/components/site/prose";
import { Container } from "@/components/site/section";

export const metadata: Metadata = {
  title: "Thesis",
  description:
    "Why the adoption layer should build itself: the history of the interface problem, the two jobs of Synforma, the architecture, and the three prototypes.",
};

const TOC: { id: string; label: string }[] = [
  { id: "assumption", label: "The assumption" },
  { id: "history", label: "A short history" },
  { id: "ai-to-ai", label: "Why AI-to-AI matters" },
  { id: "two-jobs", label: "The two jobs" },
  { id: "architecture", label: "The architecture" },
  { id: "prototypes", label: "Three prototypes" },
  { id: "measure", label: "What we measure" },
];

const BEHAVIORS: { who: string; what: string }[] = [
  { who: "Managers", what: "giving specific, timely feedback instead of deferring it to the review cycle." },
  { who: "Sales representatives", what: "asking discovery questions before proposing, and recording the answers." },
  { who: "Employees", what: "verifying AI output before it enters a system of record or a customer’s inbox." },
  { who: "Engineers", what: "doing code review with attention, rather than approving to clear a queue." },
  { who: "Leaders", what: "delegating with a stated outcome and a decision boundary, not a task list." },
  { who: "Everyone", what: "following the security practices that only matter on the day they matter." },
];

const PROTOTYPES: { index: string; name: string; status: string; variant: "verdant" | "amber"; body: string }[] = [
  {
    index: "P1",
    name: "Zero authored guidance for an unfamiliar application",
    status: "Runs in this build",
    variant: "verdant",
    body: "Synforma is given an application it has never seen and an objective in plain language. It explores without committing, learns the interface semantically, identifies the workflow, performs it, guides a person, observes another, detects struggle, generates assistance, and measures completion. This is the demo.",
  },
  {
    index: "P2",
    name: "Cross-application intent",
    status: "Next",
    variant: "amber",
    body: "One objective that spans several applications and several agents. Synforma composes the workflow across them, routes each step to the right capability under policy, and keeps a single audit trail for the whole outcome.",
  },
  {
    index: "P3",
    name: "Behavioral learning",
    status: "Foundations in the demo",
    variant: "amber",
    body: "The system learns which interventions change which behaviors for which barriers, in which contexts, and stops using what does not work. The demo’s struggle detection and cohort experiments are the first layer; learning across programs and organizations is the rest.",
  },
];

export default function ThesisPage() {
  return (
    <article>
      <header className="border-b border-line">
        <Container className="py-16 sm:py-24">
          <p className="eyebrow">Thesis · Autonomous Digital Adoption</p>
          <h1 className="display mt-6 max-w-4xl text-balance text-4xl text-ink sm:text-5xl lg:text-6xl">
            Stop teaching people software. Let software understand people.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-graphite">
            Why the adoption layer should build itself, what it has to be trusted with, and how
            Synforma is structured to earn that trust.
          </p>
        </Container>
      </header>

      <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-12 lg:gap-8">
        <aside className="lg:col-span-3">
          <nav aria-label="Table of contents" className="lg:sticky lg:top-24">
            <p className="eyebrow">Contents</p>
            <ol className="mt-4 space-y-2 border-l border-line">
              {TOC.map((item, index) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="-ml-px flex items-baseline gap-3 border-l border-transparent pl-4 text-sm text-graphite transition-colors hover:border-ink hover:text-ink"
                  >
                    <span className="mono-data text-xs text-mist">{String(index + 1).padStart(2, "0")}</span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="space-y-14 lg:col-span-8 lg:col-start-5">
          <ArticleSection id="assumption" index="01" title="The assumption we reject">
            <Prose>
              <p>
                Every digital adoption product built so far rests on one assumption: that someone
                must build the adoption layer. Someone opens a builder. Someone tags the elements
                on the page. Someone authors the walkthrough, records the flow, writes the tooltip
                and assigns it to a segment. And when the vendor moves the button, someone repairs
                it. The people who do this work are skilled and busy, and their backlog is the real
                ceiling on how much of an organization’s software is ever covered.
              </p>
              <p>
                We reject that assumption. Synforma starts from the premise that the adoption layer
                can build itself: that software can learn how an organization works, across every
                application and every AI agent, and continuously determine the best way for humans
                and AI to accomplish an outcome together. Not once, at rollout, but for as long as
                the organization and its software keep changing.
              </p>
              <PullQuote>Software that learns how your organization works, and continuously makes it work better.</PullQuote>
              <p>
                The rest of this document explains where that premise comes from, what it requires,
                and what we have built to test it.
              </p>
            </Prose>
          </ArticleSection>

          <ArticleSection id="history" index="02" title="A short history of the interface problem">
            <Prose>
              <p>
                The relationship between people and enterprise software has moved through four
                eras. Each one changed who adapts to whom.
              </p>
            </Prose>
            <EraTimeline />
            <Prose>
              <p>
                The first three eras share a structure. There is a person, there is an application,
                and between them a stack of interface: menu, page, form, button, database. Adoption
                meant teaching the person to traverse that stack, or decorating it so the traversal
                hurt less. The agent era makes the stack optional for the first time. When software
                can operate the interface, the interesting question is no longer how to explain it,
                but when a person should be involved at all, and how that decision gets made
                responsibly.
              </p>
              <p>
                That is the question Synforma exists to answer, continuously, per step, from
                evidence.
              </p>
            </Prose>
          </ArticleSection>

          <ArticleSection id="ai-to-ai" index="03" title="Why AI-to-AI matters">
            <Prose>
              <p>
                Organizations now buy intelligence from several vendors at once. ChatGPT Enterprise
                for one group, Claude for another, Gemini inside the productivity suite, Copilot
                inside the operating system, Agentforce inside the CRM, and a growing number of
                internal agents built by their own teams. Each is capable. None of them knows about
                the others, and none of them knows how the organization’s work actually flows
                between them.
              </p>
              <p>
                The result is a new adoption problem on top of the old one. People are asked to
                learn not only the applications, but which assistant to use for what, with which
                data, under which rules. Most do not. The intelligence is purchased and the
                behavior does not change.
              </p>
            </Prose>
            <CapabilityRouter />
            <Prose>
              <p>
                Synforma treats every one of these as a capability in the Work Graph, with a
                declared scope, a permission model and a cost. When a person’s intent arrives,
                Synforma decides which capability is permitted, which is best suited, what data may
                be passed to it, and what must be checked when the result comes back. The person
                does not have to know which agent did the work. The audit trail always does.
              </p>
              <p>
                This is why the interaction layer has to be universal. A capability router that can
                reach only some of the organization’s software routes around the rest, and the rest
                is where most of the work still happens.
              </p>
            </Prose>
          </ArticleSection>

          <ArticleSection id="two-jobs" index="04" title="The two jobs">
            <Prose>
              <p>
                Synforma has exactly two jobs, and it is important that they stay distinct.
              </p>
              <p>
                <strong>The first job is to execute work.</strong> Where there is little value in a
                person operating an interface, Synforma operates it: under authorization, with
                logging, with approval before anything is committed, and with a plain-language
                account of what it did. This is the job people expect from an agent, and it is the
                easier of the two.
              </p>
              <p>
                <strong>The second job is to change human behavior where it matters.</strong> Some
                of the most valuable work in an organization cannot and should not be automated.
                It should be done better, more consistently, by the people whose judgment it
                requires. Synforma’s Guide and Assist modes exist for this job. They are grounded
                in observed behavior, delivered in the moment the behavior is relevant, and tested
                against a control so that the organization learns what actually moves people rather
                than what a designer hoped would.
              </p>
            </Prose>
            <ul className="my-8 divide-y divide-line rounded-lg border border-line bg-surface">
              {BEHAVIORS.map((item) => (
                <li key={item.who} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <span className="text-sm font-medium text-ink">{item.who}</span>
                  <span className="text-sm leading-relaxed text-graphite">{item.what}</span>
                </li>
              ))}
            </ul>
            <Prose>
              <p>
                In each of these the software is incidental. What matters is whether a manager
                said the difficult thing, whether the representative asked before pitching, whether
                the engineer read the diff. A system that only executes work leaves these untouched.
                A system that only nudges people leaves the tedious work in place. Synforma is
                built to do both, and to be explicit about which one it is doing at every step.
              </p>
            </Prose>
          </ArticleSection>

          <ArticleSection id="architecture" index="05" title="The architecture">
            <Prose>
              <p>
                The system is a stack of six layers, wrapped by eight guarantees that apply to all
                of them. The guarantees are not a layer of their own, because a control that lives
                in one place can be bypassed from another.
              </p>
            </Prose>
            <ArchitectureStack />
            <Prose>
              <p>
                <strong>The Intent Engine</strong> accepts objectives from leaders, requests from
                individuals, and goals inferred from what people are observed trying to do. It turns
                them into structured intent: a population, a behavior, the eligible moments, the
                constraints and the definition of success.
              </p>
              <p>
                <strong>The Work Graph</strong> is the model of how work happens: people, roles,
                objectives, workflows, applications, AI capabilities and outcomes, connected by
                typed edges, each with a confidence. It is inferred, not authored, and it is
                versioned so that every decision can be traced to the shape of the graph at the
                time.
              </p>
              <p>
                <strong>Reasoning and Orchestration</strong> assigns each step of each workflow to
                Guide, Assist or Act, and revises the assignment as evidence accumulates. This is
                where the two jobs are reconciled.
              </p>
              <p>
                <strong>The Autonomous Adoption Engine</strong> runs the loop: observe, diagnose,
                intervene, experiment, learn. It proposes interventions from a library of
                techniques with stated evidence, tests them against controls, and retires what does
                not work.
              </p>
              <p>
                <strong>The Universal Interaction Layer</strong> reaches the work through whichever
                channel is most reliable: APIs and event streams where they exist, the DOM and the
                accessibility tree where they do not, vision where semantics are missing, and an SDK
                for internal applications. Manual instrumentation is the fallback, not the product.
              </p>
              <p>
                <strong>The enterprise ecosystem</strong> is everything Synforma sits on: the
                applications, the agents, the identity provider, the data and the written policy.
                Synforma does not replace any of it. It learns it.
              </p>
            </Prose>
          </ArticleSection>

          <ArticleSection id="prototypes" index="06" title="Three prototypes">
            <Prose>
              <p>
                The thesis is testable, and we are testing it in order of difficulty. Each
                prototype answers one question that the next one depends on.
              </p>
            </Prose>
            <ol className="my-8 space-y-4">
              {PROTOTYPES.map((prototype) => (
                <li key={prototype.index} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="mono-data text-xs text-mist">{prototype.index}</span>
                      <h3 className="text-lg font-medium tracking-tight text-ink">{prototype.name}</h3>
                    </div>
                    <Badge variant={prototype.variant}>{prototype.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-graphite">{prototype.body}</p>
                </li>
              ))}
            </ol>
            <Prose>
              <p>
                The first prototype is the one that has to work for the others to matter. If
                Synforma cannot learn an unfamiliar application without configuration, it is a
                better builder, not a different category. The demo exists to make that claim
                falsifiable.
              </p>
            </Prose>
          </ArticleSection>

          <ArticleSection id="measure" index="07" title="What we measure">
            <Prose>
              <p>
                The north-star metric is the <strong>Intent-to-Outcome Rate</strong>: of the work
                outcomes people intend to accomplish, how many actually happen, correctly,
                efficiently and compliantly. It is the only number the system is built to move.
              </p>
              <p>
                We do not optimize monthly active users, walkthroughs viewed, tooltips dismissed or
                minutes spent in an application. Each of those can rise while the work gets worse.
                They are reported when they help diagnose a problem, and never treated as success.
              </p>
              <p>
                Everything above reduces to a single claim: an organization should be able to state
                the outcome it wants, and the software should figure out the rest, with people
                involved exactly where they add value and nowhere else. The demo is the shortest
                path to deciding whether that claim is true.
              </p>
            </Prose>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/demo">
                  Run the zero-authoring demo
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/graph">Explore the Work Graph</Link>
              </Button>
            </div>
          </ArticleSection>
        </div>
      </Container>
    </article>
  );
}
