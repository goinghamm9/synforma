"use client";
/**
 * Lumen Workspace UI version ("simulated vendor release").
 *
 * "v1" is the current release (2.3); "v2" simulates the 2.4 preview: it
 * renames "Projects" to "Assistants" and "Knowledge" to "Data sources" (and
 * moves that entry under Usage in the sidebar), "New project" to "Create
 * assistant", the row menu to "More options", Next/Back to Continue/Previous,
 * the commit button to "Save assistant", moves the Data retention field into a
 * "Governance" tab on the review step and changes DOM ids/classes. Stored in
 * localStorage under `lumen-ui-version`; also settable via `?ui=v1|v2` on any
 * route.
 */
import { useSyncExternalStore } from "react";

export type UiVersion = "v1" | "v2";

export const UI_VERSION_KEY = "lumen-ui-version";

/** Product version string shown in the header per UI version. */
export const PRODUCT_VERSION: Record<UiVersion, string> = { v1: "2.3", v2: "2.4 preview" };

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
  /** Sidebar entry / page title of the project list */
  projects: string;
  /** Sidebar entry / page title of the knowledge list */
  knowledge: string;
  /** Button on the project list that opens the wizard; also the wizard's page title */
  newProject: string;
  /** Row / header action menus */
  actionsMenu: string;
  /** Title of the wizard's third step */
  knowledgeStep: string;
  /** Label of the source select in the wizard */
  knowledgeSource: string;
  /** Tabs on the review step (v2 only) */
  summaryTab: string;
  governanceTab: string;
  /** Wizard buttons */
  next: string;
  back: string;
  /** The commit button */
  createProject: string;
}

export const LABELS: Record<UiVersion, UiLabels> = {
  v1: {
    projects: "Projects",
    knowledge: "Knowledge",
    newProject: "New project",
    actionsMenu: "Actions",
    knowledgeStep: "Knowledge",
    knowledgeSource: "Knowledge source",
    summaryTab: "Summary",
    governanceTab: "Governance",
    next: "Next",
    back: "Back",
    createProject: "Create project",
  },
  v2: {
    projects: "Assistants",
    knowledge: "Data sources",
    newProject: "Create assistant",
    actionsMenu: "More options",
    knowledgeStep: "Data sources",
    knowledgeSource: "Data source",
    summaryTab: "Summary",
    governanceTab: "Governance",
    next: "Continue",
    back: "Previous",
    createProject: "Save assistant",
  },
};

/** DOM id / class prefix for form fields: `fld-` in v1, `lw-` in v2. */
export const FIELD_PREFIX: Record<UiVersion, string> = { v1: "fld", v2: "lw" };

export type NavKey = "home" | "projects" | "knowledge" | "usage" | "members" | "settings";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
}

export const BASE_PATH = "/sandbox/assistant";

export function projectPath(id: string): string {
  return `${BASE_PATH}/projects/${id}`;
}

function navItems(version: UiVersion): Record<NavKey, NavItem> {
  const labels = LABELS[version];
  return {
    home: { key: "home", label: "Home", href: BASE_PATH },
    projects: { key: "projects", label: labels.projects, href: `${BASE_PATH}/projects` },
    knowledge: { key: "knowledge", label: labels.knowledge, href: `${BASE_PATH}/knowledge` },
    usage: { key: "usage", label: "Usage", href: `${BASE_PATH}/usage` },
    members: { key: "members", label: "Members", href: `${BASE_PATH}/members` },
    settings: { key: "settings", label: "Settings", href: `${BASE_PATH}/settings` },
  };
}

/** Sidebar order per version (v2 moves Data sources under Usage). */
const NAV_ORDER: Record<UiVersion, NavKey[]> = {
  v1: ["home", "projects", "knowledge", "usage", "members", "settings"],
  v2: ["home", "projects", "usage", "knowledge", "members", "settings"],
};

export function navFor(version: UiVersion): NavItem[] {
  const items = navItems(version);
  return NAV_ORDER[version].map((key) => items[key]);
}

export function useUi() {
  const version = useUiVersion();
  return { version, labels: LABELS[version], prefix: FIELD_PREFIX[version], productVersion: PRODUCT_VERSION[version] };
}
