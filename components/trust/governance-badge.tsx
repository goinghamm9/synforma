"use client";
import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { Workflow } from "@/lib/synforma/types";
import { ToneBadge } from "./tone-badge";
import { formatTime, type Tone } from "./trust-tone";

const STATUS_LABEL: Record<NonNullable<Workflow["governance"]>["status"], string> = {
  discovered: "Discovered",
  reviewed: "Reviewed",
  approved: "Approved",
  approved_with_exceptions: "Approved with exceptions",
  rejected: "Rejected",
};

const STATUS_TONE: Record<NonNullable<Workflow["governance"]>["status"], Tone> = {
  discovered: "amber",
  reviewed: "graphite",
  approved: "verdant",
  approved_with_exceptions: "verdant",
  rejected: "signal",
};

/** Workflow version + governance status, with the changelog in a popover. */
export function GovernanceBadge({ workflow }: { workflow: Workflow }) {
  const status = workflow.governance?.status ?? "discovered";
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-graphite hover:bg-surface-2" data-testid="governance-badge">
          <span className="mono-data">v{workflow.version ?? "1.0"}</span>
          <ToneBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</ToneBadge>
          {workflow.origin === "demonstration" ? <span className="text-slate">from demonstration</span> : null}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className="z-50 w-80 rounded-md border border-line bg-surface p-3 text-[12px] shadow-lg">
          <div className="eyebrow mb-2">Workflow versions</div>
          {workflow.changelog?.length ? (
            <ul className="space-y-1.5">
              {[...workflow.changelog].reverse().map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mono-data shrink-0 text-slate">v{c.version}</span>
                  <span className="text-ink">
                    {c.reason} <span className="text-slate">· {c.source} · {formatTime(c.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate">No changelog recorded.</p>
          )}
          {workflow.governance?.note ? <p className="mt-2 border-t border-line pt-2 text-graphite">{workflow.governance.note}</p> : null}
          <p className="mt-2 border-t border-line pt-2 text-[11px] text-slate">Machine-discovered process knowledge follows a lifecycle: discovered → reviewed → approved → governed. It never becomes policy silently.</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
