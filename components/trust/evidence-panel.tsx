"use client";
import * as React from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { AUTHORITY_ORDER, TRUST_LABEL, truthReport } from "@/lib/synforma/engine/evidence";
import type { Claim } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./tone-badge";
import { trustTone } from "./trust-tone";

const SOURCE_LABEL: Record<Claim["source"], string> = {
  observed_interface: "Observed on the live interface",
  objective: "Stated in the objective",
  planner_inference: "Inferred by the planner",
  configuration: "Configuration metadata",
  documentation: "Documentation",
  human_confirmation: "Confirmed by a person",
};

/**
 * Evidence panel — what Synforma believes and why. Claims carry a source,
 * an authority level, confidence and status. Contested claims are shown
 * first: they stop autonomous action until a person resolves them.
 */
export function EvidencePanel({
  claims,
  onValidate,
  compact = false,
  emptyText = "No evidence yet — run discovery and planning first.",
}: {
  claims: Claim[];
  /** Confirm (ok) or reject a claim. Omit for a read-only view. */
  onValidate?: (claim: Claim, ok: boolean) => void;
  compact?: boolean;
  emptyText?: string;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const report = React.useMemo(() => truthReport(claims), [claims]);
  const active = React.useMemo(() => claims.filter((c) => c.status !== "retired"), [claims]);
  const contested = report.contested;
  const rest = active.filter((c) => c.status !== "contested");
  const visible = showAll || compact ? rest : rest.slice(0, 8);

  if (!claims.length) return <p className="text-sm text-slate">{emptyText}</p>;

  return (
    <div className="space-y-4" data-testid="evidence-panel">
      <div className="flex flex-wrap items-center gap-2">
        {report.byAuthority.map(({ authority, count }) => (
          <ToneBadge key={authority} tone={trustTone(authority)} title={TRUST_LABEL[authority]}>
            {TRUST_LABEL[authority]} <span className="mono-data opacity-80">{count}</span>
          </ToneBadge>
        ))}
        {report.retired > 0 ? <span className="text-[11px] text-slate">{report.retired} superseded</span> : null}
        {report.validated > 0 ? <span className="text-[11px] text-slate">{report.validated} validated by a person</span> : null}
      </div>

      {contested.length > 0 ? (
        <div className="rounded-lg border border-signal/40 bg-signal-soft/40 p-3" data-testid="contested-claims">
          <div className="flex items-center gap-2 text-[12px] font-medium text-signal">
            <AlertTriangle className="h-3.5 w-3.5" />
            Sources conflict — Synforma will not act on these until a person resolves them
          </div>
          <ul className="mt-2 space-y-2">
            {contested.map((c) => (
              <li key={c.id} className="text-[13px] leading-snug text-ink">
                <div>{c.statement}</div>
                {c.reason ? <div className="mt-0.5 text-[12px] text-graphite">{c.reason}</div> : null}
                {onValidate ? (
                  <div className="mt-1.5 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onValidate(c, true)}>
                      <Check /> This is correct
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onValidate(c, false)}>
                      <X /> Reject
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {visible.map((c) => (
          <li key={c.id} className={cn("flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:gap-3", c.status === "validated" && "bg-verdant-soft/30")} data-testid="claim">
            <div className="flex shrink-0 items-center gap-2 sm:w-52">
              <ToneBadge tone={trustTone(c.authority)}>{TRUST_LABEL[c.authority]}</ToneBadge>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-snug text-ink">{c.statement}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate">
                <span>{SOURCE_LABEL[c.source]}</span>
                {c.scope ? <span>scope: {c.scope}</span> : null}
                <span className="inline-flex items-center gap-1.5">
                  confidence
                  <span className="inline-block h-1 w-16 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full bg-ink" style={{ width: `${Math.round(c.confidence * 100)}%` }} />
                  </span>
                  <span className="mono-data">{Math.round(c.confidence * 100)}%</span>
                </span>
                {c.status === "validated" ? <span className="text-verdant">validated{c.validatedBy ? ` by ${c.validatedBy}` : ""}</span> : null}
              </div>
            </div>
            {onValidate && c.status !== "validated" ? (
              <div className="flex shrink-0 gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Confirm claim" title="Confirm" onClick={() => onValidate(c, true)}>
                  <Check />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Reject claim" title="Reject" onClick={() => onValidate(c, false)}>
                  <X />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {!compact && rest.length > 8 ? (
        <Button variant="link" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${rest.length} claims`}
        </Button>
      ) : null}
      <p className="text-[11px] text-slate">
        Authority order: {AUTHORITY_ORDER.map((a) => TRUST_LABEL[a]).join(" › ")}. A model inference never overrides a live observation or the objective.
      </p>
    </div>
  );
}
