import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "./reveal";
import { Section, SectionHeader } from "./section";

interface Connector {
  name: string;
  kind: string;
  status: "roadmap" | "connected";
  href?: string;
}

const CONNECTORS: Connector[] = [
  { name: "Meridian CRM (sandbox)", kind: "Bundled application", status: "connected", href: "/demo" },
  { name: "Microsoft 365", kind: "Productivity suite", status: "roadmap" },
  { name: "Google Workspace", kind: "Productivity suite", status: "roadmap" },
  { name: "Salesforce", kind: "CRM", status: "roadmap" },
  { name: "Slack", kind: "Messaging", status: "roadmap" },
  { name: "Teams", kind: "Messaging", status: "roadmap" },
  { name: "ServiceNow", kind: "Service management", status: "roadmap" },
  { name: "Workday", kind: "HR and finance", status: "roadmap" },
  { name: "ChatGPT Enterprise", kind: "AI assistant", status: "roadmap" },
  { name: "Claude", kind: "AI assistant", status: "roadmap" },
  { name: "Gemini", kind: "AI assistant", status: "roadmap" },
  { name: "Microsoft Copilot", kind: "AI assistant", status: "roadmap" },
  { name: "GitHub", kind: "Engineering", status: "roadmap" },
  { name: "Jira", kind: "Work tracking", status: "roadmap" },
  { name: "Internal applications", kind: "SDK / API / MCP", status: "roadmap" },
];

function ConnectorTile({ connector, index }: { connector: Connector; index: number }) {
  const connected = connector.status === "connected";
  return (
    <li className="bg-surface">
      <Reveal delay={Math.min(index, 8) * 0.03} className="flex h-full flex-col justify-between gap-6 p-5">
        <div>
          <p className="text-base font-medium text-ink">{connector.name}</p>
          <p className="mt-1 text-xs text-slate">{connector.kind}</p>
        </div>
        {connected && connector.href ? (
          <Link
            href={connector.href}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-verdant/40 bg-verdant-soft px-2.5 py-1 text-xs font-medium text-verdant transition-colors hover:border-verdant"
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Connected
            <span className="sr-only">, open the demo</span>
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex w-fit items-center rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-mist"
          >
            Roadmap
          </span>
        )}
      </Reveal>
    </li>
  );
}

export function ConnectEnterprise() {
  return (
    <Section>
      <SectionHeader
        index="08"
        eyebrow="Connect your enterprise"
        title="Your applications, your agents, your policies."
        lede="Synforma sits across the software an organization already runs and the AI it has already bought. Each connection adds to one Work Graph, one policy model and one audit trail."
      />

      <ul className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {CONNECTORS.map((connector, index) => (
          <ConnectorTile key={connector.name} connector={connector} index={index} />
        ))}
      </ul>

      <p className="mt-6 text-sm text-slate">
        Prototype status: the bundled sandbox application is connected today; enterprise connectors
        are on the roadmap.
      </p>
    </Section>
  );
}
