"use client";
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import type { LedgerEntry } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./tone-badge";
import { CLASS_SHORT, formatTime } from "./trust-tone";

/**
 * Provenance + rollback ledger — git history for enterprise work. Every
 * action Synforma performed: who asked, what it believed, what it relied on,
 * who decided, before → after, approval, result, and whether it can be undone.
 */
export function LedgerTable({
  entries,
  stepTitle,
  onUndo,
  undoing = false,
  compact = false,
}: {
  entries: LedgerEntry[];
  stepTitle?: (stepId: string) => string;
  /** Undo all reversible entries not yet rolled back (newest first). */
  onUndo?: () => void;
  undoing?: boolean;
  compact?: boolean;
}) {
  const reversible = entries.filter((e) => e.rollback.possible && !e.rolledBackAt);
  const rows = compact ? entries.slice(-12) : entries;
  if (!entries.length) return <p className="text-sm text-slate">No actions in the ledger yet.</p>;
  return (
    <div className="space-y-3" data-testid="ledger">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-slate">
          <span className="mono-data">{entries.length}</span> action{entries.length === 1 ? "" : "s"} · <span className="mono-data">{reversible.length}</span> reversible ·{" "}
          <span className="mono-data">{entries.filter((e) => e.rolledBackAt).length}</span> undone · <span className="mono-data">{entries.filter((e) => e.regrounded).length}</span> re-grounded
        </div>
        {onUndo ? (
          <Button size="sm" variant="outline" disabled={!reversible.length || undoing} onClick={onUndo} data-testid="ledger-undo">
            <RotateCcw /> {undoing ? "Undoing…" : `Undo ${reversible.length} fill${reversible.length === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-line bg-surface scrollbar-thin">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-slate">
              <th className="px-2 py-1.5 font-medium">Time</th>
              <th className="px-2 py-1.5 font-medium">Step</th>
              <th className="px-2 py-1.5 font-medium">Action</th>
              <th className="hidden px-2 py-1.5 font-medium md:table-cell">Class</th>
              <th className="hidden px-2 py-1.5 font-medium lg:table-cell">Before → after</th>
              <th className="px-2 py-1.5 font-medium">Approval</th>
              <th className="px-2 py-1.5 font-medium">Result</th>
              <th className="px-2 py-1.5 font-medium">Undo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={cn("border-b border-line last:border-0", e.rolledBackAt && "text-mist line-through")} data-testid="ledger-row" data-rolled-back={e.rolledBackAt ? "true" : "false"}>
                <td className="mono-data px-2 py-1.5 align-top text-slate">{formatTime(e.t)}</td>
                <td className="px-2 py-1.5 align-top text-graphite">{stepTitle ? stepTitle(e.stepId) : e.stepId}</td>
                <td className="px-2 py-1.5 align-top text-ink">
                  {e.action.label}
                  {e.regrounded ? <span className="ml-1 text-[10px] text-amber">re-grounded</span> : null}
                </td>
                <td className="mono-data hidden px-2 py-1.5 align-top text-slate md:table-cell">{CLASS_SHORT[e.actionClass]}</td>
                <td className="hidden px-2 py-1.5 align-top text-graphite lg:table-cell">
                  {e.before || e.after ? (
                    <span className="mono-data">
                      {e.before?.value === undefined ? "—" : `"${truncate(e.before.value)}"`} → {e.after?.value === undefined ? "—" : `"${truncate(e.after.value)}"`}
                    </span>
                  ) : (
                    <span className="text-mist">no field state</span>
                  )}
                </td>
                <td className="px-2 py-1.5 align-top">
                  <ToneBadge tone={e.approval === "granted" ? "verdant" : e.approval === "denied" ? "signal" : "mist"}>{e.approval === "not_required" ? "not required" : e.approval}</ToneBadge>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <ToneBadge tone={e.result === "ok" ? "graphite" : "signal"}>{e.result}</ToneBadge>
                </td>
                <td className="px-2 py-1.5 align-top text-slate" title={e.rollback.reason}>
                  {e.rolledBackAt ? "undone" : e.rollback.possible ? "restore value" : e.rollback.method === "compensating_action" ? "compensating action needed" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate">Fills are undone by restoring the previous value in the live interface. Committed records need a compensating action in the target system, which the sandbox does not expose.</p>
    </div>
  );
}

function truncate(s: string, n = 28): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
