import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { CITATIONS, CITATION_BY_ID } from "@/lib/synforma/science/citations";
import type { EvidenceClass, ExecutionMode } from "@/lib/synforma/types";
import { EVIDENCE_LABEL } from "@/lib/synforma/science/techniques";
import { cn } from "@/lib/utils";

/** Journal-style section: index, eyebrow, hairline, display title, optional lede. */
export function ScienceSection({
  id,
  index,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 border-t border-line pt-10 sm:pt-12">
      <p className="eyebrow flex items-center gap-3">
        <span className="mono-data text-mist">{index}</span>
        <span>{eyebrow}</span>
      </p>
      <h2 id={`${id}-heading`} className="display mt-4 text-balance text-2xl text-ink sm:text-3xl">
        {title}
      </h2>
      {lede ? <p className="mt-4 max-w-2xl text-[1.0625rem] leading-[1.7] text-graphite">{lede}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "[&>p]:mt-4 [&>p]:text-[0.98rem] [&>p]:leading-[1.75] [&>p]:text-graphite [&>p:first-child]:mt-0",
        "[&_strong]:font-medium [&_strong]:text-ink [&_em]:not-italic [&_em]:text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small uppercase label for a kind of claim ("Theoretical model"). */
export function ClaimTag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "amber" | "verdant" | "outline" }) {
  return <Badge variant={tone}>{children}</Badge>;
}

const CITATION_INDEX: Record<string, number> = Object.fromEntries(CITATIONS.map((c, i) => [c.id, i + 1]));

export function citationNumber(id: string): number | undefined {
  return CITATION_INDEX[id];
}

/** Short author form for inline references: "Michie et al. 2011". */
export function shortAuthors(authors: string): string {
  const names = authors.split(",").map((a) => a.trim().split(" ")[0]);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} et al.`;
}

/** Inline reference to a registry citation, linked to the reference list. Renders nothing for unknown ids. */
export function Cite({ id, className }: { id: string; className?: string }) {
  const c = CITATION_BY_ID[id];
  const n = citationNumber(id);
  if (!c || !n) return null;
  return (
    <a
      href={`#ref-${c.id}`}
      className={cn("inline-flex items-baseline gap-1 whitespace-nowrap text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink", className)}
      aria-label={`Reference ${n}: ${c.title}`}
    >
      <span>
        {shortAuthors(c.authors)} {c.year}
      </span>
      <span className="mono-data text-[0.7em] text-mist">[{n}]</span>
    </a>
  );
}

export const EVIDENCE_TONE: Record<EvidenceClass, "verdant" | "amber" | "outline" | "muted"> = {
  strong: "verdant",
  promising: "amber",
  theoretical: "outline",
  philosophical: "muted",
  experimental: "muted",
};

export function EvidenceBadge({ evidence }: { evidence: EvidenceClass }) {
  return <Badge variant={EVIDENCE_TONE[evidence]}>{EVIDENCE_LABEL[evidence]}</Badge>;
}

export const MODE_LABEL: Record<ExecutionMode, string> = { guide: "Guide", assist: "Assist", act: "Act" };

export function ModeBadge({ mode }: { mode: ExecutionMode }) {
  return <Badge variant={mode === "act" ? "default" : mode === "assist" ? "outline" : "muted"}>{MODE_LABEL[mode]}</Badge>;
}
