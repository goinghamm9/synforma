"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useSynforma } from "@/lib/synforma/store";
import type { RunEvent, RunEventType } from "@/lib/synforma/types";

/** Readable names for the aggregate fields of pointer and keyboard windows (lib/synforma/types.ts). */
const FIELD_LABEL: Record<string, string> = {
  durationMs: "Window length (ms)",
  sampleCount: "Pointer samples",
  distancePx: "Path distance (px)",
  straightLineDistancePx: "Straight-line distance (px)",
  pathEfficiency: "Path efficiency (0–1)",
  meanVelocityPxS: "Mean velocity (px/s)",
  maxVelocityPxS: "Max velocity (px/s)",
  directionChanges: "Direction changes",
  targetApproaches: "Approaches to the target",
  targetWithdrawals: "Withdrawals from the target",
  targetHoverMs: "Hover on the target (ms)",
  targetSeen: "Target seen",
  hoverTargets: "Hovered elements (dwell)",
  clicks: "Clicks",
  idleMs: "Idle (ms)",
  keyCount: "Keys",
  characterCount: "Character keys",
  backspaceCount: "Backspace",
  enterCount: "Enter",
  escapeCount: "Escape",
  shortcutCount: "Shortcuts",
  navigationCount: "Navigation keys",
  medianInterKeyMs: "Median inter-key interval (ms)",
  typingBursts: "Typing bursts",
  suppressedCount: "Suppressed (sensitive fields)",
};

const TIME_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function humanizeField(key: string): string {
  return FIELD_LABEL[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (!v.length) return "none";
    return v
      .map((x) => {
        if (x && typeof x === "object" && "name" in x) {
          const o = x as { name: unknown; dwellMs?: unknown };
          return typeof o.dwellMs === "number" ? `${String(o.name)} · ${Math.round(o.dwellMs)} ms` : String(o.name);
        }
        return formatValue(x);
      })
      .join("; ");
  }
  return JSON.stringify(v);
}

function WindowPayload({ title, event, empty }: { title: string; event: RunEvent | null; empty: string }) {
  const entries = event?.data ? Object.entries(event.data) : [];
  return (
    <div className="rounded-lg border border-line bg-surface p-4" data-testid={`inspector-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{title}</p>
        {event ? <span className="mono-data text-[11px] text-slate">{TIME_FMT.format(new Date(event.t))}</span> : null}
      </div>
      {event ? (
        <>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[13px]">
            {entries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="truncate text-slate">{humanizeField(k)}</dt>
                <dd className="mono-data text-right text-ink">{formatValue(v)}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-slate hover:text-ink">Raw payload, exactly as stored</summary>
            <pre className="mono-data mt-2 max-h-56 overflow-auto rounded-md bg-surface-2 p-3 text-[11px] leading-relaxed text-graphite">{JSON.stringify(event.data, null, 2)}</pre>
          </details>
        </>
      ) : (
        <p className="mt-2 text-[13px] text-slate">{empty}</p>
      )}
    </div>
  );
}

/**
 * Reads the stored events and shows what interaction sensing actually
 * produced: counts per event type and the most recent pointer / keyboard
 * windows in full, so anyone can verify that only aggregates exist.
 */
export function CollectedDataInspector() {
  const events = useSynforma((s) => s.events);
  const summary = useMemo(() => {
    const counts = new Map<RunEventType, number>();
    let lastPointer: RunEvent | null = null;
    let lastKeyboard: RunEvent | null = null;
    for (const e of events) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      if (e.type === "pointer_window") lastPointer = e;
      else if (e.type === "keyboard_window") lastKeyboard = e;
    }
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { rows, lastPointer, lastKeyboard, total: events.length };
  }, [events]);

  if (!summary.total) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-slate" data-testid="inspector-empty">
        No events yet. Windows appear here after a Guide session in the{" "}
        <Link href="/employee" className="text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink">
          employee view
        </Link>{" "}
        or a run in Mission Control.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="inspector">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink">Events by type</p>
          <p className="mono-data text-[11px] text-slate" data-testid="inspector-total">
            {summary.total} stored
          </p>
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2" data-testid="inspector-counts">
          {summary.rows.map(([type, n]) => (
            <li key={type} className="flex items-baseline justify-between gap-3 border-b border-line py-1 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <span className="truncate text-graphite">{humanizeType(type)}</span>
              <span className="mono-data text-ink">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-slate">
          Pointer and keyboard windows carry the fields listed below and nothing else: no coordinates, no movement traces, no key values. The store
          keeps the last 6,000 events.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <WindowPayload title="Latest pointer window" event={summary.lastPointer} empty="No pointer window stored yet." />
        <WindowPayload title="Latest keyboard window" event={summary.lastKeyboard} empty="No keyboard window stored yet." />
      </div>
    </div>
  );
}
