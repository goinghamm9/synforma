"use client";
import { forwardRef } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Button, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { FrameBox, OverlayCursor, OverlayHighlight, RunPhase } from "./use-guide-run";

interface TargetFrameProps {
  appName: string;
  currentUrl: string | null;
  phase: RunPhase;
  frameReady: boolean;
  frameError: string | null;
  highlight: OverlayHighlight | null;
  cursor: OverlayCursor | null;
  frame: FrameBox | null;
  assisting: boolean;
  onReload: () => void;
}

/**
 * The target application, kept mounted for the life of the page, plus the
 * Synforma overlay drawn in the parent document. Rects arrive in the iframe's
 * viewport coordinates and are offset by the iframe's own position.
 */
export const TargetFrame = forwardRef<HTMLIFrameElement, TargetFrameProps>(function TargetFrame(
  { appName, currentUrl, phase, frameReady, frameError, highlight, cursor, frame, assisting, onReload },
  ref,
) {
  const watching = phase === "running";
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Target application">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 text-[12px]">
        <span className="font-medium text-ink">{appName}</span>
        <span className="mono-data min-w-0 flex-1 truncate text-slate" title={currentUrl ?? undefined}>
          {currentUrl ?? "—"}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-[12px] text-graphite hover:bg-surface-2"
              aria-label={watching ? "Synforma is watching. What is recorded" : "Synforma is not observing. What would be recorded"}
              data-testid="watching-indicator"
            >
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className={cn("h-1.5 w-1.5 rounded-full", watching ? "pulse-dot bg-verdant" : "bg-mist")} />
              </span>
              {watching ? "Synforma is watching" : "Not observing"}
              <Eye className="h-3.5 w-3.5 text-slate" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="max-w-[280px] leading-relaxed">
            {watching ? "Recording now: " : "During a run Synforma records: "}
            which workflow step is on screen, time per step, validation errors, backtracks and hesitation. No keystrokes, no screenshots.
            Everything stays in this browser and is never sent anywhere.
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="relative min-h-0 flex-1 bg-surface-2">
        <iframe ref={ref} title={appName} src="about:blank" className="absolute inset-0 h-full w-full border-0 bg-white" />

        {!frameReady && !frameError ? (
          <div className="absolute inset-0 flex flex-col gap-3 bg-surface p-6" aria-live="polite">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <p className="text-[12px] text-slate">Loading {appName}…</p>
          </div>
        ) : null}

        {frameError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface p-6">
            <div className="max-w-sm rounded-lg border border-line bg-surface p-5 text-sm">
              <p className="font-medium text-ink">The application did not load</p>
              <p className="mt-1 text-slate">{frameError}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={onReload}>
                <RefreshCw /> Reload
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {frame && frameReady ? (
        <div
          className="pointer-events-none fixed z-30 overflow-hidden"
          style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          aria-hidden="true"
          data-testid="synforma-overlay"
        >
          {highlight ? (
            <div
              className={cn(
                "absolute rounded-md border-[1.5px] transition-opacity duration-300",
                highlight.kind === "assistance" ? "border-signal bg-signal/[0.04]" : "border-ink bg-ink/[0.03]",
              )}
              style={{ left: highlight.rect.x - 3, top: highlight.rect.y - 3, width: highlight.rect.w + 6, height: highlight.rect.h + 6 }}
              data-testid="overlay-highlight"
              data-kind={highlight.kind}
            >
              <span
                className={cn(
                  "absolute right-0 max-w-[260px] truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 text-paper",
                  highlight.rect.y > 28 ? "bottom-full mb-1" : "top-full mt-1",
                  highlight.kind === "assistance" ? "bg-signal" : "bg-ink",
                )}
              >
                {highlight.label}
              </span>
            </div>
          ) : null}

          {cursor && assisting ? (
            <div
              className="absolute transition-[left,top] duration-200 ease-out"
              style={{ left: cursor.rect.x + cursor.rect.w / 2, top: cursor.rect.y + cursor.rect.h / 2 }}
              data-testid="overlay-cursor"
            >
              <span className="absolute -left-1.5 -top-1.5 block h-3 w-3 rounded-full border-2 border-paper bg-ink shadow-sm" />
              {cursor.label ? (
                <span className="absolute left-2.5 top-2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium leading-4 text-paper">
                  Synforma · {cursor.label}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
