"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Pause, Play } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { KeyboardWindow, PointerWindow } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import type { SensingStatus } from "./use-guide-run";

interface SensingInspectorProps {
  pointer: PointerWindow | null;
  keyboard: KeyboardWindow | null;
  sensing: SensingStatus;
  running: boolean;
  onPause: (paused: boolean) => void;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate">{label}</dt>
      <dd className="mono-data text-ink">{value}</dd>
    </div>
  );
}

export function SensingBadge({ sensing }: { sensing: SensingStatus }) {
  return (
    <Badge variant={sensing === "on" ? "outline" : "muted"} data-testid="sensing-status" data-state={sensing}>
      <span className={cn("h-1.5 w-1.5 rounded-full", sensing === "on" ? "bg-graphite" : "bg-mist")} aria-hidden="true" />
      {sensing === "on" ? "Sensing on" : sensing === "paused" ? "Sensing paused" : "Sensing off"}
    </Badge>
  );
}

/**
 * "What Synforma sees": the latest one-second interaction windows, as
 * aggregates only. The person can pause sensing here; the state is visible.
 */
export function SensingInspector({ pointer, keyboard, sensing, running, onPause }: SensingInspectorProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-line bg-surface" data-testid="sensing-inspector" aria-label="What Synforma sees">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-[12px] font-medium text-graphite hover:text-ink"
          data-testid="inspector-toggle"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
          What Synforma sees
        </button>
        <SensingBadge sensing={sensing} />
        {sensing !== "off" ? (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onPause(sensing !== "paused")} data-testid="sensing-toggle">
            {sensing === "paused" ? <Play /> : <Pause />}
            {sensing === "paused" ? "Resume" : "Pause sensing"}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 border-t border-line px-3 py-3 text-[12px]" data-testid="inspector-content">
          <p className="leading-relaxed text-slate">
            Pointer movement and keystrokes are reduced to one-second aggregates on this device. Key values, typed text and pointer coordinates are never stored; password
            and similar fields only add to a suppressed count.
          </p>
          {sensing === "off" ? (
            <p className="rounded-md bg-surface-2 px-2.5 py-2 text-graphite" data-testid="sensing-off-note">
              Interaction sensing is off in{" "}
              <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
                Settings
              </Link>
              . Only navigation, validation and timing are observed.
            </p>
          ) : sensing === "paused" ? (
            <p className="rounded-md bg-surface-2 px-2.5 py-2 text-graphite" data-testid="sensing-paused-note">
              Sensing paused: no interaction windows are being collected. Navigation, validation and timing are still observed.
            </p>
          ) : (
            <>
              <div data-testid="pointer-window" data-present={Boolean(pointer)}>
                <p className="eyebrow">Latest pointer window · 1 s</p>
                {pointer ? (
                  <>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                      <Stat label="Path efficiency" value={pointer.pathEfficiency.toFixed(2)} />
                      <Stat label="Direction changes" value={pointer.directionChanges} />
                      <Stat label="Approaches" value={pointer.targetApproaches} />
                      <Stat label="Withdrawals" value={pointer.targetWithdrawals} />
                      <Stat label="Distance" value={`${pointer.distancePx} px`} />
                      <Stat label="Clicks" value={pointer.clicks} />
                    </dl>
                    <p className="mt-1.5 text-slate">
                      {pointer.hoverTargets.length ? (
                        <>
                          Hovered:{" "}
                          {pointer.hoverTargets.map((h, i) => (
                            <span key={h.key}>
                              {i > 0 ? " · " : ""}
                              <span className="text-graphite">{h.name}</span> <span className="mono-data">{h.dwellMs} ms</span>
                            </span>
                          ))}
                        </>
                      ) : (
                        "No control hovered in this window."
                      )}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-slate">{running ? "No pointer movement in the application yet." : "Windows appear during a run."}</p>
                )}
              </div>
              <div data-testid="keyboard-window" data-present={Boolean(keyboard)}>
                <p className="eyebrow">Latest keyboard window · 1 s · metadata only</p>
                {keyboard ? (
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                    <Stat label="Characters" value={keyboard.characterCount} />
                    <Stat label="Backspace" value={keyboard.backspaceCount} />
                    <Stat label="Enter" value={keyboard.enterCount} />
                    <Stat label="Escape" value={keyboard.escapeCount} />
                    <Stat label="Shortcuts" value={keyboard.shortcutCount} />
                    <Stat label="Navigation" value={keyboard.navigationCount} />
                    <Stat label="Median inter-key" value={keyboard.medianInterKeyMs !== null ? `${keyboard.medianInterKeyMs} ms` : "—"} />
                    <Stat label="Suppressed" value={keyboard.suppressedCount} />
                  </dl>
                ) : (
                  <p className="mt-1 text-slate">{running ? "No keystrokes in the application yet." : "Windows appear during a run."}</p>
                )}
              </div>
            </>
          )}
          <p className="text-[11px] text-slate">
            Categories and controls in{" "}
            <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
              Settings
            </Link>
            . Everything stays in this browser.
          </p>
        </div>
      ) : null}
    </section>
  );
}
