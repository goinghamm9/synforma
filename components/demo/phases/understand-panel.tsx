"use client";
import * as React from "react";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Eye, HelpCircle, Lock, Pencil, Scale, User } from "lucide-react";
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn, formatPercent } from "@/lib/utils";
import type { Action, Program, Requirement, WorkflowStep } from "@/lib/synforma/types";
import { ModeBadge, Note, PanelHeader, Stat } from "../bits";

interface Props {
  program: Program;
  plannerLabel: string;
  onApprove: () => void;
  onEdit: () => void;
}

function expectationText(r: Requirement): string | null {
  const e = r.expectation;
  if (!e) return null;
  const parts: string[] = [];
  if (e.acceptedValues?.length) parts.push(`accepted: ${e.acceptedValues.join(", ")}`);
  if (e.rejectedValues?.length) parts.push(`rejected: ${e.rejectedValues.join(", ")}`);
  if (e.withinDays) parts.push(`within ${e.withinDays} days`);
  return parts.length ? parts.join(" · ") : null;
}

function actionText(a: Action): string {
  if (a.kind === "navigate") return a.label;
  return a.label;
}

function StepCard({ step, requirements }: { step: WorkflowStep; requirements: Requirement[] }) {
  const [open, setOpen] = React.useState(false);
  const mapped = requirements.filter((r) => step.requirementIds.includes(r.id));
  return (
    <li className="rounded-lg border border-line bg-surface">
      <div className="flex items-start gap-3 p-3">
        <span className="mono-data mt-0.5 w-5 shrink-0 text-right text-xs text-slate">{step.index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">{step.title}</span>
            <ModeBadge mode={step.mode} />
            {step.commit ? (
              <Badge variant="outline" title="Commit step: approval-gated in Act mode">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Commit
              </Badge>
            ) : null}
            {step.judgment ? (
              <Badge variant="amber">
                <User className="h-3 w-3" aria-hidden="true" />
                Needs human judgment
              </Badge>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 rounded px-1 text-[11px] text-slate hover:text-ink" aria-label="Why this mode?">
                  <HelpCircle className="h-3 w-3" aria-hidden="true" />
                  Why this mode?
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{step.modeRationale}</TooltipContent>
            </Tooltip>
          </div>
          {step.description ? <p className="mt-1 text-xs text-graphite">{step.description}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            {mapped.map((r) => (
              <span key={r.id} className="rounded-full bg-surface-2 px-2 py-0.5 text-graphite">
                requirement {r.id.replace("r", "")}
              </span>
            ))}
            {step.reveals?.map((rv) => (
              <span key={rv} className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber-soft px-2 py-0.5 text-amber">
                <Eye className="h-3 w-3" aria-hidden="true" />
                behind: {rv}
              </span>
            ))}
            {step.route ? <span className="mono-data text-slate">{step.route}</span> : null}
          </div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-xs text-slate hover:text-ink" aria-expanded={open}>
            {open ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            {step.actions.length} action{step.actions.length === 1 ? "" : "s"}
          </button>
          {open ? (
            <ol className="mt-1.5 space-y-1 border-l border-line pl-3 text-xs">
              {step.actions.map((a, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="mono-data text-[10px] uppercase text-mist">{a.kind}</span>
                  <span className="text-graphite">{actionText(a)}</span>
                  {a.targetName && a.kind !== "navigate" ? <span className="text-slate">→ &ldquo;{a.targetName}&rdquo;</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {step.expected ? <p className="mt-1.5 text-[11px] text-slate">Expected: {step.expected}</p> : null}
        </div>
      </div>
    </li>
  );
}

export function UnderstandPanel({ program, plannerLabel, onApprove, onEdit }: Props) {
  const parsed = program.parsed;
  const workflow = program.workflow;
  if (!parsed || !workflow) {
    return (
      <div className="space-y-4 p-5">
        <PanelHeader eyebrow="Phase 4 · Understand" title="Nothing to review yet" description="Run discovery first so Synforma can map the objective onto the application." />
        <Button variant="outline" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          Edit objective
        </Button>
      </div>
    );
  }
  const fieldReqs = parsed.requirements.filter((r) => r.kind === "field");
  const mappedIds = new Set(workflow.steps.flatMap((s) => s.requirementIds));
  const unmapped = fieldReqs.filter((r) => !mappedIds.has(r.id));
  const policyReqs = parsed.requirements.filter((r) => r.kind !== "field");
  const active = program.status === "active";

  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 4 · Understand"
        title={parsed.title}
        description={
          <>
            How Synforma understood the objective, decided by the <span className="text-ink">{plannerLabel}</span>. Everything below is inference with a stated confidence; approving makes it the program of record.
          </>
        }
        aside={active ? <Badge variant="verdant">Approved</Badge> : <Badge variant="amber">Awaiting approval</Badge>}
      />

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Objective confidence" value={formatPercent(parsed.confidence)} hint="Current hypothesis" />
        <Stat label="Workflow confidence" value={formatPercent(workflow.confidence)} hint={`${mappedIds.size} of ${fieldReqs.length} requirements mapped`} tone={unmapped.length ? "amber" : "ink"} />
      </div>

      <section className="space-y-2">
        <span className="eyebrow">Program</span>
        <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate">Population</dt>
          <dd className="text-ink">{parsed.population}</dd>
          <dt className="text-slate">Target behavior</dt>
          <dd className="text-ink">{parsed.targetBehavior}</dd>
          <dt className="text-slate">Success</dt>
          <dd className="text-ink">{parsed.successDefinition}</dd>
          <dt className="text-slate">Objects</dt>
          <dd className="text-ink">{[...parsed.objectHints, ...parsed.entryHints.map((h) => `from ${h}`)].join(" · ") || <span className="text-mist">none inferred</span>}</dd>
        </dl>
      </section>

      <section className="space-y-2">
        <span className="eyebrow">Requirements</span>
        <ul className="space-y-1.5" data-testid="requirements">
          {fieldReqs.map((r) => {
            const mapped = mappedIds.has(r.id);
            const exp = expectationText(r);
            return (
              <li key={r.id} className={cn("rounded-lg border px-3 py-2", mapped ? "border-line bg-surface" : "border-amber/30 bg-amber-soft")}>
                <div className="flex items-start gap-2">
                  <span className="mono-data mt-0.5 text-xs text-slate">{r.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{r.text}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {mapped ? (
                        <span className="inline-flex items-center gap-1 text-verdant">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Mapped to a field
                        </span>
                      ) : (
                        <span className="text-amber">Insufficient evidence — no field found</span>
                      )}
                      {r.judgment ? (
                        <Badge variant="amber">
                          <User className="h-3 w-3" aria-hidden="true" />
                          needs human judgment
                        </Badge>
                      ) : null}
                      {exp ? <span className="text-slate">{exp}</span> : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          {fieldReqs.length === 0 ? <li className="text-sm text-slate">No observable requirements were found in the objective.</li> : null}
        </ul>
      </section>

      {parsed.policyConstraints.length || policyReqs.length ? (
        <section className="space-y-2">
          <span className="eyebrow">Policy constraints</span>
          <ul className="space-y-1.5">
            {[...policyReqs.map((r) => r.text), ...parsed.policyConstraints].map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-graphite">
                <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Workflow · {workflow.steps.length} steps</span>
          <span className="mono-data text-[11px] text-slate">starts at {workflow.startUrl}</span>
        </div>
        {workflow.steps.length === 0 ? (
          <Note tone="amber">Insufficient evidence: no form in the discovered application matched the requirements. Edit the objective or run discovery again.</Note>
        ) : (
          <ol className="space-y-2" data-testid="workflow-steps">
            {workflow.steps.map((s) => (
              <StepCard key={s.id} step={s} requirements={parsed.requirements} />
            ))}
          </ol>
        )}
        {workflow.outcomeRoutePattern ? (
          <p className="text-[11px] text-slate">
            Outcome screen: <span className="mono-data">{workflow.outcomeRoutePattern}</span> — requirements are verified there after each run.
          </p>
        ) : (
          <p className="text-[11px] text-amber">No outcome screen recognized yet; verification will fall back to any detail page.</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <Button onClick={onApprove} data-testid="approve-program">
            Continue to Act
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={onApprove} disabled={workflow.steps.length === 0} data-testid="approve-program">
            <CheckCircle2 aria-hidden="true" />
            Approve program
          </Button>
        )}
        <Button variant="outline" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          Edit objective
        </Button>
      </div>
      <Note>Guide steps are never automated: they need human knowledge. Assist prepares derivable values for review. Act performs steps with no judgment content; commits always ask for approval.</Note>
    </div>
  );
}
