"use client";
import * as React from "react";
import { ArrowLeft, Compass, Loader2, RotateCcw } from "lucide-react";
import { Badge, Button, Input, Label, Textarea } from "@/components/ui";
import { CONTEXT_FIELDS } from "@/lib/synforma/demo";
import { Note, PanelHeader } from "../bits";

interface Props {
  objective: string;
  context: Record<string, string>;
  hasDiscovery: boolean;
  plannerLabel: string;
  busy: boolean;
  onStart: (objective: string, context: Record<string, string>, mode: "discover" | "replan") => void;
  onBack: () => void;
}

export function ObjectivePanel({ objective, context, hasDiscovery, plannerLabel, busy, onStart, onBack }: Props) {
  const [text, setText] = React.useState(objective);
  const [ctx, setCtx] = React.useState<Record<string, string>>(context);
  const valid = text.trim().length > 10;
  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 2 · Objective"
        title="Describe the outcome in plain language"
        description="Synforma turns this into a program: a population, a target behavior, observable requirements and policy constraints. It then finds the workflow that satisfies them in the application."
        aside={<Badge variant="outline">{plannerLabel}</Badge>}
      />

      <div className="space-y-2">
        <Label htmlFor="objective">Objective</Label>
        <Textarea id="objective" value={text} onChange={(e) => setText(e.target.value)} rows={11} className="font-sans leading-relaxed" aria-invalid={!valid} disabled={busy} />
        {!valid ? <p className="text-xs text-signal">Describe the objective in at least one sentence.</p> : null}
      </div>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-sm font-medium text-ink">Work context Synforma may use</legend>
        <p className="text-xs text-slate">Values Synforma is allowed to use when acting on behalf of a person. Judgment fields are never guessed from these.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CONTEXT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`ctx-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <Input id={`ctx-${f.key}`} value={ctx[f.key] ?? ""} onChange={(e) => setCtx((c) => ({ ...c, [f.key]: e.target.value }))} className={f.key === "entryUrl" ? "mono-data text-xs" : undefined} />
              <p className="text-[11px] text-slate">{f.hint}</p>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {hasDiscovery ? (
          <>
            <Button onClick={() => onStart(text, ctx, "replan")} disabled={!valid || busy} data-testid="replan">
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Compass aria-hidden="true" />}
              Re-plan with existing discovery
            </Button>
            <Button variant="outline" onClick={() => onStart(text, ctx, "discover")} disabled={!valid || busy} data-testid="start-discovery">
              <RotateCcw aria-hidden="true" />
              Run discovery again
            </Button>
          </>
        ) : (
          <Button onClick={() => onStart(text, ctx, "discover")} disabled={!valid || busy} data-testid="start-discovery">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Compass aria-hidden="true" />}
            Start discovery
          </Button>
        )}
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      </div>

      <Note>
        {hasDiscovery
          ? "The application was already discovered for this program. Re-planning reuses that map; running discovery again crawls the application from scratch."
          : "Starting discovery creates the program and crawls the application through its links, menus, tabs and forms. Discovery never commits data."}
      </Note>
    </div>
  );
}
