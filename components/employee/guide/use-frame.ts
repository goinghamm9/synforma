"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import type { GuideRefs } from "./shared";
import type { FrameBox, OverlayCursor } from "./types";

export interface FrameApi {
  frameReady: boolean;
  frameError: string | null;
  /** The iframe's box in page coordinates (the overlay is positioned over it). */
  frame: FrameBox | null;
  /** The one driver for the mounted iframe, created on first use. */
  getDriver: () => IframeDriver | null;
  /** Re-measure the iframe's box; no state change when it did not move. */
  measureFrame: () => void;
  /** Navigate the frame to the start URL and wait for the application to answer. */
  loadStart: () => Promise<void>;
}

/** Iframe readiness: driver creation, the initial navigation, box measuring and the frame error state. */
export function useFrame({
  refs,
  iframeRef,
  startUrl,
  setCursor,
}: {
  refs: GuideRefs;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  startUrl: string;
  setCursor: (cursor: OverlayCursor | null) => void;
}): FrameApi {
  const { driverRef } = refs;
  const [frameReady, setFrameReady] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [frame, setFrame] = useState<FrameBox | null>(null);
  const frameRef = useRef<FrameBox | null>(null);
  const navigatedRef = useRef(false);

  const getDriver = useCallback((): IframeDriver | null => {
    if (driverRef.current) return driverRef.current;
    const el = iframeRef.current;
    if (!el) return null;
    driverRef.current = new IframeDriver(el, {
      paceMs: 300,
      events: {
        onCursor: (rect, label) => setCursor(rect ? { rect, label } : null),
      },
    });
    return driverRef.current;
  }, [driverRef, iframeRef, setCursor]);

  const measureFrame = useCallback(() => {
    const driver = driverRef.current;
    if (!driver) return;
    const r = driver.frameRect();
    const next = { left: r.left, top: r.top, width: r.width, height: r.height };
    const prev = frameRef.current;
    if (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5) return;
    frameRef.current = next;
    setFrame(next);
  }, [driverRef]);

  const loadStart = useCallback(async () => {
    const driver = getDriver();
    if (!driver) return;
    setFrameError(null);
    setFrameReady(false);
    try {
      await driver.goto(startUrl);
      const ok = Boolean(driver.doc && driver.doc.body && driver.doc.body.children.length > 0 && driver.currentUrl() !== "about:blank");
      if (!ok) throw new Error("The target application did not respond.");
      setFrameReady(true);
      measureFrame();
    } catch (e) {
      setFrameError(e instanceof Error ? e.message : "The target application did not load.");
    }
  }, [getDriver, measureFrame, startUrl]);

  useEffect(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    void loadStart();
  }, [loadStart]);

  useEffect(() => {
    let raf = 0;
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureFrame);
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [measureFrame]);

  return { frameReady, frameError, frame, getDriver, measureFrame, loadStart };
}
