"use client";
/**
 * Atlas ERP data store.
 *
 * A tiny typed document store persisted to localStorage under `atlas-erp-db`.
 * Seeded on first load. Components subscribe through `useDb()` (a
 * useSyncExternalStore hook) so every page re-renders when data changes.
 * On the server (and during hydration) `useDb()` returns null so pages can
 * render a loading skeleton and avoid hydration mismatches.
 */
import { useSyncExternalStore } from "react";

export const DB_KEY = "atlas-erp-db";
const DB_VERSION = 1;

// ───────────────────────────── Types ─────────────────────────────

export const REQUISITION_STATUSES = ["Draft", "Submitted", "Approved", "Returned"] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const MATERIAL_GROUPS = ["Office equipment", "IT hardware", "Software", "Services", "Consumables"] as const;
export type MaterialGroup = (typeof MATERIAL_GROUPS)[number];

export const PAYMENT_TERMS = ["Net 14", "Net 30", "Net 45", "Net 60", "2% 10, Net 30"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const SUPPLIER_STATUSES = ["Active", "Blocked"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/** The signed-in demo user. */
export const CURRENT_USER = { name: "Lena Hoffmann", role: "Purchasing", initials: "LH" } as const;

export interface CostCenter {
  id: string;
  name: string;
  owner: string;
  budget: number;
}

export interface SupplierChange {
  id: string;
  at: string;
  actor: string;
  field: string;
  from: string;
  to: string;
  reason: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: MaterialGroup;
  city: string;
  country: string;
  paymentTerms: PaymentTerms;
  contactName: string;
  email: string;
  status: SupplierStatus;
  since: string;
  changes: SupplierChange[];
}

export interface RequisitionItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** ISO YYYY-MM-DD */
  deliveryDate: string;
}

export type ApprovalAction = "Created" | "Submitted" | "Approved" | "Returned" | "Resubmitted";

export interface ApprovalEvent {
  id: string;
  at: string;
  actor: string;
  action: ApprovalAction;
  comment: string;
}

export interface Requisition {
  id: string;
  description: string;
  costCenterId: string;
  materialGroup: MaterialGroup | "";
  items: RequisitionItem[];
  justification: string;
  /** The requester confirmed the order is not split to stay under an approval limit. */
  notSplit: boolean;
  status: RequisitionStatus;
  requestedBy: string;
  createdAt: string;
  submittedAt: string;
  history: ApprovalEvent[];
}

export interface AtlasDb {
  version: number;
  costCenters: CostCenter[];
  suppliers: Supplier[];
  requisitions: Requisition[];
}

// ───────────────────────────── Seed ─────────────────────────────

function item(id: string, description: string, quantity: number, unitPrice: number, deliveryDate: string): RequisitionItem {
  return { id, description, quantity, unitPrice, deliveryDate };
}

function event(id: string, at: string, actor: string, action: ApprovalAction, comment = ""): ApprovalEvent {
  return { id, at, actor, action, comment };
}

function createSeed(): AtlasDb {
  const costCenters: CostCenter[] = [
    { id: "CC-1000", name: "Executive Office", owner: "Katrin Vogel", budget: 120000 },
    { id: "CC-1100", name: "Human Resources", owner: "Amira Saleh", budget: 85000 },
    { id: "CC-1200", name: "Facilities", owner: "Jonas Weber", budget: 260000 },
    { id: "CC-1300", name: "IT Operations", owner: "Tomasz Nowak", budget: 410000 },
    { id: "CC-1400", name: "Marketing", owner: "Sofia Marin", budget: 190000 },
    { id: "CC-1500", name: "Sales", owner: "Daniel Brecht", budget: 150000 },
    { id: "CC-1600", name: "Research & Development", owner: "Mei Lin", budget: 330000 },
    { id: "CC-1700", name: "Customer Support", owner: "Ola Bergström", budget: 95000 },
  ];

  const suppliers: Supplier[] = [
    { id: "SUP-1001", name: "Nordlicht Büromöbel GmbH", category: "Office equipment", city: "Hamburg", country: "Germany", paymentTerms: "Net 30", contactName: "Birgit Lange", email: "orders@nordlicht-bueromoebel.example", status: "Active", since: "2019-03-12", changes: [] },
    { id: "SUP-1002", name: "Brightbyte Systems AG", category: "IT hardware", city: "Zürich", country: "Switzerland", paymentTerms: "Net 45", contactName: "Luca Meier", email: "sales@brightbyte.example", status: "Active", since: "2020-07-01", changes: [] },
    { id: "SUP-1003", name: "Cloudmere Software Ltd", category: "Software", city: "Dublin", country: "Ireland", paymentTerms: "Net 30", contactName: "Aoife Byrne", email: "accounts@cloudmere.example", status: "Active", since: "2021-01-18", changes: [] },
    { id: "SUP-1004", name: "Helix Facility Services", category: "Services", city: "Berlin", country: "Germany", paymentTerms: "Net 14", contactName: "Markus Feld", email: "service@helix-facility.example", status: "Active", since: "2018-11-05", changes: [] },
    { id: "SUP-1005", name: "PaperTrail Supplies BV", category: "Consumables", city: "Rotterdam", country: "Netherlands", paymentTerms: "Net 30", contactName: "Sanne de Vries", email: "orders@papertrail.example", status: "Active", since: "2017-06-20", changes: [] },
    { id: "SUP-1006", name: "Ergo Workspace SAS", category: "Office equipment", city: "Lyon", country: "France", paymentTerms: "Net 60", contactName: "Claire Moreau", email: "contact@ergo-workspace.example", status: "Active", since: "2022-02-14", changes: [] },
    { id: "SUP-1007", name: "Quantum Link Networks", category: "IT hardware", city: "Munich", country: "Germany", paymentTerms: "Net 30", contactName: "Felix Brandt", email: "quotes@quantumlink.example", status: "Active", since: "2020-09-30", changes: [] },
    { id: "SUP-1008", name: "Alpenrand Events & Catering", category: "Services", city: "Vienna", country: "Austria", paymentTerms: "2% 10, Net 30", contactName: "Theresa Gruber", email: "events@alpenrand.example", status: "Active", since: "2021-05-03", changes: [] },
    { id: "SUP-1009", name: "CleanCycle Hygiene", category: "Consumables", city: "Copenhagen", country: "Denmark", paymentTerms: "Net 30", contactName: "Mads Jensen", email: "sales@cleancycle.example", status: "Blocked", since: "2019-08-22", changes: [] },
    { id: "SUP-1010", name: "Vektor Licensing Partners", category: "Software", city: "Stockholm", country: "Sweden", paymentTerms: "Net 45", contactName: "Elin Sandberg", email: "licensing@vektor.example", status: "Active", since: "2023-04-11", changes: [] },
  ];

  const requisitions: Requisition[] = [
    {
      id: "PR-8001",
      description: "Ergonomic chairs for the Munich office",
      costCenterId: "CC-1200",
      materialGroup: "Office equipment",
      items: [item("PR-8001-1", "Ergonomic task chair", 12, 385, "2026-10-05")],
      justification: "The Munich office replaces chairs that are past their eight-year service life. The ergonomic model is the standard agreed with the works council.",
      notSplit: true,
      status: "Approved",
      requestedBy: "Jonas Weber",
      createdAt: "2026-08-14",
      submittedAt: "2026-08-14",
      history: [
        event("PR-8001-h1", "2026-08-14T09:12:00", "Jonas Weber", "Created"),
        event("PR-8001-h2", "2026-08-14T09:40:00", "Jonas Weber", "Submitted"),
        event("PR-8001-h3", "2026-08-15T11:05:00", "Lena Hoffmann", "Approved", "Within the Facilities furniture budget."),
      ],
    },
    {
      id: "PR-8002",
      description: "Laptops for the September new-hire intake",
      costCenterId: "CC-1300",
      materialGroup: "IT hardware",
      items: [item("PR-8002-1", "14-inch business laptop", 6, 1290, "2026-09-30"), item("PR-8002-2", "Laptop docking station", 6, 210, "2026-09-30")],
      justification: "Six engineers start on 1 October and need standard laptops on day one. The configuration matches the IT hardware catalogue for engineering roles.",
      notSplit: true,
      status: "Approved",
      requestedBy: "Tomasz Nowak",
      createdAt: "2026-08-20",
      submittedAt: "2026-08-20",
      history: [
        event("PR-8002-h1", "2026-08-20T14:02:00", "Tomasz Nowak", "Created"),
        event("PR-8002-h2", "2026-08-20T14:30:00", "Tomasz Nowak", "Submitted"),
        event("PR-8002-h3", "2026-08-21T08:55:00", "Lena Hoffmann", "Approved"),
      ],
    },
    {
      id: "PR-8003",
      description: "Design suite licences for the product team",
      costCenterId: "CC-1600",
      materialGroup: "Software",
      items: [item("PR-8003-1", "Design suite annual licence", 5, 720, "2026-10-01")],
      justification: "Five product designers need the design suite for the new mobile app. The licences replace expiring individual subscriptions.",
      notSplit: true,
      status: "Submitted",
      requestedBy: "Mei Lin",
      createdAt: "2026-09-10",
      submittedAt: "2026-09-10",
      history: [event("PR-8003-h1", "2026-09-10T10:15:00", "Mei Lin", "Created"), event("PR-8003-h2", "2026-09-10T10:41:00", "Mei Lin", "Submitted")],
    },
    {
      id: "PR-8004",
      description: "Printer toner and copy paper, Q4",
      costCenterId: "CC-1700",
      materialGroup: "Consumables",
      items: [item("PR-8004-1", "Toner cartridge, black", 20, 68, "2026-09-29"), item("PR-8004-2", "Copy paper A4 (box of 5 reams)", 40, 24, "2026-09-29")],
      justification: "Quarterly replenishment for the support floor printers. Quantities follow the consumption of the last two quarters.",
      notSplit: true,
      status: "Submitted",
      requestedBy: "Ola Bergström",
      createdAt: "2026-09-12",
      submittedAt: "2026-09-12",
      history: [event("PR-8004-h1", "2026-09-12T08:20:00", "Ola Bergström", "Created"), event("PR-8004-h2", "2026-09-12T08:35:00", "Ola Bergström", "Submitted")],
    },
    {
      id: "PR-8005",
      description: "Whiteboards for the meeting rooms",
      costCenterId: "CC-1200",
      materialGroup: "Office equipment",
      items: [item("PR-8005-1", "Magnetic whiteboard 180 × 120 cm", 4, 240, "2026-09-22")],
      justification: "Four meeting rooms on the second floor have no whiteboards.",
      notSplit: true,
      status: "Returned",
      requestedBy: "Jonas Weber",
      createdAt: "2026-09-15",
      submittedAt: "2026-09-15",
      history: [
        event("PR-8005-h1", "2026-09-15T13:05:00", "Jonas Weber", "Created"),
        event("PR-8005-h2", "2026-09-15T13:22:00", "Jonas Weber", "Submitted"),
        event("PR-8005-h3", "2026-09-16T09:10:00", "Lena Hoffmann", "Returned", "The requested delivery date is less than 10 days out and the justification is a single sentence. Please revise and resubmit."),
      ],
    },
    {
      id: "PR-8006",
      description: "Core network switch replacement",
      costCenterId: "CC-1300",
      materialGroup: "IT hardware",
      items: [item("PR-8006-1", "48-port managed switch", 2, 2450, "2026-10-15")],
      justification: "The two core switches in the Berlin server room reach end of support in November. Replacing them now avoids running unsupported firmware.",
      notSplit: true,
      status: "Approved",
      requestedBy: "Tomasz Nowak",
      createdAt: "2026-08-28",
      submittedAt: "2026-08-28",
      history: [
        event("PR-8006-h1", "2026-08-28T11:00:00", "Tomasz Nowak", "Created"),
        event("PR-8006-h2", "2026-08-28T11:25:00", "Tomasz Nowak", "Submitted"),
        event("PR-8006-h3", "2026-08-29T15:40:00", "Lena Hoffmann", "Approved", "Approved against the infrastructure refresh budget."),
      ],
    },
    {
      id: "PR-8007",
      description: "Trade fair booth services, November",
      costCenterId: "CC-1400",
      materialGroup: "Services",
      items: [item("PR-8007-1", "Booth construction and dismantling", 1, 8900, "2026-11-03")],
      justification: "Marketing exhibits at the regional industry fair in November. The booth service covers construction, furniture rental and dismantling.",
      notSplit: true,
      status: "Submitted",
      requestedBy: "Sofia Marin",
      createdAt: "2026-09-16",
      submittedAt: "2026-09-16",
      history: [event("PR-8007-h1", "2026-09-16T16:02:00", "Sofia Marin", "Created"), event("PR-8007-h2", "2026-09-16T16:18:00", "Sofia Marin", "Submitted")],
    },
    {
      id: "PR-8008",
      description: "Monitors for the sales floor",
      costCenterId: "CC-1500",
      materialGroup: "IT hardware",
      items: [item("PR-8008-1", "27-inch monitor", 10, 310, "2026-10-08")],
      justification: "",
      notSplit: false,
      status: "Draft",
      requestedBy: "Daniel Brecht",
      createdAt: "2026-09-17",
      submittedAt: "",
      history: [event("PR-8008-h1", "2026-09-17T09:48:00", "Daniel Brecht", "Created")],
    },
    {
      id: "PR-8009",
      description: "Recruiting event catering",
      costCenterId: "CC-1100",
      materialGroup: "Services",
      items: [item("PR-8009-1", "Catering for 60 guests", 1, 1800, "2026-10-10")],
      justification: "Catering for the October recruiting evening.",
      notSplit: true,
      status: "Returned",
      requestedBy: "Amira Saleh",
      createdAt: "2026-09-11",
      submittedAt: "2026-09-11",
      history: [
        event("PR-8009-h1", "2026-09-11T10:30:00", "Amira Saleh", "Created"),
        event("PR-8009-h2", "2026-09-11T10:44:00", "Amira Saleh", "Submitted"),
        event("PR-8009-h3", "2026-09-12T12:05:00", "Lena Hoffmann", "Returned", "Please add a business justification of at least two sentences explaining why external catering is needed."),
      ],
    },
    {
      id: "PR-8010",
      description: "Office desks for the finance team",
      costCenterId: "CC-1000",
      materialGroup: "Office equipment",
      items: [item("PR-8010-1", "Standard office desk 140 cm", 5, 420, "2026-10-20")],
      justification: "Finance moves to the third floor in October and the new area has no desks. Five desks match the headcount of the team.",
      notSplit: true,
      status: "Approved",
      requestedBy: "Katrin Vogel",
      createdAt: "2026-09-02",
      submittedAt: "2026-09-02",
      history: [
        event("PR-8010-h1", "2026-09-02T08:05:00", "Katrin Vogel", "Created"),
        event("PR-8010-h2", "2026-09-02T08:12:00", "Katrin Vogel", "Submitted"),
        event("PR-8010-h3", "2026-09-03T10:20:00", "Lena Hoffmann", "Approved"),
      ],
    },
    {
      id: "PR-8011",
      description: "Cleaning supplies, Q4",
      costCenterId: "CC-1200",
      materialGroup: "Consumables",
      items: [item("PR-8011-1", "Surface cleaner (case of 12)", 15, 32, "2026-10-01"), item("PR-8011-2", "Paper towels (case of 24)", 25, 19, "2026-10-01")],
      justification: "Quarterly replenishment for all three offices. Quantities are based on the facility management consumption report.",
      notSplit: true,
      status: "Submitted",
      requestedBy: "Jonas Weber",
      createdAt: "2026-09-18",
      submittedAt: "2026-09-18",
      history: [event("PR-8011-h1", "2026-09-18T07:55:00", "Jonas Weber", "Created"), event("PR-8011-h2", "2026-09-18T08:10:00", "Jonas Weber", "Submitted")],
    },
    {
      id: "PR-8012",
      description: "Project management tool, team licences",
      costCenterId: "CC-1300",
      materialGroup: "Software",
      items: [item("PR-8012-1", "Project tool team licence (annual)", 25, 96, "2026-10-05")],
      justification: "The delivery teams standardise on one project tool.",
      notSplit: false,
      status: "Draft",
      requestedBy: "Lena Hoffmann",
      createdAt: "2026-09-18",
      submittedAt: "",
      history: [event("PR-8012-h1", "2026-09-18T15:30:00", "Lena Hoffmann", "Created")],
    },
  ];

  return { version: DB_VERSION, costCenters, suppliers, requisitions };
}

// ───────────────────────────── Store ─────────────────────────────

const listeners = new Set<() => void>();
let cache: AtlasDb | null = null;

function isDb(value: unknown): value is AtlasDb {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AtlasDb>;
  return v.version === DB_VERSION && Array.isArray(v.costCenters) && Array.isArray(v.suppliers) && Array.isArray(v.requisitions);
}

function persist(db: AtlasDb): void {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage unavailable; the in-memory copy still works for this session.
  }
}

function load(): AtlasDb {
  if (cache) return cache;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isDb(parsed)) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // Corrupt or unreadable; fall through to reseed.
    }
  }
  cache = createSeed();
  if (typeof window !== "undefined") persist(cache);
  return cache;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function commit(next: AtlasDb): void {
  cache = next;
  persist(next);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DB_KEY || event.key === null) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): AtlasDb | null {
  return null;
}

/** Live database. Returns null on the server and during hydration. */
export function useDb(): AtlasDb | null {
  return useSyncExternalStore(subscribe, load, getServerSnapshot);
}

export function getDb(): AtlasDb {
  return load();
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 19);
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextId(prefix: string, existing: { id: string }[], start: number): string {
  const max = existing.reduce((acc, entry) => {
    const n = Number(entry.id.replace(`${prefix}-`, ""));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, start - 1);
  return `${prefix}-${max + 1}`;
}

function nextEventId(requisition: Requisition): string {
  return `${requisition.id}-h${requisition.history.length + 1}`;
}

// ───────────────────────────── Mutations ─────────────────────────────

export interface NewRequisitionInput {
  description: string;
  costCenterId: string;
  materialGroup: MaterialGroup | "";
  items: Omit<RequisitionItem, "id">[];
  justification: string;
  notSplit: boolean;
}

/** Creates a requisition and submits it for approval (ids continue from PR-8013). */
export function createRequisition(input: NewRequisitionInput): Requisition {
  const db = load();
  const id = nextId("PR", db.requisitions, 8001);
  const at = nowIso();
  const requisition: Requisition = {
    id,
    description: input.description,
    costCenterId: input.costCenterId,
    materialGroup: input.materialGroup,
    items: input.items.map((entry, index) => ({ ...entry, id: `${id}-${index + 1}` })),
    justification: input.justification,
    notSplit: input.notSplit,
    status: "Submitted",
    requestedBy: CURRENT_USER.name,
    createdAt: todayIso(),
    submittedAt: todayIso(),
    history: [event(`${id}-h1`, at, CURRENT_USER.name, "Created"), event(`${id}-h2`, at, CURRENT_USER.name, "Submitted")],
  };
  commit({ ...db, requisitions: [...db.requisitions, requisition] });
  return requisition;
}

function transition(id: string, status: RequisitionStatus, action: ApprovalAction, comment: string): void {
  const db = load();
  const current = db.requisitions.find((r) => r.id === id);
  if (!current) return;
  const next: Requisition = {
    ...current,
    status,
    submittedAt: status === "Submitted" ? todayIso() : current.submittedAt,
    history: [...current.history, event(nextEventId(current), nowIso(), CURRENT_USER.name, action, comment)],
  };
  commit({ ...db, requisitions: db.requisitions.map((r) => (r.id === id ? next : r)) });
}

export function submitRequisition(id: string): void {
  const db = load();
  const current = db.requisitions.find((r) => r.id === id);
  if (!current || current.status === "Submitted" || current.status === "Approved") return;
  transition(id, "Submitted", current.status === "Returned" ? "Resubmitted" : "Submitted", "");
}

export function approveRequisition(id: string, comment = ""): void {
  const current = load().requisitions.find((r) => r.id === id);
  if (!current || current.status !== "Submitted") return;
  transition(id, "Approved", "Approved", comment.trim());
}

export function returnRequisition(id: string, comment: string): void {
  const current = load().requisitions.find((r) => r.id === id);
  if (!current || current.status !== "Submitted") return;
  transition(id, "Returned", "Returned", comment.trim());
}

export function updateSupplierPaymentTerms(id: string, paymentTerms: PaymentTerms, reason: string): void {
  const db = load();
  const supplier = db.suppliers.find((s) => s.id === id);
  if (!supplier) return;
  const change: SupplierChange = {
    id: `${id}-c${supplier.changes.length + 1}`,
    at: nowIso(),
    actor: CURRENT_USER.name,
    field: "Payment terms",
    from: supplier.paymentTerms,
    to: paymentTerms,
    reason: reason.trim(),
  };
  commit({
    ...db,
    suppliers: db.suppliers.map((s) => (s.id === id ? { ...s, paymentTerms, changes: [...s.changes, change] } : s)),
  });
}

export function resetDb(): void {
  commit(createSeed());
}

// ───────────────────────────── Selectors ─────────────────────────────

export function getRequisition(db: AtlasDb, id: string): Requisition | undefined {
  return db.requisitions.find((r) => r.id === id);
}

export function getSupplier(db: AtlasDb, id: string): Supplier | undefined {
  return db.suppliers.find((s) => s.id === id);
}

export function getCostCenter(db: AtlasDb, id: string): CostCenter | undefined {
  return db.costCenters.find((c) => c.id === id);
}

/** "CC-1200 Facilities" — the value-help display text of a cost center. */
export function costCenterLabel(costCenter: CostCenter | undefined, fallback = ""): string {
  return costCenter ? `${costCenter.id} ${costCenter.name}` : fallback;
}

export function requisitionTotal(requisition: { items: { quantity: number; unitPrice: number }[] }): number {
  return requisition.items.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0);
}

export function committedForCostCenter(db: AtlasDb, costCenterId: string): number {
  return db.requisitions
    .filter((r) => r.costCenterId === costCenterId && (r.status === "Approved" || r.status === "Submitted"))
    .reduce((sum, r) => sum + requisitionTotal(r), 0);
}

export function sortByCreated<T extends { createdAt: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
}

// ───────────────────────────── Formatting / validation ─────────────────────────────

const currency = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

/** Dates are stored and shown as ISO YYYY-MM-DD. */
export function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "—";
}

export function formatDateTime(value: string): string {
  if (!value) return "—";
  const [date, time] = value.split("T");
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Whole days from today (local) to an ISO date; NaN when the value is not a date. */
export function daysFromToday(value: string): number {
  if (!isIsoDate(value)) return Number.NaN;
  const [y, m, d] = value.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Number of sentences, counted by terminators (. ! ?) followed by a space or the end of the text. */
export function countSentences(text: string): number {
  return (text.trim().match(/[.!?]+(\s|$)/g) ?? []).length;
}
