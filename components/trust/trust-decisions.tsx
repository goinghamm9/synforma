"use client";
import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { AutonomyContract, Claim, Workflow } from "@/lib/synforma/types";
import { stepTrust } from "@/lib/synforma/engine/trust";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./tone-badge";
import { CLASS_SHORT, DECISION_LABEL, decisionTone } from "./trust-tone";

/** Per-step trust decision: act · prepare + ask · guide · ask · stop, with reasons. */
export function TrustDecisions({ workflow, contract, claims }: { workflow: Workflow; contract?: AutonomyContract; claims: Claim[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const rows = React.useMemo(() => workflow.steps.map((s) => ({ step: s, trust: stepTrust(s, workflow, contract, claims) })), [workflow, contract, claims]);
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface" data-testid="trust-decisions">
      {rows.map(({ step, trust }) => (
        <li key={step.id}>
          <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2/60" onClick={() => setOpen((o) => (o === step.id ? null : step.id))} aria-expanded={open === step.id}>
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-slate transition-transform", open === step.id && "rotate-90")} />
            <span className="mono-data w-5 shrink-0 text-[12px] text-slate">{step.index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{step.title}</span>
            <span className="mono-data hidden text-[11px] text-slate sm:inline">{CLASS_SHORT[trust.actionClass]}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1 w-12 overflow-hidden rounded-full bg-surface-3" title={`risk ${trust.risk.toFixed(2)}`}>
                <span className={cn("block h-full", trust.risk >= 0.8 ? "bg-signal" : trust.risk >= 0.45 ? "bg-amber" : "bg-ink")} style={{ width: `${Math.round(trust.risk * 100)}%` }} />
              </span>
              <ToneBadge tone={decisionTone(trust.decision)}>{DECISION_LABEL[trust.decision]}</ToneBadge>
            </span>
          </button>
          {open === step.id ? (
            <ul className="space-y-1 border-t border-line bg-surface-2/40 px-3 py-2 pl-11 text-[12px] text-graphite">
              {trust.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
