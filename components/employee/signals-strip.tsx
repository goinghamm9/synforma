"use client";
import Link from "next/link";
import { AlertTriangle, Clock, CornerUpLeft, MapPinOff, XCircle, Search, HelpCircle } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import type { StruggleSignal, StruggleType } from "@/lib/synforma/types";

const SIGNAL_META: Record<StruggleType, { label: string; Icon: typeof Clock }> = {
  hesitation: { label: "Hesitation", Icon: Clock },
  validation_error: { label: "Validation error", Icon: AlertTriangle },
  backtrack: { label: "Backtrack", Icon: CornerUpLeft },
  wrong_screen: { label: "Wrong screen", Icon: MapPinOff },
  abandon: { label: "Abandon", Icon: XCircle },
  visual_search: { label: "Visual search", Icon: Search },
  decision_uncertainty: { label: "Decision uncertainty", Icon: HelpCircle },
  error_recovery: { label: "Error recovery", Icon: AlertTriangle },
};

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

interface SignalsStripProps {
  signals: StruggleSignal[];
  runStartedAt: number | null;
  hesitationThresholdMs: number;
}

/** Everything Synforma observed in this run, as it happened. Observed, not inferred. */
export function SignalsStrip({ signals, runStartedAt, hesitationThresholdMs }: SignalsStripProps) {
  return (
    <section aria-label="Observed signals" data-testid="signals-strip">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="eyebrow">Observed</h3>
        <p className="text-[11px] text-slate">
          Hesitation after <span className="mono-data text-graphite">{formatDuration(hesitationThresholdMs)}</span> idle ·{" "}
          <Link href="/settings" className="underline-offset-2 hover:text-ink hover:underline">
            Settings
          </Link>
        </p>
      </div>
      {signals.length === 0 ? (
        <p className="mt-2 text-[12px] text-slate">No struggle signals so far.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {signals.map((s) => {
            const meta = SIGNAL_META[s.type];
            return (
              <li
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-graphite"
                title={s.detail ?? undefined}
                data-testid={`signal-${s.type}`}
              >
                <meta.Icon className="h-3 w-3 text-signal" aria-hidden="true" />
                {meta.label}
                {s.detail ? <span className="max-w-[160px] truncate text-slate">· {s.detail}</span> : null}
                <span className="mono-data text-slate">{runStartedAt ? clock(s.t - runStartedAt) : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
