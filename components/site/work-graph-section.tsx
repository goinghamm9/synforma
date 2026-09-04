import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

interface GraphLayer {
  name: string;
  edge: string;
  nodes: { label: string; status?: "observed" | "hypothesis" }[];
}

const LAYERS: GraphLayer[] = [
  {
    name: "Person",
    edge: "Identity-linked. A seat, not a segment.",
    nodes: [{ label: "Signed-in employee" }],
  },
  {
    name: "Role",
    edge: "Person → holds",
    nodes: [{ label: "Account Executive" }],
  },
  {
    name: "Objectives",
    edge: "Role → pursues",
    nodes: [{ label: "Build pipeline" }, { label: "Prepare for meetings" }, { label: "Update CRM" }],
  },
  {
    name: "Workflows",
    edge: "Objective → fulfilled by",
    nodes: [
      { label: "Prospect research" },
      { label: "Meeting preparation" },
      { label: "Follow-up" },
      { label: "Opportunity management" },
    ],
  },
  {
    name: "Applications",
    edge: "Workflow → performed in",
    nodes: [
      { label: "Salesforce" },
      { label: "Gmail" },
      { label: "Slack" },
      { label: "Zoom" },
      { label: "ChatGPT" },
    ],
  },
  {
    name: "AI capabilities",
    edge: "Workflow → augmented by",
    nodes: [
      { label: "Account research" },
      { label: "Call summarization" },
      { label: "Draft generation" },
      { label: "CRM extraction", status: "hypothesis" },
    ],
  },
  {
    name: "Outcomes",
    edge: "Workflow → produces",
    nodes: [
      { label: "Time saved" },
      { label: "CRM completeness" },
      { label: "Meetings booked" },
      { label: "Pipeline generated", status: "hypothesis" },
    ],
  },
];

function GraphDiagram() {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface">
      <ol className="divide-y divide-line">
        {LAYERS.map((layer, index) => (
          <li
            key={layer.name}
            className="grid gap-3 px-5 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8 sm:px-6"
          >
            <div className="flex gap-4">
              <div className="flex flex-col items-center" aria-hidden="true">
                <span className="mt-1.5 h-2 w-2 rounded-full border border-ink bg-surface" />
                {index < LAYERS.length - 1 ? (
                  <span className="mt-1 hidden w-px flex-1 bg-line-strong sm:block" />
                ) : null}
              </div>
              <div>
                <p className="eyebrow text-ink">{layer.name}</p>
                <p className="mt-1 text-xs text-slate">{layer.edge}</p>
              </div>
            </div>
            <ul className="flex flex-wrap gap-2">
              {layer.nodes.map((node) => (
                <li
                  key={node.label}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-sm",
                    node.status === "hypothesis"
                      ? "border-dashed border-amber/60 bg-amber-soft/40 text-amber"
                      : "border-line-strong bg-surface text-ink",
                  )}
                >
                  {node.label}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <figcaption className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-surface-2/60 px-5 py-3 text-xs text-slate sm:px-6">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-line-strong bg-surface" />
          Observed
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-dashed border-amber/60 bg-amber-soft/40" />
          Current hypothesis, pending evidence
        </span>
        <span className="sm:ml-auto">Example graph for one role. Every edge carries a confidence.</span>
      </figcaption>
    </figure>
  );
}

export function WorkGraphSection() {
  return (
    <Section id="graph">
      <SectionHeader
        index="03"
        eyebrow="The Work Graph"
        title="Not a map of web pages. A semantic model of how work happens."
        lede="Synforma builds and maintains a graph that connects people to roles, roles to objectives, objectives to workflows, workflows to the applications and AI capabilities that perform them, and all of it to outcomes. Nothing in it is a selector. Nothing in it is entered by hand."
      />

      <Reveal className="mt-16">
        <GraphDiagram />
      </Reveal>

      <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-graphite">
          The graph is inferred from observation, corrected by evidence, and versioned. When a
          workflow changes, the graph changes with it, and every intervention that depended on the
          old shape is re-evaluated.
        </p>
        <Button asChild variant="outline">
          <Link href="/graph">
            Explore the 3D Work Graph
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
