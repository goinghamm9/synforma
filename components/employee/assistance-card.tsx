"use client";
import { plannerVendor } from "@/lib/synforma/planner";
import { useState } from "react";
import { ChevronDown, Clock, HelpCircle, Loader2, MessageSquare, Minus, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui";
import { BARRIER_LABEL, BARRIER_SHORT, EVIDENCE_LABEL, TECHNIQUE_BY_ID } from "@/lib/synforma/science/techniques";
import { cite } from "@/lib/synforma/science/citations";
import type { EvidenceClass, Hypothesis, Intervention, WorkflowStep } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import type { AssistanceFeedback } from "./use-guide-run";

const EVIDENCE_VARIANT: Record<EvidenceClass, "verdant" | "amber" | "muted"> = {
  strong: "verdant",
  promising: "verdant",
  theoretical: "amber",
  philosophical: "amber",
  experimental: "muted",
};

/** Techniques that must never draw attention: the control was already found. Rendered as a quiet inline note. */
export const QUIET_TECHNIQUES: ReadonlySet<string> = new Set(["clarify_consequence"]);

export const FEEDBACK_OPTIONS: { value: AssistanceFeedback; label: string; Icon: typeof ThumbsUp }[] = [
  { value: "helpful", label: "Helpful", Icon: ThumbsUp },
  { value: "not_helpful", label: "Not helpful", Icon: ThumbsDown },
  { value: "wrong_moment", label: "Wrong moment", Icon: Clock },
  { value: "wrong_assumption", label: "Wrong assumption", Icon: HelpCircle },
  { value: "too_much_help", label: "Too much help", Icon: Minus },
];

interface AssistanceCardProps {
  intervention: Intervention;
  hypothesis: Hypothesis | null;
  step: WorkflowStep | null;
  assisting: boolean;
  onGotIt: () => void;
  onFeedback: (feedback: AssistanceFeedback) => void;
  onDoItForMe: () => void;
}

function sourceLine(source: string | undefined): string | null {
  if (!source) return null;
  if (/^objective requirement/i.test(source)) return `From ${source.charAt(0).toLowerCase()}${source.slice(1)}`;
  return `Based on: ${source}`;
}

/**
 * One assistance card at a time, anchored in the panel and mirrored on the
 * overlay. A "clarify consequence" card is the exception: the person already
 * found the control, so it renders as a quiet note with no ring anywhere.
 */
export function AssistanceCard({ intervention, hypothesis, step, assisting, onGotIt, onFeedback, onDoItForMe }: AssistanceCardProps) {
  const [why, setWhy] = useState(false);
  const technique = TECHNIQUE_BY_ID[intervention.techniqueId];
  const source = sourceLine(intervention.content.source);
  const quiet = QUIET_TECHNIQUES.has(intervention.techniqueId);
  const canAssist = intervention.content.offerAssist && step && !step.judgment;
  return (
    <Card
      className={quiet ? "border-line bg-surface-2/50" : "border-signal/40"}
      data-testid="assistance-card"
      data-technique={intervention.techniqueId}
      data-variant={quiet ? "quiet" : "pointer"}
      role="region"
      aria-label="Synforma assistance"
    >
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("eyebrow", quiet ? "text-slate" : "text-signal")}>{quiet ? "Synforma · a note before you continue" : "Synforma · assistance"}</p>
          <span className="text-[11px] text-slate">{`Composed by ${intervention.generatedBy === "heuristic" ? "the heuristic planner" : plannerVendor(intervention.generatedBy)}`}</span>
        </div>
        <h2 className="text-[15px] font-medium leading-snug text-ink">{intervention.content.title}</h2>
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-graphite">{intervention.content.body}</p>
        {source ? <p className="text-[12px] text-slate">{source}</p> : null}
        {quiet ? <p className="text-[11px] text-slate">Nothing is highlighted: you already found the control.</p> : null}
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
                  {hypothesis.frictionState ? <p className="mt-0.5 text-slate">Derived from the observed interaction state {hypothesis.frictionState.replace(/_/g, " ").toLowerCase()}.</p> : null}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-slate" data-testid="assistance-feedback">
                <MessageSquare /> Feedback <ChevronDown className="!size-3" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" data-testid="assistance-feedback-menu">
              <DropdownMenuLabel>How was this?</DropdownMenuLabel>
              {FEEDBACK_OPTIONS.map((o) => (
                <DropdownMenuItem key={o.value} onSelect={() => onFeedback(o.value)} className="text-[13px]" data-testid={`feedback-${o.value}`}>
                  <o.Icon className="h-3.5 w-3.5 text-slate" aria-hidden="true" />
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
