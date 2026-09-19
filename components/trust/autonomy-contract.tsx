"use client";
import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import type { ActionClass, AutonomyContract, AutonomyPolicy } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { CLASS_SHORT, formatTime } from "./trust-tone";

/** Which policies a class may take. Reversible autonomy: destructive actions can never be automatic. */
const ALLOWED: Record<ActionClass, AutonomyPolicy[]> = {
  A_read: ["auto", "ask", "never"],
  B_reversible_write: ["auto", "ask", "never"],
  C_consequential_write: ["ask", "never"],
  D_external_or_destructive: ["ask", "never"],
};

const POLICY_LABEL: Record<AutonomyPolicy, string> = { auto: "Auto", ask: "Ask", never: "Never" };

/**
 * The Autonomy Contract: what Synforma may do on the person's behalf,
 * per action class. Every workflow has one; changes are versioned.
 */
export function AutonomyContractTable({
  contract,
  onChange,
  onApprove,
  readOnly = false,
}: {
  contract: AutonomyContract;
  onChange?: (next: AutonomyContract) => void;
  onApprove?: () => void;
  readOnly?: boolean;
}) {
  const set = (cls: ActionClass, policy: AutonomyPolicy) => {
    if (!onChange) return;
    onChange({ ...contract, version: contract.version + 1, rules: contract.rules.map((r) => (r.actionClass === cls ? { ...r, synforma: policy } : r)), approvedAt: undefined, approvedBy: undefined });
  };
  return (
    <div className="space-y-3" data-testid="autonomy-contract">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-slate">
              <th className="px-3 py-2 font-medium">Action class</th>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Synforma</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Why</th>
            </tr>
          </thead>
          <tbody>
            {contract.rules.map((r) => (
              <tr key={r.actionClass} className="border-b border-line last:border-0" data-class={r.actionClass}>
                <td className="px-3 py-2.5 align-top">
                  <div className="mono-data text-[12px] text-slate">{CLASS_SHORT[r.actionClass]}</div>
                  <div className="text-ink">{r.label}</div>
                </td>
                <td className="px-3 py-2.5 align-top text-ink">{r.human ? "Yes" : "No"}</td>
                <td className="px-3 py-2.5 align-top">
                  <div className="inline-flex rounded-md border border-line-strong p-0.5" role="radiogroup" aria-label={`Synforma policy for ${r.label}`}>
                    {(["auto", "ask", "never"] as AutonomyPolicy[]).map((p) => {
                      const allowed = ALLOWED[r.actionClass].includes(p);
                      const active = r.synforma === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={readOnly || !allowed}
                          title={!allowed ? "Not allowed for this class: autonomy grows with reversibility" : undefined}
                          onClick={() => set(r.actionClass, p)}
                          className={cn(
                            "rounded-sm px-2 py-0.5 text-[12px] transition-colors",
                            active ? "bg-ink text-paper" : "text-graphite hover:bg-surface-2",
                            (!allowed || readOnly) && "cursor-not-allowed opacity-40 hover:bg-transparent",
                          )}
                        >
                          {POLICY_LABEL[p]}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 align-top text-[12px] text-graphite md:table-cell">{r.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate">
        <span>
          Contract v{contract.version} · generated {formatTime(contract.generatedAt)}
          {contract.approvedAt ? ` · approved ${formatTime(contract.approvedAt)}${contract.approvedBy ? ` by ${contract.approvedBy}` : ""}` : " · not yet approved"}
        </span>
        {onApprove && !contract.approvedAt ? (
          <Button size="sm" onClick={onApprove}>
            <ShieldCheck /> Approve contract
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] text-slate">Reversible autonomy: the more easily an action can be undone, the more autonomy it may receive. Destructive or external actions are never automatic.</p>
    </div>
  );
}
