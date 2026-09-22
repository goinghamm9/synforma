"use client";
import { useEffect } from "react";

/**
 * The error page of a sandbox application. Each application keeps its records in this browser
 * (localStorage); a render error most often means those records come from an earlier version of the
 * demo. The page says so in the application's own words and offers to reset that data, so that an
 * embedded copy never goes blank: Synforma's Connect stage recognises the heading and explains it.
 * Inline styles on purpose: the page must render even when the application's stylesheet did not.
 */
export function SandboxError({ name, storageKeys, error, reset }: { name: string; storageKeys: readonly string[]; error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(`[${name}] render error`, error);
  }, [error, name]);
  const resetData = () => {
    try {
      for (const key of storageKeys) window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable; a reload is still the best next step.
    }
    window.location.reload();
  };
  return (
    <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", color: "#1f2937" }} aria-labelledby="sandbox-error-title">
      <h1 id="sandbox-error-title" style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
        {name} hit an error
      </h1>
      <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "#4b5563" }}>
        This page could not be shown. The records this demo application keeps in your browser may come from an earlier version of it; resetting them returns the application to its seed data.
      </p>
      <p style={{ marginTop: 8, fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#6b7280", overflowWrap: "anywhere" }}>{error.message}</p>
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={resetData} style={{ background: "#111827", color: "#fff", border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 14, cursor: "pointer" }}>
          Reset its demo data and reload
        </button>
        <button type="button" onClick={reset} style={{ background: "#fff", color: "#111827", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 12px", fontSize: 14, cursor: "pointer" }}>
          Try again
        </button>
      </div>
    </main>
  );
}
