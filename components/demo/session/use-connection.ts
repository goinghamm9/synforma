"use client";
import * as React from "react";
import { useSynforma } from "@/lib/synforma/store";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import { resetTargetStorage, type TargetApp } from "@/lib/synforma/targets";
import type { PageModel } from "@/lib/synforma/types";
import type { ConnectionInfo, OverlayTarget } from "../types";
import { errorMessage, summarizePage } from "./helpers";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

/** The application's own error page was shown instead of its home page (see app/sandbox/_shared/sandbox-error.tsx). */
export class ApplicationCrashed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationCrashed";
  }
}

const CRASH_HEADING_RE = /hit an error$/i;

/** How long one attempt may keep reading an empty frame before giving up (after the driver's own load window). */
const EMPTY_FRAME_PATIENCE_MS = 12_000;

/**
 * Load the application's home page in the frame and read it until it shows something, or explain why it
 * did not: a foreign origin, a blank document, the application's own error page, or nothing readable in
 * time.
 */
async function readHomePage(driver: IframeDriver, target: TargetApp): Promise<PageModel> {
  let page = await driver.goto(target.baseUrl);
  // A cold server (first request after a quiet period on serverless hosting) can take longer than the
  // driver's load window. Keep reading for a while before giving up.
  for (let waited = 0; (page.fingerprint === "empty" || page.elements.length === 0) && waited < EMPTY_FRAME_PATIENCE_MS; waited += 500) {
    await new Promise((r) => setTimeout(r, 500));
    page = driver.snapshot().page;
  }
  const crashHeading = page.headings.find((h) => CRASH_HEADING_RE.test(h));
  if (crashHeading) {
    throw new ApplicationCrashed(`${target.name} showed its own error page ("${crashHeading}") instead of its home page. The records it keeps in this browser may come from an earlier version of the demo: resetting them returns it to its seed data.`);
  }
  if (page.fingerprint === "empty" || page.elements.length === 0) {
    const st = driver.frameState();
    if (!st.accessible) throw new Error(`The frame cannot be read: ${target.baseUrl} loaded from another origin (a login page or a redirect). Open it in a new tab to see what it shows.`);
    if (st.bodyChildren === 0) throw new Error(`The application returned a blank page at ${st.url ?? target.baseUrl}.`);
    throw new Error(`The application did not render anything Synforma could read within the time limit (frame ${st.readyState ?? "unknown"}, ${st.bodyChildren ?? 0} elements at ${st.url ?? target.baseUrl}).`);
  }
  return page;
}

export interface ConnectionApi {
  /** The sandbox iframe; mounted once and kept for the life of the page. */
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** The interaction driver bound to the iframe (null before mount). */
  getDriver: () => IframeDriver | null;
  /** Where the driver's log lines go while an engine job runs (null discards them). */
  driverLogSinkRef: React.RefObject<((message: string) => void) | null>;
  /** The one engine job that may drive the iframe at a time (discovery, act run, simulation). */
  abortRef: React.RefObject<AbortController | null>;
  status: ConnectionStatus;
  info: ConnectionInfo | null;
  error: string | null;
  /** When the running connect started (epoch ms); null unless `status` is "connecting". */
  since: number | null;
  /** Attempts made by the running or last connect: 1, or 2 after the automatic second try. */
  attempt: number;
  /** The last error came from the application's own error page: its stored data is the likely cause. */
  crashed: boolean;
  connected: boolean;
  currentUrl: string;
  cursor: OverlayTarget | null;
  highlight: OverlayTarget | null;
  /** Fade the agent cursor and highlight out in place once the engine is done with the iframe. */
  hideOverlays: () => void;
  /**
   * Load the sandbox home page and take one semantic snapshot; `silent` skips the audit entry (reconnect after
   * reload). A first attempt that fails for any reason other than the application's own error page is retried
   * once automatically.
   */
  connect: (target: TargetApp, silent?: boolean) => Promise<void>;
  /** Remove what the application keeps in this browser (its records, its UI version) and connect again. */
  resetTargetData: (target: TargetApp) => Promise<void>;
  /** Re-read the iframe's URL into state (after the engine navigated). */
  syncUrl: () => void;
  /** Navigate the sandbox to a URL (e.g. the created record). */
  goto: (url: string) => Promise<void>;
  /** Back to idle: blank iframe, no overlays, no URL. */
  reset: () => void;
}

/** Iframe, driver and connection state for the sandbox application. */
export function useConnection(): ConnectionApi {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const driverRef = React.useRef<IframeDriver | null>(null);
  const driverLogSinkRef = React.useRef<((message: string) => void) | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  /** Set after a failed connect: the next connect loads the frame afresh instead of re-reading what failed. */
  const reloadFrameRef = React.useRef(false);
  const [connection, setConnection] = React.useState<{ status: ConnectionStatus; info: ConnectionInfo | null; error: string | null; since: number | null; attempt: number; crashed: boolean }>({ status: "idle", info: null, error: null, since: null, attempt: 0, crashed: false });
  const [currentUrl, setCurrentUrl] = React.useState("");
  const [cursor, setCursor] = React.useState<OverlayTarget | null>(null);
  const [highlight, setHighlight] = React.useState<OverlayTarget | null>(null);

  const getDriver = React.useCallback(() => driverRef.current, []);

  const hideOverlays = React.useCallback(() => {
    setCursor((c) => (c ? { ...c, visible: false } : null));
    setHighlight((h) => (h ? { ...h, visible: false } : null));
  }, []);

  // ─────────────── driver: one per iframe, created after mount ───────────────
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const driver = new IframeDriver(iframe, {
      paceMs: 120,
      events: {
        onCursor: (rect, label) => setCursor((c) => (rect ? { rect, label, visible: true } : c ? { ...c, visible: false } : null)),
        onHighlight: (rect, label) => setHighlight((h) => (rect ? { rect, label, visible: true } : h ? { ...h, visible: false } : null)),
        onNavigate: (url) => {
          setCurrentUrl(url);
          setCursor((c) => (c ? { ...c, visible: false } : null));
          setHighlight((h) => (h ? { ...h, visible: false } : null));
        },
        onLog: (message) => driverLogSinkRef.current?.(message),
      },
    });
    driverRef.current = driver;
    const urlPoll = window.setInterval(() => {
      const url = driver.currentUrl();
      setCurrentUrl((u) => (u === url ? u : url));
    }, 1000);
    return () => {
      window.clearInterval(urlPoll);
      driverRef.current = null;
    };
  }, []);

  // Cancel any running engine work on unmount.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const connect = React.useCallback(async (target: TargetApp, silent = false) => {
    const driver = driverRef.current;
    if (!driver) return;
    setConnection({ status: "connecting", info: null, error: null, since: Date.now(), attempt: 1, crashed: false });
    if (reloadFrameRef.current) {
      // After a failure the frame still shows what failed (an error page at the home URL, a blank document):
      // the driver would otherwise read it again instead of loading the page afresh.
      reloadFrameRef.current = false;
      const iframe = iframeRef.current;
      if (iframe) iframe.src = "about:blank";
      await new Promise((r) => setTimeout(r, 300));
    }
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt === 2) {
        // A frame that showed nothing the first time (a slow first answer, a transient network error) usually
        // does the second time; the application's own error page will not, so it is not retried.
        setConnection((c) => ({ ...c, attempt }));
        const iframe = iframeRef.current;
        if (iframe) iframe.src = "about:blank";
        await new Promise((r) => setTimeout(r, 300));
      }
      try {
        const page = await readHomePage(driver, target);
        const info = summarizePage(page);
        setConnection({ status: "connected", info, error: null, since: null, attempt, crashed: false });
        setCurrentUrl(driver.currentUrl());
        if (!silent) {
          useSynforma.getState().addAudit({ actor: "admin", action: "Connected application", target: target.name, detail: `${info.actions} actions · ${info.fields} fields · ${info.landmarks.length} landmarks on ${info.url}${attempt > 1 ? " · on the second attempt" : ""}` });
        }
        return;
      } catch (e) {
        lastError = e;
        if (e instanceof ApplicationCrashed) break;
      }
    }
    const crashed = lastError instanceof ApplicationCrashed;
    reloadFrameRef.current = true;
    setConnection((c) => ({ status: "error", info: null, error: `${errorMessage(lastError)}${crashed || c.attempt < 2 ? "" : " Two attempts were made."}`, since: null, attempt: c.attempt, crashed }));
  }, []);

  const resetTargetData = React.useCallback(
    async (target: TargetApp) => {
      const cleared = resetTargetStorage(target);
      useSynforma.getState().addAudit({ actor: "admin", action: "Reset application data", target: target.name, detail: cleared ? `Removed ${target.storageKeys.join(", ")} from this browser; the application starts from its seed records.` : "Browser storage is unavailable; nothing was removed." });
      reloadFrameRef.current = true;
      await connect(target);
    },
    [connect],
  );

  const syncUrl = React.useCallback(() => {
    const driver = driverRef.current;
    if (driver) setCurrentUrl(driver.currentUrl());
  }, []);

  const goto = React.useCallback(async (url: string) => {
    const driver = driverRef.current;
    if (!driver) return;
    await driver.goto(url);
    setCurrentUrl(driver.currentUrl());
  }, []);

  const reset = React.useCallback(() => {
    setConnection({ status: "idle", info: null, error: null, since: null, attempt: 0, crashed: false });
    setCursor(null);
    setHighlight(null);
    const iframe = iframeRef.current;
    if (iframe) iframe.src = "about:blank";
    setCurrentUrl("");
  }, []);

  return {
    iframeRef,
    getDriver,
    driverLogSinkRef,
    abortRef,
    status: connection.status,
    info: connection.info,
    error: connection.error,
    since: connection.since,
    attempt: connection.attempt,
    crashed: connection.crashed,
    connected: connection.status === "connected",
    currentUrl,
    cursor,
    highlight,
    hideOverlays,
    connect,
    resetTargetData,
    syncUrl,
    goto,
    reset,
  };
}
