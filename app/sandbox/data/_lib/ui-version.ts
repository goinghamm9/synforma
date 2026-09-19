"use client";
/**
 * Nimbus Data Console UI version ("simulated vendor release").
 *
 * "v1" is the current release (2.14); "v2" simulates the 2.15 preview: it
 * renames "Table editor" to "Tables", "New table" to "Create table",
 * "Row level security" to "RLS protection", moves the policy form into a
 * "Policies" tab on the review step, relabels the commit button "Save table",
 * reorders the sidebar and changes DOM ids/classes. Stored in localStorage
 * under `nimbus-ui-version`; also settable via `?ui=v1|v2` on any route.
 */
import { useSyncExternalStore } from "react";

export type UiVersion = "v1" | "v2";

export const UI_VERSION_KEY = "nimbus-ui-version";

/** Product version string shown in the header per UI version. */
export const PRODUCT_VERSION: Record<UiVersion, string> = { v1: "2.14", v2: "2.15 preview" };

const listeners = new Set<() => void>();
let cached: UiVersion | null = null;

function readFromStorage(): UiVersion {
  if (typeof window === "undefined") return "v1";
  try {
    return window.localStorage.getItem(UI_VERSION_KEY) === "v2" ? "v2" : "v1";
  } catch {
    return "v1";
  }
}

export function getUiVersion(): UiVersion {
  if (cached === null) cached = readFromStorage();
  return cached;
}

export function setUiVersion(version: UiVersion): void {
  cached = version;
  try {
    window.localStorage.setItem(UI_VERSION_KEY, version);
  } catch {
    // Storage may be unavailable (private mode); keep the in-memory value.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === UI_VERSION_KEY || event.key === null) {
      cached = readFromStorage();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerVersion(): UiVersion {
  return "v1";
}

/** Current UI version. Renders "v1" on the server and during hydration, then the stored value. */
export function useUiVersion(): UiVersion {
  return useSyncExternalStore(subscribe, getUiVersion, getServerVersion);
}

// ───────────────────────────── Labels ─────────────────────────────

export interface UiLabels {
  /** Sidebar / page title of the table list */
  tables: string;
  /** Button on the table list that opens the wizard */
  newTable: string;
  /** Accessible name of the row level security toggle */
  rls: string;
  /** Title of the wizard's security step */
  securityStep: string;
  /** Tabs on the review step (v2 only) */
  summaryTab: string;
  policiesTab: string;
  /** Wizard buttons */
  next: string;
  back: string;
  /** The commit button */
  createTable: string;
  /** Row / header action menus */
  actionsMenu: string;
  addPolicy: string;
  rotateKey: string;
  inviteMember: string;
}

export const LABELS: Record<UiVersion, UiLabels> = {
  v1: {
    tables: "Table editor",
    newTable: "New table",
    rls: "Row level security",
    securityStep: "Security",
    summaryTab: "Summary",
    policiesTab: "Policies",
    next: "Next",
    back: "Back",
    createTable: "Create table",
    actionsMenu: "Actions",
    addPolicy: "Add policy",
    rotateKey: "Rotate key",
    inviteMember: "Invite member",
  },
  v2: {
    tables: "Tables",
    newTable: "Create table",
    rls: "RLS protection",
    securityStep: "Security",
    summaryTab: "Summary",
    policiesTab: "Policies",
    next: "Continue",
    back: "Previous",
    createTable: "Save table",
    actionsMenu: "More options",
    addPolicy: "New policy",
    rotateKey: "Rotate key",
    inviteMember: "Invite member",
  },
};

/** DOM id / class prefix for form fields: `fld-` in v1, `nb-` in v2. */
export const FIELD_PREFIX: Record<UiVersion, string> = { v1: "fld", v2: "nb" };

export type NavKey = "home" | "tables" | "sql" | "auth" | "storage" | "apiKeys" | "team" | "settings";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  /** Items in the "Project" group; the others are global. */
  scope: "project" | "global";
}

export const BASE_PATH = "/sandbox/data";

export function projectPath(projectId: string, sub = ""): string {
  return `${BASE_PATH}/projects/${projectId}${sub}`;
}

function navItems(version: UiVersion, projectId: string): Record<NavKey, NavItem> {
  const labels = LABELS[version];
  return {
    home: { key: "home", label: "Home", href: BASE_PATH, scope: "global" },
    tables: { key: "tables", label: labels.tables, href: projectPath(projectId, "/tables"), scope: "project" },
    sql: { key: "sql", label: "SQL editor", href: projectPath(projectId, "/sql"), scope: "project" },
    auth: { key: "auth", label: "Authentication", href: projectPath(projectId, "/auth"), scope: "project" },
    storage: { key: "storage", label: "Storage", href: projectPath(projectId, "/storage"), scope: "project" },
    apiKeys: { key: "apiKeys", label: "API keys", href: projectPath(projectId, "/api-keys"), scope: "project" },
    team: { key: "team", label: "Team", href: projectPath(projectId, "/team"), scope: "project" },
    settings: { key: "settings", label: "Settings", href: `${BASE_PATH}/settings`, scope: "global" },
  };
}

/** Sidebar order per version (v2 moves Authentication up and Team before API keys). */
const NAV_ORDER: Record<UiVersion, NavKey[]> = {
  v1: ["home", "tables", "sql", "auth", "storage", "apiKeys", "team", "settings"],
  v2: ["home", "tables", "auth", "sql", "storage", "team", "apiKeys", "settings"],
};

export function navFor(version: UiVersion, projectId: string): NavItem[] {
  const items = navItems(version, projectId);
  return NAV_ORDER[version].map((key) => items[key]);
}

export function useUi() {
  const version = useUiVersion();
  return { version, labels: LABELS[version], prefix: FIELD_PREFIX[version], productVersion: PRODUCT_VERSION[version] };
}
