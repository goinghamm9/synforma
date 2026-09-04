"use client";
/**
 * Meridian CRM UI version ("simulated vendor release").
 *
 * "v1" is the current release; "v2" simulates a vendor update that renames
 * labels, moves the lead actions into a kebab menu, turns the advanced
 * collapsible into a tab and changes DOM ids/classes. Stored in localStorage
 * under `meridian-ui-version`; also settable via `?ui=v1|v2` on any route.
 */
import { useSyncExternalStore } from "react";

export type UiVersion = "v1" | "v2";

export const UI_VERSION_KEY = "meridian-ui-version";

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
  /** Form field labels */
  decisionMaker: string;
  fundingStage: string;
  decisionTimeline: string;
  nextStep: string;
  nextStepDate: string;
  /** Sections */
  advancedSection: string;
  coreTab: string;
  /** Lead header menu */
  actionsMenu: string;
  convertToOpportunity: string;
  markAsNurturing: string;
  assignOwner: string;
  /** Wizard buttons */
  next: string;
  back: string;
  create: string;
}

export const LABELS: Record<UiVersion, UiLabels> = {
  v1: {
    decisionMaker: "Decision-maker",
    fundingStage: "Funding stage",
    decisionTimeline: "Decision timeline",
    nextStep: "Next step",
    nextStepDate: "Next step date",
    advancedSection: "Advanced qualification",
    coreTab: "Core",
    actionsMenu: "Actions",
    convertToOpportunity: "Convert to opportunity",
    markAsNurturing: "Mark as nurturing",
    assignOwner: "Assign owner",
    next: "Next",
    back: "Back",
    create: "Create opportunity",
  },
  v2: {
    decisionMaker: "Economic buyer",
    fundingStage: "Budget confirmation",
    decisionTimeline: "Purchase timeframe",
    nextStep: "Next action",
    nextStepDate: "Next action date",
    advancedSection: "Additional details",
    coreTab: "Core",
    actionsMenu: "More options",
    convertToOpportunity: "Create opportunity from lead",
    markAsNurturing: "Mark as nurturing",
    assignOwner: "Assign owner",
    next: "Continue",
    back: "Back",
    create: "Save opportunity",
  },
};

/** DOM id / class prefix for form fields: `fld-` in v1, `mx-` in v2. */
export const FIELD_PREFIX: Record<UiVersion, string> = { v1: "fld", v2: "mx" };

export interface NavItem {
  key: "home" | "leads" | "opportunities" | "accounts" | "contacts" | "reports" | "settings";
  label: string;
  href: string;
}

const NAV_ITEMS: Record<NavItem["key"], NavItem> = {
  home: { key: "home", label: "Home", href: "/sandbox/crm" },
  leads: { key: "leads", label: "Leads", href: "/sandbox/crm/leads" },
  opportunities: { key: "opportunities", label: "Opportunities", href: "/sandbox/crm/opportunities" },
  accounts: { key: "accounts", label: "Accounts", href: "/sandbox/crm/accounts" },
  contacts: { key: "contacts", label: "Contacts", href: "/sandbox/crm/contacts" },
  reports: { key: "reports", label: "Reports", href: "/sandbox/crm/reports" },
  settings: { key: "settings", label: "Settings", href: "/sandbox/crm/settings" },
};

/** Primary nav order per version (v2 lists Opportunities before Leads). */
export const NAV_ORDER: Record<UiVersion, NavItem[]> = {
  v1: [
    NAV_ITEMS.home,
    NAV_ITEMS.leads,
    NAV_ITEMS.opportunities,
    NAV_ITEMS.accounts,
    NAV_ITEMS.contacts,
    NAV_ITEMS.reports,
    NAV_ITEMS.settings,
  ],
  v2: [
    NAV_ITEMS.home,
    NAV_ITEMS.opportunities,
    NAV_ITEMS.leads,
    NAV_ITEMS.accounts,
    NAV_ITEMS.contacts,
    NAV_ITEMS.reports,
    NAV_ITEMS.settings,
  ],
};

export function useUi() {
  const version = useUiVersion();
  return { version, labels: LABELS[version], prefix: FIELD_PREFIX[version], nav: NAV_ORDER[version] };
}
