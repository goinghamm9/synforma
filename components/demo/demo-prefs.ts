import type { DemoPrefs, UiVariant } from "./types";

/**
 * Lightweight UI preferences for Mission Control (work context, last phase).
 * Domain data lives in the Synforma store; this only remembers where the
 * operator was. Every access is guarded: storage may be unavailable.
 */
const KEY = "synforma-demo-ui-v1";

/** The sandbox stores its own UI version here (same origin, shared storage). */
const SANDBOX_UI_KEY = "meridian-ui-version";

type PrefsFile = Record<string, DemoPrefs>;

function readAll(): PrefsFile {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as PrefsFile) : {};
  } catch {
    return {};
  }
}

export function readPrefs(programId: string): DemoPrefs {
  return readAll()[programId] ?? {};
}

export function writePrefs(programId: string, patch: DemoPrefs): void {
  try {
    const all = readAll();
    all[programId] = { ...(all[programId] ?? {}), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: preferences are a convenience only.
  }
}

export function clearPrefs(programId: string): void {
  try {
    const all = readAll();
    delete all[programId];
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** Reads the sandbox's UI version as it is stored right now ("v1" when unset). */
export function readSandboxUiVariant(): UiVariant {
  try {
    return window.localStorage.getItem(SANDBOX_UI_KEY) === "v2" ? "v2" : "v1";
  } catch {
    return "v1";
  }
}
