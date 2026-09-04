"use client";
import Link from "next/link";
import { Loader2, Play } from "lucide-react";
import { Button, Card, CardContent, CardHeader } from "@/components/ui";
import type { PlannerStatus } from "@/lib/synforma/planner/protocol";
import type { PlannerKind, Program } from "@/lib/synforma/types";
import { formatDuration } from "@/lib/utils";
import { PlannerBadge } from "./planner-badge";

interface IntroCardProps {
  program: Program;
  entryLabel: string;
  objectHint: string;
  plannerKind: PlannerKind;
  plannerStatus: PlannerStatus | null;
  hesitationThresholdMs: number;
  treatmentShare: number;
  frameReady: boolean;
  onStart: () => void;
}

/** Before a run: what to do, what a good outcome looks like, and what Synforma is. */
export function IntroCard({ program, entryLabel, objectHint, plannerKind, plannerStatus, hesitationThresholdMs, treatmentShare, frameReady, onStart }: IntroCardProps) {
  const requirements = (program.parsed?.requirements ?? []).filter((r) => r.kind === "field");
  const stepCount = program.workflow?.steps.length ?? 0;
  return (
    <Card data-testid="intro-card">
      <CardHeader className="p-4 pb-0">
        <p className="eyebrow">Guide mode · try it as an employee</p>
        <h2 className="text-[15px] font-medium leading-snug text-ink">{program.workflow?.title ?? program.title}</h2>
        <p className="text-[13px] leading-relaxed text-graphite">
          Create a qualified {objectHint} from {entryLabel} in {program.application.name} the way an employee would. Synforma watches through the same semantic layer it uses to act, and helps only when you get stuck.
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <p className="eyebrow">A qualified {objectHint} has</p>
        <ol className="mt-1.5 space-y-1 text-[13px] text-ink">
          {requirements.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="mono-data w-4 shrink-0 text-slate">{r.id.replace(/^r/, "")}.</span>
              <span>
                {r.text}
                {r.judgment ? <span className="ml-1 text-[11px] text-slate">(your judgment)</span> : null}
              </span>
            </li>
          ))}
          {requirements.length === 0 ? <li className="text-slate">No field requirements were parsed from the objective.</li> : null}
        </ol>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="text-slate">Workflow</dt>
          <dd className="text-ink">
            {stepCount} step{stepCount === 1 ? "" : "s"} · inferred
            {program.workflow ? <span className="mono-data text-slate"> · {Math.round(program.workflow.confidence * 100)}% confidence</span> : null}
          </dd>
          <dt className="text-slate">Assistance by</dt>
          <dd>
            <PlannerBadge kind={plannerKind} status={plannerStatus} />
          </dd>
          <dt className="text-slate">Hesitation</dt>
          <dd className="text-ink">
            after <span className="mono-data">{formatDuration(hesitationThresholdMs)}</span> idle
          </dd>
          <dt className="text-slate">Measurement</dt>
          <dd className="text-ink">
            <span className="mono-data">{Math.round(treatmentShare * 100)}%</span> of runs receive assistance; the rest are a control cohort
          </dd>
        </dl>
        <p className="mt-2 text-[11px] text-slate">
          Thresholds and cohorts are set in{" "}
          <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
            Settings
          </Link>
          . Everything recorded stays in this browser.
        </p>

        <Button className="mt-4 w-full" onClick={onStart} disabled={!frameReady} data-testid="start-run">
          {frameReady ? <Play /> : <Loader2 className="animate-spin" />}
          {frameReady ? "Start run" : "Loading the application…"}
        </Button>
      </CardContent>
    </Card>
  );
}
