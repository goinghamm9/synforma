const LAYERS: { name: string; detail: string; emphasis?: boolean }[] = [
  { name: "Intent Engine", detail: "Turns objectives, requests and observed goals into structured intent." },
  {
    name: "Work Graph",
    detail: "The semantic model of people, roles, objectives, workflows, applications, AI capabilities and outcomes.",
  },
  {
    name: "Reasoning & Orchestration",
    detail: "Guide · Assist · Act. Decides, per step, how humans and AI share the work.",
    emphasis: true,
  },
  { name: "Autonomous Adoption Engine", detail: "Observe, diagnose, intervene, experiment, learn." },
  {
    name: "Universal Interaction Layer",
    detail: "API · MCP · DOM · Accessibility tree · Vision · Browser · SDK · Event streams.",
  },
  { name: "Enterprise ecosystem", detail: "Applications, AI agents, identity providers, data and written policy." },
];

const LEFT_GUARANTEES = ["Identity", "Permissions", "Policy", "Security"];
const RIGHT_GUARANTEES = ["Auditability", "Approvals", "Privacy", "Observability"];

function GuaranteeRail({ items, side }: { items: string[]; side: "left" | "right" }) {
  return (
    <ul
      className={
        side === "left"
          ? "hidden flex-col justify-around border-r border-line pr-5 lg:flex"
          : "hidden flex-col justify-around border-l border-line pl-5 lg:flex"
      }
    >
      {items.map((item) => (
        <li key={item} className="eyebrow whitespace-nowrap">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ArchitectureStack() {
  return (
    <figure className="my-8 rounded-lg border border-line-strong bg-surface-2/50 p-4 sm:p-5">
      <ul className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-1 border-b border-line pb-3 lg:hidden">
        {LEFT_GUARANTEES.map((item) => (
          <li key={item} className="eyebrow">
            {item}
          </li>
        ))}
      </ul>
      <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto]">
        <GuaranteeRail items={LEFT_GUARANTEES} side="left" />
        <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {LAYERS.map((layer, index) => (
            <li
              key={layer.name}
              className={
                layer.emphasis
                  ? "grid gap-1 bg-ink px-5 py-4 text-paper sm:grid-cols-[14rem_1fr] sm:gap-6"
                  : "grid gap-1 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6"
              }
            >
              <div className="flex items-baseline gap-3">
                <span className={layer.emphasis ? "mono-data text-xs text-paper/60" : "mono-data text-xs text-mist"}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium">{layer.name}</span>
              </div>
              <p className={layer.emphasis ? "text-sm leading-relaxed text-paper/80" : "text-sm leading-relaxed text-graphite"}>
                {layer.detail}
              </p>
            </li>
          ))}
        </ol>
        <GuaranteeRail items={RIGHT_GUARANTEES} side="right" />
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 border-t border-line pt-3 lg:hidden">
        {RIGHT_GUARANTEES.map((item) => (
          <li key={item} className="eyebrow">
            {item}
          </li>
        ))}
      </ul>
      <figcaption className="mt-4 text-center text-xs leading-relaxed text-slate">
        The stack, top to bottom. The eight guarantees around it apply to every layer.
      </figcaption>
    </figure>
  );
}
