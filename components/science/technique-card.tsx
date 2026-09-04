import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";
import { CITATION_BY_ID } from "@/lib/synforma/science/citations";
import { BARRIER_SHORT, TECHNIQUES } from "@/lib/synforma/science/techniques";
import type { InterventionTechnique } from "@/lib/synforma/types";
import { citationNumber, EvidenceBadge, ModeBadge } from "./shell";

export function TechniqueCard({ technique }: { technique: InterventionTechnique }) {
  const citations = technique.sourceIds.map((id) => CITATION_BY_ID[id]).filter(Boolean);
  return (
    <article id={`technique-${technique.id}`} className="scroll-mt-20 rounded-lg border border-line bg-surface p-5 sm:p-6" aria-labelledby={`technique-${technique.id}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`technique-${technique.id}-title`} className="text-lg font-medium leading-tight text-ink">
            {technique.name}
          </h3>
          <code className="mono-data mt-1 block text-[11px] text-mist">{technique.id}</code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={technique.mode} />
          <EvidenceBadge evidence={technique.evidence} />
        </div>
      </header>

      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-[7.5rem_1fr]">
        <dt className="eyebrow pt-0.5">Mechanism</dt>
        <dd className="text-sm leading-relaxed text-ink">{technique.mechanism}</dd>

        <dt className="eyebrow pt-0.5">What it does</dt>
        <dd className="text-sm leading-relaxed text-graphite">{technique.description}</dd>

        <dt className="eyebrow pt-0.5">Example</dt>
        <dd className="border-l border-line pl-3 text-sm leading-relaxed text-graphite">{technique.example}</dd>

        <dt className="eyebrow pt-0.5">Barriers</dt>
        <dd className="flex flex-wrap gap-1.5">
          {technique.barriers.length ? (
            technique.barriers.map((b) => (
              <Badge key={b} variant="muted">
                {BARRIER_SHORT[b]}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-slate">None: a policy action, not a response to a barrier.</span>
          )}
        </dd>

        <dt className="eyebrow pt-0.5">Burden</dt>
        <dd className="flex items-center gap-3 text-sm text-graphite">
          <span className="relative h-1 w-24 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${Math.round(technique.burden * 100)}%` }} />
          </span>
          <span className="mono-data text-xs">{technique.burden.toFixed(2)}</span>
          <span className="text-xs text-slate">on the person, 0 to 1</span>
        </dd>

        <dt className="eyebrow pt-0.5">Cautions</dt>
        <dd className="text-sm leading-relaxed text-graphite">
          {technique.cautions.length ? (
            <ul className="list-disc space-y-1 pl-4">
              {technique.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <span className="text-slate">None recorded.</span>
          )}
        </dd>

        <dt className="eyebrow pt-0.5">Sources</dt>
        <dd>
          {citations.length ? (
            <ul className="space-y-2">
              {citations.map((c) => (
                <li key={c.id} className="text-sm leading-relaxed text-graphite">
                  <span className="mono-data mr-2 text-[11px] text-mist">[{citationNumber(c.id)}]</span>
                  <span className="text-ink">{c.authors}</span> ({c.year}). {c.title}. <span className="italic">{c.venue}</span>.{" "}
                  <a
                    href={`https://doi.org/${c.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 whitespace-nowrap text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink"
                  >
                    doi:{c.doi}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-slate">No registry sources.</span>
          )}
        </dd>
      </dl>
    </article>
  );
}

export function InterventionRegistry() {
  if (!TECHNIQUES.length) {
    return <p className="rounded-lg border border-dashed border-line-strong p-6 text-sm text-slate">The technique registry is empty.</p>;
  }
  return (
    <div className="space-y-4">
      {TECHNIQUES.map((t) => (
        <TechniqueCard key={t.id} technique={t} />
      ))}
    </div>
  );
}
