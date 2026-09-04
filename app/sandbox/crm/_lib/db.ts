"use client";
/**
 * Meridian CRM data store.
 *
 * A tiny typed document store persisted to localStorage under `meridian-crm-db`.
 * Seeded on first load. Components subscribe through `useDb()` (a
 * useSyncExternalStore hook) so every page re-renders when data changes.
 * On the server (and during hydration) `useDb()` returns null so pages can
 * render a loading skeleton and avoid hydration mismatches.
 */
import { useSyncExternalStore } from "react";

export const DB_KEY = "meridian-crm-db";
const DB_VERSION = 1;

// ───────────────────────────── Types ─────────────────────────────

export const LEAD_STATUSES = ["New", "Working", "Nurturing"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation"] as const;
export type Stage = (typeof STAGES)[number];

export const FUNDING_STAGES = ["Unknown", "Requested", "Approved", "Allocated"] as const;
export type FundingStage = (typeof FUNDING_STAGES)[number];

export const DECISION_TIMELINES = ["Unknown", "This quarter", "Next quarter", "6–12 months"] as const;
export type DecisionTimeline = (typeof DECISION_TIMELINES)[number];

export const COMPETITORS = ["Northwind Systems", "Contoso Cloud", "Fabrikam", "None identified"] as const;
export type Competitor = (typeof COMPETITORS)[number];

export const OWNERS = ["Priya Natarajan", "Marcus Lee", "Sofia Reyes", "Daniel Okafor"] as const;
export type Owner = (typeof OWNERS)[number];

/** The signed-in demo user. */
export const CURRENT_USER = { name: "Priya Natarajan", role: "Sales Manager" } as const;

export interface Account {
  id: string;
  name: string;
  industry: string;
  region: string;
  owner: Owner;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  title: string;
  email: string;
}

export interface Lead {
  id: string;
  /** Display name, e.g. "Acme Industrial — Expansion". */
  name: string;
  /** Short topic used for the opportunity name prefill, e.g. "Expansion". */
  title: string;
  company: string;
  accountId: string;
  contactName: string;
  source: string;
  status: LeadStatus;
  createdAt: string;
  owner: Owner;
  notes: string;
  convertedOpportunityId?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  accountId: string;
  amount: number;
  closeDate: string;
  stage: Stage;
  decisionMakerContactId: string;
  fundingStage: FundingStage;
  decisionTimeline: DecisionTimeline;
  competitors: string[];
  nextStep: string;
  nextStepDate: string;
  notes: string;
  createdAt: string;
  sourceLeadId: string | null;
  owner: Owner;
}

export type ActivityKind = "note" | "call" | "email" | "meeting" | "status" | "created";

export interface Activity {
  id: string;
  at: string;
  kind: ActivityKind;
  text: string;
  actor: string;
  leadId?: string;
  opportunityId?: string;
}

export interface MeridianDb {
  version: number;
  accounts: Account[];
  contacts: Contact[];
  leads: Lead[];
  opportunities: Opportunity[];
  activities: Activity[];
}

// ───────────────────────────── Seed ─────────────────────────────

function createSeed(): MeridianDb {
  const accounts: Account[] = [
    { id: "A-1001", name: "Acme Industrial", industry: "Manufacturing", region: "North America", owner: "Priya Natarajan" },
    { id: "A-1002", name: "Northgate Logistics", industry: "Transportation", region: "North America", owner: "Marcus Lee" },
    { id: "A-1003", name: "Bluewater Utilities", industry: "Energy & Utilities", region: "EMEA", owner: "Priya Natarajan" },
    { id: "A-1004", name: "Halden Medical Group", industry: "Healthcare", region: "North America", owner: "Sofia Reyes" },
    { id: "A-1005", name: "Corvid Financial", industry: "Financial Services", region: "EMEA", owner: "Marcus Lee" },
    { id: "A-1006", name: "Pinecrest Retail", industry: "Retail", region: "APAC", owner: "Sofia Reyes" },
    { id: "A-1007", name: "Orion Aerospace", industry: "Aerospace & Defense", region: "North America", owner: "Daniel Okafor" },
    { id: "A-1008", name: "Verdana Foods", industry: "Consumer Goods", region: "LATAM", owner: "Daniel Okafor" },
  ];

  const contacts: Contact[] = [
    { id: "C-3001", accountId: "A-1001", name: "Helen Marsh", title: "VP Operations", email: "helen.marsh@acme-industrial.example" },
    { id: "C-3002", accountId: "A-1001", name: "Tom Whitaker", title: "Plant Manager", email: "tom.whitaker@acme-industrial.example" },
    { id: "C-3003", accountId: "A-1001", name: "Anita Rao", title: "Director of Procurement", email: "anita.rao@acme-industrial.example" },
    { id: "C-3004", accountId: "A-1002", name: "Greg Sullivan", title: "Chief Operating Officer", email: "greg.sullivan@northgate-logistics.example" },
    { id: "C-3005", accountId: "A-1002", name: "Lena Fischer", title: "Fleet Coordinator", email: "lena.fischer@northgate-logistics.example" },
    { id: "C-3006", accountId: "A-1003", name: "Omar Haddad", title: "Head of Infrastructure", email: "omar.haddad@bluewater-utilities.example" },
    { id: "C-3007", accountId: "A-1003", name: "Claire Dubois", title: "Systems Analyst", email: "claire.dubois@bluewater-utilities.example" },
    { id: "C-3008", accountId: "A-1003", name: "Ravi Menon", title: "Director of Engineering", email: "ravi.menon@bluewater-utilities.example" },
    { id: "C-3009", accountId: "A-1004", name: "Susan Park", title: "Chief Medical Information Officer", email: "susan.park@halden-medical.example" },
    { id: "C-3010", accountId: "A-1004", name: "Kevin Brandt", title: "IT Manager", email: "kevin.brandt@halden-medical.example" },
    { id: "C-3011", accountId: "A-1005", name: "Isabelle Laurent", title: "VP Technology", email: "isabelle.laurent@corvid-financial.example" },
    { id: "C-3012", accountId: "A-1005", name: "Nikhil Shah", title: "Compliance Analyst", email: "nikhil.shah@corvid-financial.example" },
    { id: "C-3013", accountId: "A-1005", name: "Peter Grant", title: "Head of Data", email: "peter.grant@corvid-financial.example" },
    { id: "C-3014", accountId: "A-1006", name: "Mei Tanaka", title: "Director of Store Operations", email: "mei.tanaka@pinecrest-retail.example" },
    { id: "C-3015", accountId: "A-1006", name: "Josh Carter", title: "Merchandising Lead", email: "josh.carter@pinecrest-retail.example" },
    { id: "C-3016", accountId: "A-1007", name: "Richard Alvarez", title: "VP Engineering", email: "richard.alvarez@orion-aerospace.example" },
    { id: "C-3017", accountId: "A-1007", name: "Emily Novak", title: "Program Manager", email: "emily.novak@orion-aerospace.example" },
    { id: "C-3018", accountId: "A-1007", name: "Sam Osei", title: "Procurement Specialist", email: "sam.osei@orion-aerospace.example" },
    { id: "C-3019", accountId: "A-1008", name: "Lucia Fernández", title: "Chief Supply Chain Officer", email: "lucia.fernandez@verdana-foods.example" },
    { id: "C-3020", accountId: "A-1008", name: "Bruno Costa", title: "Quality Manager", email: "bruno.costa@verdana-foods.example" },
  ];

  const leads: Lead[] = [
    {
      id: "L-1001",
      name: "Acme Industrial — Expansion",
      title: "Expansion",
      company: "Acme Industrial",
      accountId: "A-1001",
      contactName: "Helen Marsh",
      source: "Trade show",
      status: "Working",
      createdAt: "2026-08-12",
      owner: "Priya Natarajan",
      notes: "Expanding the Dayton plant. Evaluating asset management platforms ahead of the Q4 budget cycle.",
    },
    {
      id: "L-1002",
      name: "Northgate Logistics — Fleet telematics",
      title: "Fleet telematics",
      company: "Northgate Logistics",
      accountId: "A-1002",
      contactName: "Greg Sullivan",
      source: "Inbound web",
      status: "New",
      createdAt: "2026-08-28",
      owner: "Marcus Lee",
      notes: "Requested a demo of telematics integrations through the website form.",
    },
    {
      id: "L-1003",
      name: "Bluewater Utilities — Outage management",
      title: "Outage management",
      company: "Bluewater Utilities",
      accountId: "A-1003",
      contactName: "Omar Haddad",
      source: "Partner referral",
      status: "Working",
      createdAt: "2026-08-05",
      owner: "Priya Natarajan",
      notes: "Referred by the regional integration partner. Interested in outage workflow automation.",
    },
    {
      id: "L-1004",
      name: "Halden Medical Group — Patient scheduling",
      title: "Patient scheduling",
      company: "Halden Medical Group",
      accountId: "A-1004",
      contactName: "Kevin Brandt",
      source: "Webinar",
      status: "Nurturing",
      createdAt: "2026-07-22",
      owner: "Sofia Reyes",
      notes: "Attended the scheduling webinar. No budget until next fiscal year.",
    },
    {
      id: "L-1005",
      name: "Corvid Financial — Compliance reporting",
      title: "Compliance reporting",
      company: "Corvid Financial",
      accountId: "A-1005",
      contactName: "Nikhil Shah",
      source: "Inbound web",
      status: "New",
      createdAt: "2026-08-30",
      owner: "Marcus Lee",
      notes: "Downloaded the compliance reporting datasheet.",
    },
    {
      id: "L-1006",
      name: "Pinecrest Retail — Store analytics",
      title: "Store analytics",
      company: "Pinecrest Retail",
      accountId: "A-1006",
      contactName: "Mei Tanaka",
      source: "Cold outreach",
      status: "Working",
      createdAt: "2026-08-18",
      owner: "Sofia Reyes",
      notes: "Discovery call held. Wants store-level dashboards for 40 locations.",
    },
    {
      id: "L-1007",
      name: "Orion Aerospace — Supplier portal",
      title: "Supplier portal",
      company: "Orion Aerospace",
      accountId: "A-1007",
      contactName: "Emily Novak",
      source: "Trade show",
      status: "Nurturing",
      createdAt: "2026-07-09",
      owner: "Daniel Okafor",
      notes: "Met at the industry expo. Existing opportunity covers onboarding; portal is a later phase.",
    },
    {
      id: "L-1008",
      name: "Verdana Foods — Cold chain monitoring",
      title: "Cold chain monitoring",
      company: "Verdana Foods",
      accountId: "A-1008",
      contactName: "Bruno Costa",
      source: "Partner referral",
      status: "New",
      createdAt: "2026-09-01",
      owner: "Daniel Okafor",
      notes: "Partner flagged interest in temperature monitoring for distribution centers.",
    },
    {
      id: "L-1009",
      name: "Acme Industrial — Maintenance renewal",
      title: "Maintenance renewal",
      company: "Acme Industrial",
      accountId: "A-1001",
      contactName: "Tom Whitaker",
      source: "Existing customer",
      status: "Nurturing",
      createdAt: "2026-06-30",
      owner: "Priya Natarajan",
      notes: "Support contract renews in March. Revisit in January.",
    },
    {
      id: "L-1010",
      name: "Corvid Financial — Data platform",
      title: "Data platform",
      company: "Corvid Financial",
      accountId: "A-1005",
      contactName: "Peter Grant",
      source: "Webinar",
      status: "Working",
      createdAt: "2026-08-21",
      owner: "Marcus Lee",
      notes: "Evaluating data platform consolidation. Technical review scheduled.",
    },
  ];

  const opportunities: Opportunity[] = [
    {
      id: "O-2001",
      name: "Northgate Logistics — Route optimization",
      accountId: "A-1002",
      amount: 185000,
      closeDate: "2026-10-31",
      stage: "Proposal",
      decisionMakerContactId: "C-3004",
      fundingStage: "Approved",
      decisionTimeline: "This quarter",
      competitors: ["Northwind Systems"],
      nextStep: "Present revised proposal",
      nextStepDate: "2026-09-12",
      notes: "Pricing revised after the second workshop. COO is the sponsor.",
      createdAt: "2026-07-15",
      sourceLeadId: null,
      owner: "Marcus Lee",
    },
    {
      id: "O-2002",
      name: "Bluewater Utilities — Field service",
      accountId: "A-1003",
      amount: 240000,
      closeDate: "2026-12-15",
      stage: "Qualification",
      decisionMakerContactId: "C-3006",
      fundingStage: "Requested",
      decisionTimeline: "Next quarter",
      competitors: ["Contoso Cloud", "Fabrikam"],
      nextStep: "Technical workshop with infrastructure team",
      nextStepDate: "2026-09-20",
      notes: "Budget request submitted to the capital committee.",
      createdAt: "2026-08-02",
      sourceLeadId: null,
      owner: "Priya Natarajan",
    },
    {
      id: "O-2003",
      name: "Halden Medical Group — Records integration",
      accountId: "A-1004",
      amount: 96000,
      closeDate: "2026-11-20",
      stage: "Negotiation",
      decisionMakerContactId: "C-3009",
      fundingStage: "Allocated",
      decisionTimeline: "This quarter",
      competitors: ["None identified"],
      nextStep: "Legal review of master agreement",
      nextStepDate: "2026-09-15",
      notes: "Redlines received from their counsel.",
      createdAt: "2026-06-28",
      sourceLeadId: null,
      owner: "Sofia Reyes",
    },
    {
      id: "O-2004",
      name: "Pinecrest Retail — Loyalty platform",
      accountId: "A-1006",
      amount: 72000,
      closeDate: "2027-01-31",
      stage: "Prospecting",
      decisionMakerContactId: "",
      fundingStage: "Unknown",
      decisionTimeline: "Unknown",
      competitors: [],
      nextStep: "",
      nextStepDate: "",
      notes: "",
      createdAt: "2026-08-25",
      sourceLeadId: null,
      owner: "Sofia Reyes",
    },
    {
      id: "O-2005",
      name: "Orion Aerospace — Supplier onboarding",
      accountId: "A-1007",
      amount: 310000,
      closeDate: "2026-12-01",
      stage: "Proposal",
      decisionMakerContactId: "C-3016",
      fundingStage: "Approved",
      decisionTimeline: "6–12 months",
      competitors: ["Northwind Systems", "Contoso Cloud"],
      nextStep: "Complete security questionnaire",
      nextStepDate: "2026-09-30",
      notes: "Multi-site rollout; procurement wants a phased contract.",
      createdAt: "2026-07-30",
      sourceLeadId: null,
      owner: "Daniel Okafor",
    },
  ];

  const activities: Activity[] = [
    { id: "ACT-1", at: "2026-08-12T09:15:00", kind: "created", text: "Lead created from trade show badge scan", actor: "Priya Natarajan", leadId: "L-1001" },
    { id: "ACT-2", at: "2026-08-14T14:30:00", kind: "call", text: "Intro call with Helen Marsh. Confirmed plant expansion timeline for Q4.", actor: "Priya Natarajan", leadId: "L-1001" },
    { id: "ACT-3", at: "2026-08-20T10:00:00", kind: "email", text: "Sent asset management overview deck and case studies.", actor: "Priya Natarajan", leadId: "L-1001" },
    { id: "ACT-4", at: "2026-08-27T16:00:00", kind: "meeting", text: "Site walkthrough scheduled with plant operations.", actor: "Priya Natarajan", leadId: "L-1001" },
    { id: "ACT-5", at: "2026-08-28T08:40:00", kind: "created", text: "Lead created from website form", actor: "System", leadId: "L-1002" },
    { id: "ACT-6", at: "2026-08-05T11:00:00", kind: "created", text: "Lead created from partner referral", actor: "Marcus Lee", leadId: "L-1003" },
    { id: "ACT-7", at: "2026-08-19T13:20:00", kind: "call", text: "Discovery call. Outage workflow is the priority use case.", actor: "Priya Natarajan", leadId: "L-1003" },
    { id: "ACT-8", at: "2026-07-22T09:00:00", kind: "created", text: "Lead created from webinar attendance", actor: "System", leadId: "L-1004" },
    { id: "ACT-9", at: "2026-08-01T15:10:00", kind: "status", text: "Status changed to Nurturing", actor: "Sofia Reyes", leadId: "L-1004" },
    { id: "ACT-10", at: "2026-08-30T17:45:00", kind: "created", text: "Lead created from datasheet download", actor: "System", leadId: "L-1005" },
    { id: "ACT-11", at: "2026-08-18T10:30:00", kind: "created", text: "Lead created from outbound sequence", actor: "Sofia Reyes", leadId: "L-1006" },
    { id: "ACT-12", at: "2026-08-25T14:00:00", kind: "call", text: "Discovery call held with Mei Tanaka.", actor: "Sofia Reyes", leadId: "L-1006" },
    { id: "ACT-13", at: "2026-07-09T12:00:00", kind: "created", text: "Lead created from trade show", actor: "Daniel Okafor", leadId: "L-1007" },
    { id: "ACT-14", at: "2026-09-01T09:05:00", kind: "created", text: "Lead created from partner referral", actor: "Daniel Okafor", leadId: "L-1008" },
    { id: "ACT-15", at: "2026-06-30T10:00:00", kind: "created", text: "Renewal lead created", actor: "Priya Natarajan", leadId: "L-1009" },
    { id: "ACT-16", at: "2026-08-21T11:30:00", kind: "created", text: "Lead created from webinar attendance", actor: "System", leadId: "L-1010" },
    { id: "ACT-17", at: "2026-08-29T15:00:00", kind: "meeting", text: "Technical review scheduled with data team.", actor: "Marcus Lee", leadId: "L-1010" },
    { id: "ACT-18", at: "2026-08-26T16:30:00", kind: "note", text: "Revised proposal sent to Northgate Logistics.", actor: "Marcus Lee", opportunityId: "O-2001" },
    { id: "ACT-19", at: "2026-08-31T09:30:00", kind: "note", text: "Halden Medical redlines received; legal review in progress.", actor: "Sofia Reyes", opportunityId: "O-2003" },
    { id: "ACT-20", at: "2026-09-02T13:15:00", kind: "meeting", text: "Bluewater Utilities capital committee meeting confirmed for 20 Sep.", actor: "Priya Natarajan", opportunityId: "O-2002" },
    { id: "ACT-21", at: "2026-09-03T10:45:00", kind: "email", text: "Security questionnaire received from Orion Aerospace procurement.", actor: "Daniel Okafor", opportunityId: "O-2005" },
  ];

  return { version: DB_VERSION, accounts, contacts, leads, opportunities, activities };
}

// ───────────────────────────── Store ─────────────────────────────

const listeners = new Set<() => void>();
let cache: MeridianDb | null = null;

function isDb(value: unknown): value is MeridianDb {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<MeridianDb>;
  return (
    v.version === DB_VERSION &&
    Array.isArray(v.accounts) &&
    Array.isArray(v.contacts) &&
    Array.isArray(v.leads) &&
    Array.isArray(v.opportunities) &&
    Array.isArray(v.activities)
  );
}

function persist(db: MeridianDb): void {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage unavailable; the in-memory copy still works for this session.
  }
}

function load(): MeridianDb {
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

function commit(next: MeridianDb): void {
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

function getServerSnapshot(): MeridianDb | null {
  return null;
}

/** Live database. Returns null on the server and during hydration. */
export function useDb(): MeridianDb | null {
  return useSyncExternalStore(subscribe, load, getServerSnapshot);
}

export function getDb(): MeridianDb {
  return load();
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 19);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextId(prefix: string, existing: { id: string }[], start: number): string {
  const max = existing.reduce((acc, item) => {
    const n = Number(item.id.replace(`${prefix}-`, ""));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, start - 1);
  return `${prefix}-${max + 1}`;
}

export type NewOpportunityInput = Omit<Opportunity, "id" | "createdAt">;

export function createOpportunity(input: NewOpportunityInput): Opportunity {
  const db = load();
  const id = nextId("O", db.opportunities, 2001);
  const opportunity: Opportunity = { ...input, id, createdAt: todayIso() };
  const activity: Activity = {
    id: nextId("ACT", db.activities, 1),
    at: nowIso(),
    kind: "created",
    text: input.sourceLeadId
      ? `Opportunity ${id} created from lead ${input.sourceLeadId}`
      : `Opportunity ${id} created`,
    actor: CURRENT_USER.name,
    opportunityId: id,
    leadId: input.sourceLeadId ?? undefined,
  };
  commit({
    ...db,
    opportunities: [...db.opportunities, opportunity],
    leads: db.leads.map((lead) => (lead.id === input.sourceLeadId ? { ...lead, convertedOpportunityId: id } : lead)),
    activities: [...db.activities, activity],
  });
  return opportunity;
}

export function updateLeadStatus(leadId: string, status: LeadStatus): void {
  const db = load();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead || lead.status === status) return;
  const activity: Activity = {
    id: nextId("ACT", db.activities, 1),
    at: nowIso(),
    kind: "status",
    text: `Status changed from ${lead.status} to ${status}`,
    actor: CURRENT_USER.name,
    leadId,
  };
  commit({
    ...db,
    leads: db.leads.map((l) => (l.id === leadId ? { ...l, status } : l)),
    activities: [...db.activities, activity],
  });
}

export function assignLeadOwner(leadId: string, owner: Owner): void {
  const db = load();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead || lead.owner === owner) return;
  const activity: Activity = {
    id: nextId("ACT", db.activities, 1),
    at: nowIso(),
    kind: "note",
    text: `Owner changed from ${lead.owner} to ${owner}`,
    actor: CURRENT_USER.name,
    leadId,
  };
  commit({
    ...db,
    leads: db.leads.map((l) => (l.id === leadId ? { ...l, owner } : l)),
    activities: [...db.activities, activity],
  });
}

export function resetDb(): void {
  commit(createSeed());
}

// ───────────────────────────── Selectors ─────────────────────────────

export function getAccount(db: MeridianDb, id: string): Account | undefined {
  return db.accounts.find((a) => a.id === id);
}

export function getContact(db: MeridianDb, id: string): Contact | undefined {
  return db.contacts.find((c) => c.id === id);
}

export function getContactsForAccount(db: MeridianDb, accountId: string): Contact[] {
  return db.contacts.filter((c) => c.accountId === accountId);
}

export function getLead(db: MeridianDb, id: string): Lead | undefined {
  return db.leads.find((l) => l.id === id);
}

export function getOpportunity(db: MeridianDb, id: string): Opportunity | undefined {
  return db.opportunities.find((o) => o.id === id);
}

export function activitiesFor(db: MeridianDb, filter: { leadId?: string; opportunityId?: string }): Activity[] {
  return db.activities
    .filter((a) => (filter.leadId ? a.leadId === filter.leadId : true))
    .filter((a) => (filter.opportunityId ? a.opportunityId === filter.opportunityId : true))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function recentActivities(db: MeridianDb, limit: number): Activity[] {
  return [...db.activities].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

// ───────────────────────────── Formatting ─────────────────────────────

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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
