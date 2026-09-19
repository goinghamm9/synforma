"use client";
/**
 * Ledgerline Billing UI version ("simulated vendor release").
 *
 * "v1" is the current release (3.8); "v2" simulates the 3.9 vendor update
 * that renames the payment actions menu and the refund wizard, moves the
 * customer note into a tab of the review step, adds a sidebar group header
 * and changes DOM ids/classes. Stored in localStorage under
 * `ledgerline-ui-version`; also settable via `?ui=v1|v2` on any route.
 */
import { useSyncExternalStore } from "react";

export type UiVersion = "v1" | "v2";

export const UI_VERSION_KEY = "ledgerline-ui-version";

/** Vendor version label shown in the header per UI version. */
export const VERSION_LABEL: Record<UiVersion, string> = { v1: "v3.8", v2: "v3.9 preview" };

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
  /** Payment header menu */
  actionsMenu: string;
  refundPayment: string;
  sendReceipt: string;
  viewCustomer: string;
  /** Refund wizard */
  wizardTitle: string;
  refundReason: string;
  customerNoteStep: string;
  summaryTab: string;
  customerNoteTab: string;
  issueRefund: string;
  next: string;
  back: string;
}

export const LABELS: Record<UiVersion, UiLabels> = {
  v1: {
    actionsMenu: "Actions",
    refundPayment: "Refund payment",
    sendReceipt: "Send receipt",
    viewCustomer: "View customer",
    wizardTitle: "Refund payment",
    refundReason: "Refund reason",
    customerNoteStep: "Customer note",
    summaryTab: "Summary",
    customerNoteTab: "Customer note",
    issueRefund: "Issue refund",
    next: "Next",
    back: "Back",
  },
  v2: {
    actionsMenu: "More",
    refundPayment: "Create refund",
    sendReceipt: "Send receipt",
    viewCustomer: "View customer",
    wizardTitle: "Create refund",
    refundReason: "Reason for refund",
    customerNoteStep: "Customer note",
    summaryTab: "Summary",
    customerNoteTab: "Customer note",
    issueRefund: "Confirm refund",
    next: "Next",
    back: "Back",
  },
};

/** DOM id / class prefix for form fields: `fld-` in v1, `lb-` in v2. */
export const FIELD_PREFIX: Record<UiVersion, string> = { v1: "fld", v2: "lb" };

export type NavKey = "home" | "customers" | "payments" | "invoices" | "refunds" | "disputes" | "settings";

export interface NavLink {
  kind: "link";
  key: NavKey;
  label: string;
  href: string;
}

export interface NavGroup {
  kind: "group";
  key: string;
  label: string;
}

export type NavEntry = NavLink | NavGroup;

const LINKS: Record<NavKey, NavLink> = {
  home: { kind: "link", key: "home", label: "Home", href: "/sandbox/billing" },
  customers: { kind: "link", key: "customers", label: "Customers", href: "/sandbox/billing/customers" },
  payments: { kind: "link", key: "payments", label: "Payments", href: "/sandbox/billing/payments" },
  invoices: { kind: "link", key: "invoices", label: "Invoices", href: "/sandbox/billing/invoices" },
  refunds: { kind: "link", key: "refunds", label: "Refunds", href: "/sandbox/billing/refunds" },
  disputes: { kind: "link", key: "disputes", label: "Disputes", href: "/sandbox/billing/disputes" },
  settings: { kind: "link", key: "settings", label: "Settings", href: "/sandbox/billing/settings" },
};

/** Sidebar entries per version (v2 gains a "Money movement" group header). */
export const NAV: Record<UiVersion, NavEntry[]> = {
  v1: [LINKS.home, LINKS.customers, LINKS.payments, LINKS.invoices, LINKS.refunds, LINKS.disputes, LINKS.settings],
  v2: [
    LINKS.home,
    LINKS.customers,
    { kind: "group", key: "money", label: "Money movement" },
    LINKS.payments,
    LINKS.invoices,
    LINKS.refunds,
    LINKS.disputes,
    { kind: "group", key: "workspace", label: "Workspace" },
    LINKS.settings,
  ],
};

export function useUi() {
  const version = useUiVersion();
  return { version, labels: LABELS[version], prefix: FIELD_PREFIX[version], nav: NAV[version], versionLabel: VERSION_LABEL[version] };
}
