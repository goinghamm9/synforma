"use client";
import * as React from "react";
import { Globe, Loader2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { OverlayTarget } from "./types";

interface Props {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  title: string;
  connected: boolean;
  connecting: boolean;
  currentUrl: string;
  busy: boolean;
  cursor: OverlayTarget | null;
  highlight: OverlayTarget | null;
  onConnect: () => void;
  className?: string;
}

/**
 * The target application in a same-origin iframe, with Synforma's overlays
 * drawn in the parent page: an agent cursor (ring + label of the current
 * action) and a highlight rectangle. The iframe is mounted once and kept for
 * the life of the page; rects are in iframe viewport coordinates, which map
 * 1:1 onto the overlay layer positioned over the iframe.
 */
export function TargetFrame({ iframeRef, title, connected, connecting, currentUrl, busy, cursor, highlight, onConnect, className }: Props) {
  // Keep the last cursor position so the ring fades out in place and animates from there next time.
  const lastCursor = React.useRef<OverlayTarget | null>(null);
  if (cursor) lastCursor.current = cursor;
  const shown = cursor ?? lastCursor.current;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface", className)}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
        <Globe className="h-3.5 w-3.5 text-slate" aria-hidden="true" />
        <span className="font-medium text-ink">{title}</span>
        <span className="mono-data min-w-0 truncate text-slate">{connected ? currentUrl || "/" : "not connected"}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate">
          <span className={cn("h-1.5 w-1.5 rounded-full", busy ? "pulse-dot bg-ink" : connected ? "bg-verdant" : "bg-mist")} aria-hidden="true" />
          {busy ? "Synforma is working" : connected ? "Connected" : "Idle"}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe ref={iframeRef} title={title} src="about:blank" className="absolute inset-0 h-full w-full border-0" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className={cn("absolute rounded-md border-2 border-ink/80 bg-ink/[0.04] transition-all duration-300 ease-out", highlight ? "opacity-100" : "opacity-0")}
            style={
              highlight
                ? { left: highlight.rect.x - 3, top: highlight.rect.y - 3, width: highlight.rect.w + 6, height: highlight.rect.h + 6 }
                : { left: 0, top: 0, width: 0, height: 0 }
            }
          >
            {highlight?.label ? (
              <span className="absolute -top-6 left-0 max-w-[280px] truncate rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-paper">{highlight.label}</span>
            ) : null}
          </div>

          {shown ? (
            <div
              className={cn("absolute left-0 top-0 transition-[transform,opacity] duration-300 ease-out", cursor ? "opacity-100" : "opacity-0")}
              style={{ transform: `translate(${shown.rect.x + shown.rect.w / 2}px, ${shown.rect.y + shown.rect.h / 2}px)` }}
            >
              <span className="absolute -left-2.5 -top-2.5 block h-5 w-5 rounded-full border-2 border-ink bg-paper/70 shadow-[0_0_0_2px_rgba(250,250,247,0.9)]" />
              <span className="absolute left-3 top-2 block h-2 w-2 rounded-full bg-ink" />
              {shown.label ? (
                <span className="absolute left-4 top-4 max-w-[260px] truncate whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-paper shadow-md">{shown.label}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {!connected ? (
          <div className="dot-paper absolute inset-0 flex items-center justify-center bg-paper/95 p-6">
            <div className="max-w-sm text-center">
              <PlugZap className="mx-auto mb-3 h-6 w-6 text-slate" aria-hidden="true" />
              <div className="text-sm font-medium text-ink">Target application not connected</div>
              <p className="mt-1 text-sm text-slate">{title} will load here. Synforma reads it through generic semantics only — roles, labels, text.</p>
              <Button className="mt-4" onClick={onConnect} disabled={connecting}>
                {connecting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {connecting ? "Connecting…" : "Connect application"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
