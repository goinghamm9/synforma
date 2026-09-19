"use client";
/**
 * Ledgerline Billing data store.
 *
 * A tiny typed document store persisted to localStorage under
 * `ledgerline-billing-db`. Seeded on first load. Components subscribe through
 * `useDb()` (a useSyncExternalStore hook) so every page re-renders when data
 * changes. On the server (and during hydration) `useDb()` returns null so
 * pages can render a loading skeleton and avoid hydration mismatches.
 */
import { useSyncExternalStore } from "react";

export const DB_KEY = "ledgerline-billing-db";
const DB_VERSION = 1;

// ───────────────────────────── Types ─────────────────────────────

export const PAYMENT_STATUSES = ["Succeeded", "Failed", "Refunded", "Partially refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DISPUTE_STATUSES = ["Open", "Under review", "Resolved"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const REFUND_REASONS = ["Duplicate", "Fraudulent", "Requested by customer"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const INVOICE_STATUSES = ["Draft", "Open", "Past due", "Paid", "Void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["Active", "Paused", "Canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAUSE_REASONS = ["Customer request", "Payment issue", "Seasonal business", "Other"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export const PAID_REASONS = ["Paid by bank transfer", "Paid by check", "Paid in cash", "Settled outside the system"] as const;
export type PaidReason = (typeof PAID_REASONS)[number];

/** The signed-in demo user. */
export const CURRENT_USER = { name: "Dana Whitfield", role: "Support agent", initials: "DW" } as const;

export interface Subscription {
  plan: string;
  amount: number;
  interval: "Monthly" | "Yearly";
  status: SubscriptionStatus;
  startedAt: string;
  nextInvoiceAt: string;
  pausedAt: string | null;
  pauseReason: string;
  pauseNote: string;
}

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  email: string;
  country: string;
  createdAt: string;
  paymentMethod: string;
  subscription: Subscription;
}

export interface Dispute {
  id: string;
  reason: string;
  status: DisputeStatus;
  openedAt: string;
  respondBy: string;
  amount: number;
  caseReference: string;
}

export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  currency: "USD";
  status: PaymentStatus;
  description: string;
  method: string;
  createdAt: string;
  invoiceId: string | null;
  refundedAmount: number;
  failureReason: string;
  dispute: Dispute | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmount: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  amount: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  paymentId: string | null;
  memo: string;
  lines: InvoiceLine[];
  paidReason: string;
  paidReference: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  customerId: string;
  amount: number;
  reason: RefundReason;
  customerNote: string;
  caseReference: string;
  /** Dispute status recorded with the refund ("No dispute" when the payment had none). */
  disputeStatus: string;
  status: "Succeeded";
  createdAt: string;
  createdBy: string;
}

export interface BillingEvent {
  id: string;
  at: string;
  text: string;
  actor: string;
  paymentId?: string;
  customerId?: string;
  invoiceId?: string;
  refundId?: string;
}

export interface BillingDb {
  version: number;
  customers: Customer[];
  payments: Payment[];
  invoices: Invoice[];
  refunds: Refund[];
  events: BillingEvent[];
}

// ───────────────────────────── Dates ─────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local time as `YYYY-MM-DDTHH:MM:SS` (no zone), the format every timestamp uses. */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shifted(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return localIso(d);
}

/** Seed helper: a timestamp `days` days ago at the given local time. */
function ago(days: number, hour = 10, minute = 0): string {
  return shifted(-days, hour, minute);
}

/** Seed helper: a timestamp `days` days ahead. */
function ahead(days: number, hour = 17, minute = 0): string {
  return shifted(days, hour, minute);
}

function nowIso(): string {
  return localIso(new Date());
}

/** A stored timestamp shifted by a number of minutes. */
function minutesAfter(value: string, minutes: number): string {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() + minutes);
  return localIso(d);
}

/** Whole days elapsed since a stored timestamp. */
export function daysSince(value: string): number {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

// ───────────────────────────── Seed ─────────────────────────────

function sub(plan: string, amount: number, status: SubscriptionStatus, startedDaysAgo: number, nextInDays: number): Subscription {
  return {
    plan,
    amount,
    interval: "Monthly",
    status,
    startedAt: ago(startedDaysAgo, 9, 30),
    nextInvoiceAt: ahead(nextInDays, 9, 0),
    pausedAt: null,
    pauseReason: "",
    pauseNote: "",
  };
}

type PaymentSeed = [
  id: string,
  customerId: string,
  amount: number,
  status: PaymentStatus,
  description: string,
  method: string,
  daysAgo: number,
  invoiceId: string | null,
  refundedAmount: number,
  failureReason: string,
  dispute: Dispute | null,
];

type InvoiceSeed = [
  id: string,
  customerId: string,
  amount: number,
  status: InvoiceStatus,
  issuedDaysAgo: number,
  dueOffsetDays: number,
  paymentId: string | null,
  memo: string,
  lines: InvoiceLine[],
];

function createSeed(): BillingDb {
  const customers: Customer[] = [
    { id: "CUS-1001", name: "Harlow & Finch Studio", contactName: "Mara Ellison", email: "mara@harlowfinch.example", country: "United States", createdAt: ago(212, 11, 20), paymentMethod: "Card ending 4242", subscription: sub("Team", 480, "Active", 212, 13) },
    { id: "CUS-1002", name: "Northbeam Analytics", contactName: "Jonas Weir", email: "jonas.weir@northbeam.example", country: "Canada", createdAt: ago(340, 15, 5), paymentMethod: "Card ending 1881", subscription: sub("Business", 349, "Active", 340, 27) },
    { id: "CUS-1003", name: "Quill Street Press", contactName: "Priya Anand", email: "priya@quillstreet.example", country: "United Kingdom", createdAt: ago(98, 9, 45), paymentMethod: "Card ending 7730", subscription: sub("Starter", 29, "Active", 98, 20) },
    { id: "CUS-1004", name: "Tessellate Design Co.", contactName: "Ben Okoro", email: "ben@tessellate.example", country: "United States", createdAt: ago(150, 13, 10), paymentMethod: "Card ending 0094", subscription: sub("Business", 349, "Active", 150, 18) },
    { id: "CUS-1005", name: "Redwood Tutoring", contactName: "Alice Moreau", email: "alice.moreau@redwoodtutoring.example", country: "France", createdAt: ago(64, 16, 30), paymentMethod: "Card ending 5518", subscription: sub("Team", 120, "Active", 64, 25) },
    { id: "CUS-1006", name: "Saltmarsh Outfitters", contactName: "Diego Ferrer", email: "diego@saltmarsh.example", country: "Spain", createdAt: ago(400, 10, 0), paymentMethod: "Bank transfer", subscription: sub("Enterprise", 1200, "Active", 400, 22) },
    { id: "CUS-1007", name: "Bramble Bakehouse", contactName: "Hannah Lund", email: "hannah@bramblebakehouse.example", country: "Denmark", createdAt: ago(122, 8, 15), paymentMethod: "Card ending 3306", subscription: sub("Starter", 29, "Active", 122, 2) },
    { id: "CUS-1008", name: "Orbit Fitness Collective", contactName: "Kwame Mensah", email: "kwame@orbitfitness.example", country: "United States", createdAt: ago(260, 12, 40), paymentMethod: "Card ending 9127", subscription: sub("Business", 349, "Active", 260, 10) },
    { id: "CUS-1009", name: "Larkspur Legal", contactName: "Sofia Castellano", email: "sofia@larkspurlegal.example", country: "Italy", createdAt: ago(190, 14, 0), paymentMethod: "Card ending 6674", subscription: sub("Team", 240, "Active", 190, 5) },
    { id: "CUS-1010", name: "Meadowline Farms", contactName: "Tom Rasmussen", email: "tom@meadowline.example", country: "United States", createdAt: ago(80, 9, 0), paymentMethod: "Card ending 2210", subscription: sub("Team", 120, "Active", 80, 29) },
  ];

  const dispute = (id: string, reason: string, status: DisputeStatus, openedDaysAgo: number, amount: number, caseReference = ""): Dispute => ({
    id,
    reason,
    status,
    openedAt: ago(openedDaysAgo, 14, 20),
    respondBy: ahead(Math.max(2, 21 - openedDaysAgo), 23, 59),
    amount,
    caseReference,
  });

  const paymentSeeds: PaymentSeed[] = [
    ["PAY-3001", "CUS-1001", 480, "Succeeded", "Team plan — 4 seats", "Card ending 4242", 17, "INV-7001", 0, "", dispute("DP-9001", "Unrecognized charge", "Open", 6, 480)],
    ["PAY-3002", "CUS-1002", 349, "Succeeded", "Business plan — monthly", "Card ending 1881", 3, "INV-7002", 0, "", null],
    ["PAY-3003", "CUS-1003", 29, "Refunded", "Starter plan — monthly", "Card ending 7730", 40, "INV-7003", 29, "", dispute("DP-8994", "Duplicate charge", "Resolved", 36, 29, "CS-4102")],
    ["PAY-3004", "CUS-1004", 480, "Succeeded", "Onboarding workshop", "Card ending 0094", 12, "INV-7004", 0, "", dispute("DP-9002", "Product not as described", "Open", 4, 480)],
    ["PAY-3005", "CUS-1005", 120, "Succeeded", "Team plan — monthly", "Card ending 5518", 5, "INV-7008", 0, "", null],
    ["PAY-3006", "CUS-1006", 1200, "Succeeded", "Enterprise plan — monthly", "Bank transfer", 8, "INV-7006", 0, "", null],
    ["PAY-3007", "CUS-1007", 29, "Failed", "Starter plan — monthly", "Card ending 3306", 2, "INV-7007", 0, "Card declined by the issuer", null],
    ["PAY-3008", "CUS-1008", 349, "Succeeded", "Business plan — monthly", "Card ending 9127", 20, "INV-7009", 0, "", null],
    ["PAY-3009", "CUS-1009", 240, "Succeeded", "Team plan — 2 seats", "Card ending 6674", 25, "INV-7010", 0, "", dispute("DP-9000", "Credit not processed", "Under review", 11, 240)],
    ["PAY-3010", "CUS-1010", 120, "Succeeded", "Team plan — monthly", "Card ending 2210", 30, "INV-7011", 0, "", null],
    ["PAY-3011", "CUS-1001", 480, "Succeeded", "Team plan — 4 seats", "Card ending 4242", 47, "INV-7012", 0, "", null],
    ["PAY-3012", "CUS-1002", 349, "Partially refunded", "Business plan — monthly", "Card ending 1881", 33, "INV-7013", 100, "", null],
    ["PAY-3013", "CUS-1005", 58, "Succeeded", "Additional seats", "Card ending 5518", 9, "INV-7014", 0, "", dispute("DP-9003", "Duplicate charge", "Open", 3, 58)],
    ["PAY-3014", "CUS-1008", 349, "Succeeded", "Business plan — monthly", "Card ending 9127", 50, "INV-7015", 0, "", null],
    ["PAY-3015", "CUS-1003", 29, "Succeeded", "Starter plan — monthly", "Card ending 7730", 10, "INV-7016", 0, "", null],
    ["PAY-3016", "CUS-1006", 1200, "Succeeded", "Enterprise plan — monthly", "Bank transfer", 38, "INV-7017", 0, "", null],
    ["PAY-3017", "CUS-1009", 240, "Succeeded", "Team plan — 2 seats", "Card ending 6674", 104, "INV-7018", 0, "", dispute("DP-8990", "Unrecognized charge", "Open", 9, 240)],
    ["PAY-3018", "CUS-1004", 349, "Refunded", "Business plan — monthly", "Card ending 0094", 61, "INV-7019", 349, "", null],
    ["PAY-3019", "CUS-1007", 29, "Succeeded", "Starter plan — monthly", "Card ending 3306", 32, "INV-7020", 0, "", null],
    ["PAY-3020", "CUS-1010", 120, "Succeeded", "Team plan — monthly", "Card ending 2210", 1, "INV-7021", 0, "", null],
  ];

  const payments: Payment[] = paymentSeeds.map(([id, customerId, amount, status, description, method, daysAgo, invoiceId, refundedAmount, failureReason, disputeRecord]) => ({
    id,
    customerId,
    amount,
    currency: "USD",
    status,
    description,
    method,
    createdAt: ago(daysAgo, 9 + (Number(id.slice(-2)) % 8), (Number(id.slice(-2)) * 7) % 60),
    invoiceId,
    refundedAmount,
    failureReason,
    dispute: disputeRecord,
  }));

  const line = (description: string, quantity: number, unitAmount: number): InvoiceLine => ({ description, quantity, unitAmount });
  const planLine = (plan: string, amount: number) => [line(`${plan} plan — monthly subscription`, 1, amount)];

  const invoiceSeeds: InvoiceSeed[] = [
    ["INV-7001", "CUS-1001", 480, "Paid", 17, 0, "PAY-3001", "Team plan — 4 seats", [line("Team plan — monthly subscription", 4, 120)]],
    ["INV-7002", "CUS-1002", 349, "Paid", 3, 0, "PAY-3002", "Business plan — monthly", planLine("Business", 349)],
    ["INV-7003", "CUS-1003", 29, "Paid", 40, 0, "PAY-3003", "Starter plan — monthly", planLine("Starter", 29)],
    ["INV-7004", "CUS-1004", 480, "Paid", 12, 0, "PAY-3004", "Onboarding workshop", [line("Onboarding workshop (half day)", 1, 480)]],
    ["INV-7005", "CUS-1005", 240, "Open", 6, 24, null, "Training session — September", [line("Remote training session", 2, 120)]],
    ["INV-7006", "CUS-1006", 1200, "Paid", 8, 0, "PAY-3006", "Enterprise plan — monthly", planLine("Enterprise", 1200)],
    ["INV-7007", "CUS-1007", 29, "Past due", 2, -1, null, "Starter plan — monthly", planLine("Starter", 29)],
    ["INV-7008", "CUS-1005", 120, "Paid", 5, 0, "PAY-3005", "Team plan — monthly", planLine("Team", 120)],
    ["INV-7009", "CUS-1008", 349, "Paid", 20, 0, "PAY-3008", "Business plan — monthly", planLine("Business", 349)],
    ["INV-7010", "CUS-1009", 240, "Paid", 25, 0, "PAY-3009", "Team plan — 2 seats", [line("Team plan — monthly subscription", 2, 120)]],
    ["INV-7011", "CUS-1010", 120, "Paid", 30, 0, "PAY-3010", "Team plan — monthly", planLine("Team", 120)],
    ["INV-7012", "CUS-1001", 480, "Paid", 47, 0, "PAY-3011", "Team plan — 4 seats", [line("Team plan — monthly subscription", 4, 120)]],
    ["INV-7013", "CUS-1002", 349, "Paid", 33, 0, "PAY-3012", "Business plan — monthly", planLine("Business", 349)],
    ["INV-7014", "CUS-1005", 58, "Paid", 9, 0, "PAY-3013", "Additional seats", [line("Additional seat", 2, 29)]],
    ["INV-7015", "CUS-1008", 349, "Paid", 50, 0, "PAY-3014", "Business plan — monthly", planLine("Business", 349)],
    ["INV-7016", "CUS-1003", 29, "Paid", 10, 0, "PAY-3015", "Starter plan — monthly", planLine("Starter", 29)],
    ["INV-7017", "CUS-1006", 1200, "Paid", 38, 0, "PAY-3016", "Enterprise plan — monthly", planLine("Enterprise", 1200)],
    ["INV-7018", "CUS-1009", 240, "Paid", 104, 0, "PAY-3017", "Team plan — 2 seats", [line("Team plan — monthly subscription", 2, 120)]],
    ["INV-7019", "CUS-1004", 349, "Paid", 61, 0, "PAY-3018", "Business plan — monthly", planLine("Business", 349)],
    ["INV-7020", "CUS-1007", 29, "Paid", 32, 0, "PAY-3019", "Starter plan — monthly", planLine("Starter", 29)],
    ["INV-7021", "CUS-1010", 120, "Paid", 1, 0, "PAY-3020", "Team plan — monthly", planLine("Team", 120)],
    ["INV-7022", "CUS-1006", 2400, "Open", 4, 26, null, "Implementation services — phase 2", [line("Implementation consulting (day)", 3, 800)]],
    ["INV-7023", "CUS-1008", 90, "Open", 3, 27, null, "Branded merchandise", [line("Branded water bottle", 30, 3)]],
    ["INV-7024", "CUS-1002", 349, "Draft", 0, 30, null, "Business plan — next month", planLine("Business", 349)],
    ["INV-7025", "CUS-1009", 480, "Past due", 35, -5, null, "Document review add-on", [line("Document review add-on", 4, 120)]],
    ["INV-7026", "CUS-1004", 150, "Void", 45, 30, null, "Duplicate of INV-7019", [line("Business plan — monthly subscription", 1, 150)]],
    ["INV-7027", "CUS-1001", 60, "Open", 2, 28, null, "Storage add-on", [line("Additional storage (100 GB)", 2, 30)]],
    ["INV-7028", "CUS-1010", 120, "Draft", 0, 30, null, "Team plan — next month", planLine("Team", 120)],
    ["INV-7029", "CUS-1003", 75, "Open", 7, 23, null, "Custom domain setup", [line("Custom domain setup", 1, 75)]],
    ["INV-7030", "CUS-1007", 29, "Draft", 0, 30, null, "Starter plan — next month", planLine("Starter", 29)],
  ];

  const invoices: Invoice[] = invoiceSeeds.map(([id, customerId, amount, status, issuedDaysAgo, dueOffsetDays, paymentId, memo, lines]) => ({
    id,
    customerId,
    amount,
    status,
    issuedAt: ago(issuedDaysAgo, 8, 0),
    dueAt: dueOffsetDays >= 0 ? ahead(dueOffsetDays, 23, 59) : ago(-dueOffsetDays, 23, 59),
    paidAt: status === "Paid" ? ago(issuedDaysAgo, 9, 12) : null,
    paymentId,
    memo,
    lines,
    paidReason: "",
    paidReference: "",
  }));

  const refunds: Refund[] = [
    {
      id: "RF-4998",
      paymentId: "PAY-3003",
      customerId: "CUS-1003",
      amount: 29,
      reason: "Duplicate",
      customerNote: "This charge was taken twice in error. We have refunded the duplicate in full.",
      caseReference: "CS-4102",
      disputeStatus: "Resolved",
      status: "Succeeded",
      createdAt: ago(35, 11, 5),
      createdBy: "Dana Whitfield",
    },
    {
      id: "RF-4999",
      paymentId: "PAY-3012",
      customerId: "CUS-1002",
      amount: 100,
      reason: "Requested by customer",
      customerNote: "As agreed, we have refunded the unused seats for this billing period.",
      caseReference: "CS-4210",
      disputeStatus: "No dispute",
      status: "Succeeded",
      createdAt: ago(28, 15, 40),
      createdBy: "Ravi Chandran",
    },
    {
      id: "RF-5000",
      paymentId: "PAY-3018",
      customerId: "CUS-1004",
      amount: 349,
      reason: "Fraudulent",
      customerNote: "We have refunded this charge after reviewing the account activity you reported.",
      caseReference: "CS-4388",
      disputeStatus: "No dispute",
      status: "Succeeded",
      createdAt: ago(58, 9, 50),
      createdBy: "Dana Whitfield",
    },
  ];

  const events: BillingEvent[] = [];
  let eventSeq = 1;
  const push = (at: string, text: string, actor: string, refs: Omit<BillingEvent, "id" | "at" | "text" | "actor">) => {
    events.push({ id: `EVT-${eventSeq++}`, at, text, actor, ...refs });
  };

  for (const payment of payments) {
    const customer = customers.find((c) => c.id === payment.customerId);
    if (payment.status === "Failed") {
      push(payment.createdAt, `Payment attempt failed: ${payment.failureReason}`, "System", { paymentId: payment.id, customerId: payment.customerId });
    } else {
      push(payment.createdAt, `Payment of ${formatMoney(payment.amount)} succeeded (${payment.method})`, "System", { paymentId: payment.id, customerId: payment.customerId });
      push(minutesAfter(payment.createdAt, 1), `Receipt emailed to ${customer ? customer.email : payment.customerId}`, "System", { paymentId: payment.id, customerId: payment.customerId });
    }
    if (payment.dispute) {
      push(payment.dispute.openedAt, `Dispute ${payment.dispute.id} opened by the cardholder's bank — ${payment.dispute.reason}`, "System", { paymentId: payment.id, customerId: payment.customerId });
      if (payment.dispute.status === "Under review") {
        push(payment.dispute.openedAt.replace(/T.*/, "T16:05:00"), "Evidence submitted; the bank is reviewing the case", "Ravi Chandran", { paymentId: payment.id, customerId: payment.customerId });
      }
    }
  }
  for (const refund of refunds) {
    push(refund.createdAt, `Refund ${refund.id} of ${formatMoney(refund.amount)} issued — ${refund.reason}`, refund.createdBy, { paymentId: refund.paymentId, customerId: refund.customerId, refundId: refund.id });
    if (refund.disputeStatus === "Resolved") {
      push(refund.createdAt, "Dispute status changed from Open to Resolved", refund.createdBy, { paymentId: refund.paymentId, customerId: refund.customerId, refundId: refund.id });
    }
  }
  for (const invoice of invoices) {
    if (invoice.status === "Draft") continue;
    push(invoice.issuedAt, `Invoice ${invoice.id} for ${formatMoney(invoice.amount)} sent`, "System", { invoiceId: invoice.id, customerId: invoice.customerId });
    if (invoice.status === "Paid" && invoice.paidAt) {
      push(invoice.paidAt, `Invoice ${invoice.id} paid${invoice.paymentId ? ` by ${invoice.paymentId}` : ""}`, "System", { invoiceId: invoice.id, customerId: invoice.customerId });
    }
    if (invoice.status === "Past due") {
      push(invoice.dueAt, `Invoice ${invoice.id} is past due; reminder emailed`, "System", { invoiceId: invoice.id, customerId: invoice.customerId });
    }
  }
  for (const customer of customers) {
    push(customer.createdAt, `Customer created and subscribed to the ${customer.subscription.plan} plan`, "System", { customerId: customer.id });
  }

  return { version: DB_VERSION, customers, payments, invoices, refunds, events };
}

// ───────────────────────────── Store ─────────────────────────────

const listeners = new Set<() => void>();
let cache: BillingDb | null = null;

function isDb(value: unknown): value is BillingDb {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BillingDb>;
  return (
    v.version === DB_VERSION &&
    Array.isArray(v.customers) &&
    Array.isArray(v.payments) &&
    Array.isArray(v.invoices) &&
    Array.isArray(v.refunds) &&
    Array.isArray(v.events)
  );
}

function persist(db: BillingDb): void {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage unavailable; the in-memory copy still works for this session.
  }
}

function load(): BillingDb {
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

function commit(next: BillingDb): void {
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

function getServerSnapshot(): BillingDb | null {
  return null;
}

/** Live database. Returns null on the server and during hydration. */
export function useDb(): BillingDb | null {
  return useSyncExternalStore(subscribe, load, getServerSnapshot);
}

export function getDb(): BillingDb {
  return load();
}

function nextId(prefix: string, existing: { id: string }[], start: number): string {
  const max = existing.reduce((acc, item) => {
    const n = Number(item.id.replace(`${prefix}-`, ""));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, start - 1);
  return `${prefix}-${max + 1}`;
}

function makeEvent(db: BillingDb, text: string, refs: Omit<BillingEvent, "id" | "at" | "text" | "actor">, offset = 0): BillingEvent {
  const id = `EVT-${db.events.length + 1 + offset}`;
  return { id, at: nowIso(), text, actor: CURRENT_USER.name, ...refs };
}

// ───────────────────────────── Mutations ─────────────────────────────

export interface NewRefundInput {
  paymentId: string;
  amount: number;
  reason: RefundReason;
  customerNote: string;
  caseReference: string;
  /** Status to record on the payment's dispute; ignored when the payment has no dispute. */
  disputeStatus: DisputeStatus;
}

/** Issues a refund: creates the refund record (RF-5001 upward), updates the payment and its dispute, logs events. */
export function createRefund(input: NewRefundInput): Refund {
  const db = load();
  const payment = db.payments.find((p) => p.id === input.paymentId);
  if (!payment) throw new Error(`Unknown payment ${input.paymentId}`);
  const id = nextId("RF", db.refunds, 5001);
  const amount = Math.round(input.amount * 100) / 100;
  const hadDispute = payment.dispute !== null;
  const refund: Refund = {
    id,
    paymentId: payment.id,
    customerId: payment.customerId,
    amount,
    reason: input.reason,
    customerNote: input.customerNote.trim(),
    caseReference: input.caseReference.trim(),
    disputeStatus: hadDispute ? input.disputeStatus : "No dispute",
    status: "Succeeded",
    createdAt: nowIso(),
    createdBy: CURRENT_USER.name,
  };
  const refundedAmount = Math.round((payment.refundedAmount + amount) * 100) / 100;
  const nextPayment: Payment = {
    ...payment,
    refundedAmount,
    status: refundedAmount >= payment.amount ? "Refunded" : "Partially refunded",
    dispute: payment.dispute ? { ...payment.dispute, status: input.disputeStatus, caseReference: refund.caseReference } : null,
  };
  const refs = { paymentId: payment.id, customerId: payment.customerId, refundId: id };
  const events: BillingEvent[] = [makeEvent(db, `Refund ${id} of ${formatMoney(amount)} issued — ${input.reason}`, refs)];
  if (refund.customerNote) events.push(makeEvent(db, "Refund note emailed to the customer", refs, events.length));
  if (payment.dispute && payment.dispute.status !== input.disputeStatus) {
    events.push(makeEvent(db, `Dispute status changed from ${payment.dispute.status} to ${input.disputeStatus}`, refs, events.length));
  }
  if (refund.caseReference) events.push(makeEvent(db, `Case reference ${refund.caseReference} recorded`, refs, events.length));
  commit({
    ...db,
    payments: db.payments.map((p) => (p.id === payment.id ? nextPayment : p)),
    refunds: [...db.refunds, refund],
    events: [...db.events, ...events],
  });
  return refund;
}

export function sendReceipt(paymentId: string): void {
  const db = load();
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) return;
  const customer = db.customers.find((c) => c.id === payment.customerId);
  commit({
    ...db,
    events: [...db.events, makeEvent(db, `Receipt emailed to ${customer ? customer.email : payment.customerId}`, { paymentId, customerId: payment.customerId })],
  });
}

export function pauseSubscription(customerId: string, reason: PauseReason, note: string): void {
  const db = load();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer || customer.subscription.status === "Paused") return;
  const subscription: Subscription = {
    ...customer.subscription,
    status: "Paused",
    pausedAt: nowIso(),
    pauseReason: reason,
    pauseNote: note.trim(),
  };
  commit({
    ...db,
    customers: db.customers.map((c) => (c.id === customerId ? { ...c, subscription } : c)),
    events: [...db.events, makeEvent(db, `Subscription paused — ${reason}${note.trim() ? ` (${note.trim()})` : ""}`, { customerId })],
  });
}

export function resumeSubscription(customerId: string): void {
  const db = load();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer || customer.subscription.status !== "Paused") return;
  const subscription: Subscription = { ...customer.subscription, status: "Active", pausedAt: null, pauseReason: "", pauseNote: "" };
  commit({
    ...db,
    customers: db.customers.map((c) => (c.id === customerId ? { ...c, subscription } : c)),
    events: [...db.events, makeEvent(db, "Subscription resumed", { customerId })],
  });
}

export function markInvoicePaid(invoiceId: string, reason: PaidReason, reference: string): void {
  const db = load();
  const invoice = db.invoices.find((i) => i.id === invoiceId);
  if (!invoice || invoice.status === "Paid") return;
  const next: Invoice = { ...invoice, status: "Paid", paidAt: nowIso(), paidReason: reason, paidReference: reference.trim() };
  commit({
    ...db,
    invoices: db.invoices.map((i) => (i.id === invoiceId ? next : i)),
    events: [
      ...db.events,
      makeEvent(db, `Invoice ${invoiceId} marked as paid — ${reason}${reference.trim() ? ` (${reference.trim()})` : ""}`, { invoiceId, customerId: invoice.customerId }),
    ],
  });
}

export function resetDb(): void {
  commit(createSeed());
}

// ───────────────────────────── Selectors ─────────────────────────────

export function getCustomer(db: BillingDb, id: string): Customer | undefined {
  return db.customers.find((c) => c.id === id);
}

export function getPayment(db: BillingDb, id: string): Payment | undefined {
  return db.payments.find((p) => p.id === id);
}

export function getInvoice(db: BillingDb, id: string): Invoice | undefined {
  return db.invoices.find((i) => i.id === id);
}

export function getRefund(db: BillingDb, id: string): Refund | undefined {
  return db.refunds.find((r) => r.id === id);
}

function byNewest<T extends { at: string }>(a: T, b: T): number {
  return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
}

function byCreatedNewest<T extends { createdAt: string }>(a: T, b: T): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function eventsFor(db: BillingDb, filter: { paymentId?: string; customerId?: string; invoiceId?: string }): BillingEvent[] {
  return db.events
    .filter((e) => (filter.paymentId ? e.paymentId === filter.paymentId : true))
    .filter((e) => (filter.customerId ? e.customerId === filter.customerId : true))
    .filter((e) => (filter.invoiceId ? e.invoiceId === filter.invoiceId : true))
    .sort(byNewest);
}

export function refundsForPayment(db: BillingDb, paymentId: string): Refund[] {
  return db.refunds.filter((r) => r.paymentId === paymentId).sort(byCreatedNewest);
}

export function paymentsForCustomer(db: BillingDb, customerId: string): Payment[] {
  return db.payments.filter((p) => p.customerId === customerId).sort(byCreatedNewest);
}

export function invoicesForCustomer(db: BillingDb, customerId: string): Invoice[] {
  return db.invoices.filter((i) => i.customerId === customerId).sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
}

export function recentPayments(db: BillingDb, limit: number): Payment[] {
  return [...db.payments].sort(byCreatedNewest).slice(0, limit);
}

export function sortedPayments(db: BillingDb): Payment[] {
  return [...db.payments].sort(byCreatedNewest);
}

export function sortedRefunds(db: BillingDb): Refund[] {
  return [...db.refunds].sort(byCreatedNewest);
}

export function sortedInvoices(db: BillingDb): Invoice[] {
  return [...db.invoices].sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
}

export interface DisputeRow {
  payment: Payment;
  dispute: Dispute;
}

export function disputes(db: BillingDb): DisputeRow[] {
  return db.payments
    .filter((p): p is Payment & { dispute: Dispute } => p.dispute !== null)
    .map((p) => ({ payment: p, dispute: p.dispute }))
    .sort((a, b) => (a.dispute.openedAt < b.dispute.openedAt ? 1 : a.dispute.openedAt > b.dispute.openedAt ? -1 : 0));
}

/** Amount still available to refund on a payment. */
export function refundableAmount(payment: Payment): number {
  if (payment.status === "Failed") return 0;
  return Math.max(0, Math.round((payment.amount - payment.refundedAmount) * 100) / 100);
}

export function totalSpent(db: BillingDb, customerId: string): number {
  return db.payments
    .filter((p) => p.customerId === customerId && p.status !== "Failed")
    .reduce((sum, p) => sum + p.amount - p.refundedAmount, 0);
}

// ───────────────────────────── Formatting ─────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(amount: number): string {
  return money.format(amount);
}

/** Dates are stored as local `YYYY-MM-DDTHH:MM:SS` and shown as `YYYY-MM-DD`. */
export function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const [date, time] = value.split("T");
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

/** Case references look like CS-1234 (two letters, dash, four digits). */
export function isCaseReference(value: string): boolean {
  return /^CS-\d{4}$/.test(value.trim());
}

/** Parses a money input such as "120", "120.00" or "$120.00"; NaN when not a number. */
export function parseMoney(value: string): number {
  const cleaned = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100) / 100;
}
