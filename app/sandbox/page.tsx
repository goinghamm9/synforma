import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_TARGETS } from "@/lib/synforma/targets";

export const metadata: Metadata = {
  title: "Demo applications",
  description: "The fictional applications Synforma is demonstrated on. Each is a replica of a category of enterprise software with no Synforma hooks.",
};

/** The target applications, standalone. Every one is a fictional replica built for the demonstration. */
export default function SandboxIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Demo applications</p>
      <h1 className="mt-2 text-2xl font-medium text-ink">Applications Synforma has never been configured for</h1>
      <p className="mt-3 text-sm leading-relaxed text-graphite">
        Each one is a fictional replica of a category of enterprise software, built for this demonstration and labelled as such in its own footer. None of them contains a connector, a selector or any hook for Synforma; the engine reads them through generic semantics only. Open one to use it as its own users would, or run the demo on it from Mission Control.
      </p>
      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DEMO_TARGETS.map((t) => (
          <li key={t.id} className="rounded-lg border border-line bg-surface p-4" data-testid={`sandbox-card-${t.id}`}>
            <p className="text-base font-medium text-ink">{t.name}</p>
            <p className="mt-0.5 text-xs text-slate">
              {t.category} · v{t.version}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-graphite">{t.replicaNote}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={t.baseUrl} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2">
                Open the application
              </Link>
              <Link href={`/demo?target=${t.id}`} className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper hover:bg-graphite">
                Run the demo on it
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
