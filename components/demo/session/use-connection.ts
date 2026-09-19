"use client";
import * as React from "react";
import { useSynforma } from "@/lib/synforma/store";
import { IframeDriver } from "@/lib/synforma/interaction/driver";
import { SANDBOX_APP } from "@/lib/synforma/demo";
import type { ConnectionInfo, OverlayTarget } from "../types";
import { errorMessage, summarizePage } from "./helpers";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

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
  connected: boolean;
  currentUrl: string;
  cursor: OverlayTarget | null;
  highlight: OverlayTarget | null;
  /** Fade the agent cursor and highlight out in place once the engine is done with the iframe. */
  hideOverlays: () => void;
  /** Load the sandbox home page and take one semantic snapshot; `silent` skips the audit entry (reconnect after reload). */
  connect: (silent?: boolean) => Promise<void>;
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
  const [connection, setConnection] = React.useState<{ status: ConnectionStatus; info: ConnectionInfo | null; error: string | null }>({ status: "idle", info: null, error: null });
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

  const connect = React.useCallback(async (silent = false) => {
    const driver = driverRef.current;
    if (!driver) return;
    setConnection((c) => ({ ...c, status: "connecting", error: null }));
    try {
      const page = await driver.goto(SANDBOX_APP.baseUrl);
      if (page.fingerprint === "empty" || page.elements.length === 0) throw new Error("The application did not render anything Synforma could read.");
      const info = summarizePage(page);
      setConnection({ status: "connected", info, error: null });
      setCurrentUrl(driver.currentUrl());
      if (!silent) {
        useSynforma.getState().addAudit({ actor: "admin", action: "Connected application", target: SANDBOX_APP.name, detail: `${info.actions} actions · ${info.fields} fields · ${info.landmarks.length} landmarks on ${info.url}` });
      }
    } catch (e) {
      setConnection({ status: "error", info: null, error: errorMessage(e) });
    }
  }, []);

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
    setConnection({ status: "idle", info: null, error: null });
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
    connected: connection.status === "connected",
    currentUrl,
    cursor,
    highlight,
    hideOverlays,
    connect,
    syncUrl,
    goto,
    reset,
  };
}
