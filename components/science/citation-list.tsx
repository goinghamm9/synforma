import { ExternalLink } from "lucide-react";
import { CITATIONS } from "@/lib/synforma/science/citations";

export function CitationList() {
  if (!CITATIONS.length) {
    return <p className="rounded-lg border border-dashed border-line-strong p-6 text-sm text-slate">The citation registry is empty.</p>;
  }
  return (
    <ol className="divide-y divide-line border-y border-line">
      {CITATIONS.map((c, i) => (
        <li key={c.id} id={`ref-${c.id}`} className="scroll-mt-20 grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
          <div className="mono-data text-xs text-mist sm:col-span-1">[{i + 1}]</div>
          <div className="sm:col-span-11">
            <p className="text-sm leading-relaxed text-ink">
              {c.authors} ({c.year}). {c.title}. <span className="italic text-graphite">{c.venue}</span>.
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <a
                href={`https://doi.org/${c.doi}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink"
              >
                <span className="mono-data">doi:{c.doi}</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <code className="mono-data text-mist">{c.id}</code>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-graphite">
              <span className="font-medium text-ink">What Synforma takes from it. </span>
              {c.relevance}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
