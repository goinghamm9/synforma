"use client";
import { useState } from "react";
import { Check, Circle, Loader2, Lock, RotateCcw, Zap } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, Progress } from "@/components/ui";
import type { composeRecap } from "@/lib/synforma/engine/proficiency";
import type { WorkflowStep } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { PREFERENCE_LABEL } from "./assistance-chooser";
import type { GetItDoneState } from "./use-guide-run";

const SHORTCUT = "Ctrl/⌘ + Shift + S";

/** "I need this done now": Synforma handles the routine fields from here and stops before the commit. */
export function GetItDoneButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-surface px-3 py-2.5" data-testid="get-it-done-bar">
      <Button size="sm" variant="outline" onClick={onClick} disabled={disabled} data-testid="get-it-done">
        <Zap /> I need this done now
      </Button>
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate">
        Synforma fills the routine fields from here, leaves the judgment fields to you and stops before the commit. <kbd className="mono-data rounded border border-line bg-surface-2 px-1 text-[10px] text-graphite">{SHORTCUT}</kbd>
      </p>
    </div>
  );
}

interface GetItDoneStatusProps {
  state: GetItDoneState;
  steps: WorkflowStep[];
  currentIndex: number;
  approvalOpen: boolean;
  onReopen: () => void;
}

/** Progress while Synforma is handling the routine steps; the stop before the commit; the commit itself. */
export function GetItDoneStatus({ state, steps, currentIndex, approvalOpen, onReopen }: GetItDoneStatusProps) {
  if (state.status === "idle" && !state.error) return null;
  const firstHandled = state.handledStepIds.length ? Math.min(...state.handledStepIds.map((id) => steps.find((s) => s.id === id)?.index ?? Infinity)) : Infinity;
  const from = Math.min(firstHandled, currentIndex >= 0 ? currentIndex : 0);
  const scope = steps.filter((s) => s.index >= from);
  const handled = new Set(state.handledStepIds);
  const done = scope.filter((s) => handled.has(s.id)).length;
  const pct = scope.length ? Math.round((done / scope.length) * 100) : 0;
  const running = state.status === "running";
  const committing = state.status === "committing";
  const ready = state.status === "ready";
  return (
    <Card className={cn(ready ? "border-amber/40" : "border-line")} data-testid="get-it-done-status" data-status={state.status} role="status" aria-live="polite">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Get It Done · {running ? "in progress" : committing ? "committing" : ready ? "stopped before the commit" : "stopped"}</p>
          {running || committing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate" aria-hidden="true" /> : null}
        </div>
        <h2 className="text-[15px] font-medium leading-snug text-ink">
          {running
            ? "Synforma is handling the routine fields"
            : committing
              ? `Committing "${state.stoppedBefore ?? "the record"}" after your approval`
              : ready
                ? `Stopped before "${state.stoppedBefore ?? "the commit"}"`
                : "Synforma could not finish the routine steps"}
        </h2>
        {ready ? <p className="text-[12px] text-slate">Nothing is saved until you approve. Finish the fields left for you first if you prefer.</p> : null}
      </CardHeader>
      <CardContent className="p-4">
        {running || committing ? (
          <>
            <Progress value={committing ? 100 : pct} className="mb-2" />
            <ol className="space-y-1 text-[12px]" aria-label="Steps handled">
              {scope.map((s) => {
                const ok = handled.has(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-2" data-testid={`gid-step-${s.id}`} data-handled={ok}>
                    {ok ? <Check className="h-3.5 w-3.5 shrink-0 text-verdant" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-mist" aria-hidden="true" />}
                    <span className={ok ? "text-graphite" : "text-ink"}>{s.title}</span>
                    {s.judgment ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate">
                        <Lock className="h-3 w-3" aria-hidden="true" /> judgment fields left for you
                      </span>
                    ) : null}
                    {s.commit ? <span className="text-[11px] text-slate">stops before the commit</span> : null}
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}
        {state.leftForYou.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-graphite" data-testid="gid-left-for-you">
            <span>Left for you:</span>
            {state.leftForYou.map((l) => (
              <Badge key={`${l.requirementId ?? ""}:${l.fieldName}`} variant="amber">
                <Lock className="h-3 w-3" aria-hidden="true" /> {l.fieldName}
              </Badge>
            ))}
          </div>
        ) : null}
        {state.error ? (
          <p className="mt-2 text-[12px] text-signal" data-testid="gid-error">
            {state.error}
          </p>
        ) : null}
        {ready && !approvalOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onReopen} data-testid="reopen-approval">
              <RotateCcw /> Reopen approval
            </Button>
            <span className="text-[11px] text-slate">You will see the exact values before anything is committed.</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type Recap = ReturnType<typeof composeRecap>;

interface RecapCardProps {
  recap: Recap;
  handledSteps: WorkflowStep[];
  onChoose: (next: "teach_me" | "just_do_it") => void;
}

/** Teach-after: what Synforma handled, what the person decided, and whether to learn it next time. Numbers come from events only. */
export function RecapCard({ recap, handledSteps, onChoose }: RecapCardProps) {
  const [chosen, setChosen] = useState<"teach_me" | "just_do_it" | null>(null);
  const choose = (next: "teach_me" | "just_do_it") => {
    setChosen(next);
    onChoose(next);
  };
  return (
    <Card data-testid="recap-card">
      <CardHeader className="p-4 pb-0">
        <p className="eyebrow">After Get It Done · from this run&apos;s events</p>
        <h2 className="text-[15px] font-medium leading-snug text-ink" data-testid="recap-text">
          {recap.text}
        </h2>
      </CardHeader>
      <CardContent className="p-4">
        <dl className="grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-md bg-surface-2 px-2.5 py-2">
            <dt className="text-slate">Handled</dt>
            <dd className="mono-data text-ink" data-testid="recap-handled">
              {recap.handled.length}
            </dd>
          </div>
          <div className="rounded-md bg-surface-2 px-2.5 py-2">
            <dt className="text-slate">Decided by you</dt>
            <dd className="mono-data text-ink" data-testid="recap-decided">
              {recap.decided.length}
            </dd>
          </div>
          <div className="rounded-md bg-surface-2 px-2.5 py-2">
            <dt className="text-slate">Approvals</dt>
            <dd className="mono-data text-ink" data-testid="recap-approvals">
              {recap.approvals}
            </dd>
          </div>
        </dl>
        {handledSteps.length ? (
          <p className="mt-2 text-[12px] text-graphite">
            Synforma handled: {handledSteps.map((s) => s.title).join(", ")}.
          </p>
        ) : null}
        {recap.decided.length ? (
          <p className="mt-1 text-[12px] text-graphite">
            You decided: {recap.decided.join(", ")}.
          </p>
        ) : null}
        {recap.handled.length ? (
          <details className="mt-2 text-[12px] text-slate">
            <summary className="cursor-pointer text-graphite hover:text-ink">Every action, as recorded</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {recap.handled.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-4 rounded-md border border-line bg-surface-2/60 p-3" data-testid="learn-next-time">
          {chosen ? (
            <p className="text-[12px] text-graphite" data-testid="learn-next-time-chosen" data-choice={chosen}>
              Next run: <span className="font-medium text-ink">{PREFERENCE_LABEL[chosen]}</span>. {chosen === "teach_me" ? "Synforma will explain the routine steps as you do them." : "Synforma keeps handling the routine fields; you keep the decisions."}
            </p>
          ) : (
            <>
              <p className="text-[13px] font-medium text-ink">Learn this next time?</p>
              <p className="mt-0.5 text-[12px] text-slate">Choose how the next run should feel. Either way, judgment fields and commits stay yours.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => choose("teach_me")} data-testid="learn-yes">
                  Yes, show me
                </Button>
                <Button size="sm" variant="outline" onClick={() => choose("just_do_it")} data-testid="learn-keep">
                  Keep handling it
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
