const CAPABILITIES = ["ChatGPT", "Claude", "Gemini", "Microsoft Copilot", "Agentforce", "Internal agents"];

/** Intent enters once; Synforma routes it to whichever capability is permitted and best suited. */
export function CapabilityRouter() {
  return (
    <figure className="my-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
        <div className="rounded-md border border-line-strong bg-surface px-4 py-3 text-center">
          <p className="eyebrow">Input</p>
          <p className="mt-1 text-sm font-medium text-ink">A person’s intent</p>
        </div>
        <span aria-hidden="true" className="hidden text-mist sm:block">
          →
        </span>
        <div className="rounded-md border border-ink bg-ink px-4 py-3 text-center text-paper">
          <p className="eyebrow text-paper/70">Synforma</p>
          <p className="mt-1 text-sm font-medium">Capability router</p>
          <p className="mt-1 text-xs text-paper/70">permissions · policy · fit · cost · audit</p>
        </div>
        <span aria-hidden="true" className="hidden text-mist sm:block">
          →
        </span>
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
          {CAPABILITIES.map((capability) => (
            <li
              key={capability}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-center text-xs text-ink sm:text-left"
            >
              {capability}
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-4 text-xs leading-relaxed text-slate">
        The person states what they need. Synforma selects the capability, applies the policy, passes
        only the data that is allowed, and records which agent did what.
      </figcaption>
    </figure>
  );
}
