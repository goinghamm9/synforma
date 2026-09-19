"use client";
import { useCallback, useRef, useState } from "react";
import { anchorMatchesPage, resolveAnchorRect } from "@/lib/synforma/engine/observer";
import type { IframeDriver } from "@/lib/synforma/interaction/driver";
import type { ElementRect, PageModel, SemanticAnchor } from "@/lib/synforma/types";
import type { GuideRefs } from "./shared";
import type { OverlayCursor, OverlayHighlight } from "./types";

function sameRect(a: ElementRect | null | undefined, b: ElementRect | null | undefined): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

function onScreen(rect: ElementRect, driver: IframeDriver): boolean {
  const win = driver.win;
  if (!win) return false;
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  if (rect.w <= 0 || rect.h <= 0) return false;
  return rect.x + rect.w > 0 && rect.y + rect.h > 0 && rect.x < vw && rect.y < vh;
}

export interface OverlayApi {
  highlight: OverlayHighlight | null;
  cursor: OverlayCursor | null;
  setCursor: (cursor: OverlayCursor | null) => void;
  /** Recompute the ring for a live page model (every page snapshot). */
  updateOverlay: (livePage: PageModel) => void;
  /** Recompute the ring from the driver's current snapshot. */
  refreshOverlay: () => void;
  clearOverlay: () => void;
}

/**
 * The ring around the control that matters now (the card's anchor while a card
 * is up, otherwise the current step's) and Synforma's cursor while it acts.
 */
export function useOverlay(refs: GuideRefs): OverlayApi {
  const { driverRef, interventionRef, currentStepRef, foundRef } = refs;
  const [highlight, setHighlight] = useState<OverlayHighlight | null>(null);
  const [cursor, setCursor] = useState<OverlayCursor | null>(null);
  const highlightRef = useRef<OverlayHighlight | null>(null);

  const updateOverlay = useCallback(
    (livePage: PageModel) => {
      const driver = driverRef.current;
      if (!driver) return;
      const active = interventionRef.current;
      const step = currentStepRef.current;
      let anchor: SemanticAnchor | undefined;
      let kind: OverlayHighlight["kind"] = "step";
      if (active?.content.anchor) {
        // A found control is never highlighted: "clarify consequence" is rendered as a quiet inline card only.
        if (active.techniqueId !== "clarify_consequence") {
          anchor = active.content.anchor;
          kind = "assistance";
        }
      } else if (step && foundRef.current !== step.id) {
        anchor = step.anchor;
      }
      let next: OverlayHighlight | null = null;
      if (anchor && anchorMatchesPage(anchor, livePage)) {
        const hit = resolveAnchorRect(driver, anchor, livePage);
        if (hit && onScreen(hit.rect, driver)) next = { rect: hit.rect, label: hit.name, kind };
      }
      const prev = highlightRef.current;
      if (prev && next && sameRect(prev.rect, next.rect) && prev.label === next.label && prev.kind === next.kind) return;
      if (!prev && !next) return;
      highlightRef.current = next;
      setHighlight(next);
    },
    [currentStepRef, driverRef, foundRef, interventionRef],
  );

  const refreshOverlay = useCallback(() => {
    const p = driverRef.current ? driverRef.current.snapshot().page : null;
    if (p) updateOverlay(p);
  }, [driverRef, updateOverlay]);

  const clearOverlay = useCallback(() => {
    highlightRef.current = null;
    setHighlight(null);
    setCursor(null);
  }, []);

  return { highlight, cursor, setCursor, updateOverlay, refreshOverlay, clearOverlay };
}
