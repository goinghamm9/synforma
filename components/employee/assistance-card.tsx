"use client";
import { useState } from "react";
import { ChevronDown, Loader2, ThumbsDown, Wand2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader } from "@/components/ui";
import { BARRIER_LABEL, BARRIER_SHORT, EVIDENCE_LABEL, TECHNIQUE_BY_ID } from "@/lib/synforma/science/techniques";
import { cite } from "@/lib/synforma/science/citations";
import type { EvidenceClass, Hypothesis, Intervention, WorkflowStep } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";

const EVIDENCE_VARIANT: Record<EvidenceClass, "verdant" | "amber" | "muted"> = {
  strong: "verdant",
  promising: "verdant",
  theoretical: "amber",
  philosophical: "amber",
  experimental: "muted",
};

interface AssistanceCardProps {
  intervention: Intervention;
  hypothesis: Hypothesis | null;
  step: WorkflowStep | null;
  assisting: boolean;
  onGotIt: () => void;
  onNotHelpful: () => void;
  onDoItForMe: () => void;
}

function sourceLine(source: string | undefined): string | null {
  if (!source) return null;
  if (/^objective requirement/i.test(source)) return `From ${source.charAt(0).toLowerCase()}${source.slice(1)}`;
  return `Based on: ${source}`;
}

/** One assistance card at a time, anchored in the panel and mirrored on the overlay. */
export function AssistanceCard({ intervention, hypothesis, step, assisting, onGotIt, onNotHelpful, onDoItForMe }: AssistanceCardProps) {
  const [why, setWhy] = useState(false);
  const technique = TECHNIQUE_BY_ID[intervention.techniqueId];
  const source = sourceLine(intervention.content.source);
  const canAssist = intervention.content.offerAssist && step && !step.judgment;
  return (
    <Card className="border-signal/40" data-testid="assistance-card" role="region" aria-label="Synforma assistance">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-signal">Synforma · assistance</p>
          <span className="text-[11px] text-slate">{intervention.generatedBy === "gemini" ? "Composed by Gemini" : "Composed by the heuristic planner"}</span>
        </div>
        <h2 className="text-[15px] font-medium leading-snug text-ink">{intervention.content.title}</h2>
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-graphite">{intervention.content.body}</p>
        {source ? <p className="text-[12px] text-slate">{source}</p> : null}
      </CardHeader>
      <CardContent className="p-4">
        {technique ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate">
            <span>Technique</span>
            <Badge variant="outline">{technique.name}</Badge>
            <Badge variant={EVIDENCE_VARIANT[technique.evidence]}>{EVIDENCE_LABEL[technique.evidence]}</Badge>
          </div>
        ) : null}

        <button
          type="button"
          className="mt-3 inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink"
          onClick={() => setWhy((v) => !v)}
          aria-expanded={why}
          data-testid="why-this"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", why && "rotate-180")} aria-hidden="true" />
          Why this?
        </button>
        {why ? (
          <div className="mt-2 space-y-3 rounded-md border border-line bg-surface-2/60 p-3 text-[12px]" data-testid="why-this-content">
            <div>
              <div className="flex items-center gap-2">
                <p className="eyebrow">Current hypothesis</p>
                <Badge variant="amber">Hypothesis</Badge>
              </div>
              {hypothesis ? (
                <>
                  <p className="mt-1 text-ink">
                    {BARRIER_LABEL[hypothesis.barrier]} <span className="mono-data text-slate">· {Math.round(hypothesis.confidence * 100)}% confidence</span>
                  </p>
                  {hypothesis.alternatives.length ? (
                    <p className="mt-0.5 text-slate">
                      Alternatives: {hypothesis.alternatives.map((a) => `${BARRIER_SHORT[a.barrier]} ${Math.round(a.confidence * 100)}%`).join(", ")}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-slate">Hypothesis record not found in this browser.</p>
              )}
            </div>
            {hypothesis?.evidence.length ? (
              <div>
                <p className="eyebrow">Observed</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-graphite">
                  {hypothesis.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {technique ? (
              <div>
                <p className="eyebrow">Technique mechanism</p>
                <p className="mt-1 text-graphite">{technique.mechanism}</p>
                {technique.sourceIds.length ? (
                  <p className="mt-1 text-slate">
                    Sources:{" "}
                    {technique.sourceIds
                      .map((id) => cite(id))
                      .filter((c): c is NonNullable<typeof c> => Boolean(c))
                      .map((c) => `${c.authors.split(",")[0]} (${c.year})`)
                      .join("; ")}
                  </p>
                ) : null}
                {technique.cautions.length ? <p className="mt-1 text-slate">Caution: {technique.cautions[0]}</p> : null}
              </div>
            ) : null}
            <div>
              <p className="eyebrow">
                Score <span className="mono-data normal-case tracking-normal">{intervention.scoring.total.toFixed(3)}</span>
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-graphite">
                {intervention.scoring.explanation.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onGotIt} data-testid="assistance-got-it">
            Got it
          </Button>
          {canAssist ? (
            <Button size="sm" variant="outline" onClick={onDoItForMe} disabled={assisting} data-testid="assistance-do-it">
              {assisting ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {assisting ? "Doing it…" : "Do it for me"}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onNotHelpful} className="text-slate" data-testid="assistance-not-helpful">
            <ThumbsDown /> Not helpful
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
