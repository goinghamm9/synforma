"use client";
/**
 * Atlas ERP UI version ("simulated vendor release").
 *
 * "v1" is Release 24.1; "v2" simulates the Release 24.2 preview: a vendor
 * update that renames labels ("Cost center" → "Cost centre", "Business
 * justification" → "Justification"), moves the Justification step into a tab of
 * the Review step, renames the commit button ("Submit" → "Order"), adds a
 * column to the item table and changes DOM ids/classes. Stored in
 * localStorage under `atlas-ui-version`; also settable via `?ui=v1|v2` on any
 * route.
 */
import { useSyncExternalStore } from "react";

export type UiVersion = "v1" | "v2";

export const UI_VERSION_KEY = "atlas-ui-version";

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
  /** Shell bar release tag */
  release: string;
  /** Launchpad tiles */
  createRequisitionTile: string;
  costCentersTile: string;
  /** Field labels */
  description: string;
  costCenter: string;
  materialGroup: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  deliveryDate: string;
  justification: string;
  notSplit: string;
  /** Wizard steps and tabs */
  generalStep: string;
  itemsStep: string;
  justificationStep: string;
  reviewStep: string;
  summaryTab: string;
  justificationTab: string;
  /** Wizard buttons */
  next: string;
  back: string;
  submit: string;
  addItem: string;
  /** Actions */
  approve: string;
  returnWithComment: string;
  editPaymentTerms: string;
}

export const LABELS: Record<UiVersion, UiLabels> = {
  v1: {
    release: "Release 24.1",
    createRequisitionTile: "Create Purchase Requisition",
    costCentersTile: "Cost Centers",
    description: "Description",
    costCenter: "Cost center",
    materialGroup: "Material group",
    itemDescription: "Item description",
    quantity: "Quantity",
    unitPrice: "Unit price",
    deliveryDate: "Requested delivery date",
    justification: "Business justification",
    notSplit: "This requisition is not split to stay under an approval limit",
    generalStep: "General",
    itemsStep: "Items",
    justificationStep: "Justification",
    reviewStep: "Review",
    summaryTab: "Summary",
    justificationTab: "Justification",
    next: "Next",
    back: "Previous",
    submit: "Submit",
    addItem: "Add item",
    approve: "Approve",
    returnWithComment: "Return with comment",
    editPaymentTerms: "Edit payment terms",
  },
  v2: {
    release: "Release 24.2 preview",
    createRequisitionTile: "New Requisition",
    costCentersTile: "Cost Centres",
    description: "Description",
    costCenter: "Cost centre",
    materialGroup: "Material group",
    itemDescription: "Item description",
    quantity: "Quantity",
    unitPrice: "Unit price",
    deliveryDate: "Requested delivery date",
    justification: "Justification",
    notSplit: "This requisition is not split to stay under an approval limit",
    generalStep: "General",
    itemsStep: "Items",
    justificationStep: "Justification",
    reviewStep: "Review",
    summaryTab: "Summary",
    justificationTab: "Justification",
    next: "Continue",
    back: "Back",
    submit: "Order",
    addItem: "Add item",
    approve: "Approve",
    returnWithComment: "Return with comment",
    editPaymentTerms: "Edit payment terms",
  },
};

/** DOM id / class prefix for form fields: `at-` in v1, `ax-` in v2. */
export const FIELD_PREFIX: Record<UiVersion, string> = { v1: "at", v2: "ax" };

export function useUi() {
  const version = useUiVersion();
  return { version, labels: LABELS[version], prefix: FIELD_PREFIX[version] };
}
