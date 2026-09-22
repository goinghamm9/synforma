"use client";
/**
 * Lumen Workspace data store.
 *
 * A tiny typed document store persisted to localStorage under
 * `lumen-workspace-db`. Seeded on first load. Components subscribe through
 * `useDb()` (a useSyncExternalStore hook) so every page re-renders when data
 * changes. On the server (and during hydration) `useDb()` returns null so
 * pages can render a loading skeleton and avoid hydration mismatches.
 */
import { useSyncExternalStore } from "react";

export const DB_KEY = "lumen-workspace-db";
const DB_VERSION = 1;

// ───────────────────────────── Types ─────────────────────────────

export const MODELS = ["Lumen Standard", "Lumen Pro", "Lumen Fast"] as const;
export type ModelName = (typeof MODELS)[number];

export const CUSTOM_TEMPLATE = "Custom instructions";

export interface InstructionTemplate {
  name: string;
  /** Wording the template prefills; empty for custom instructions. */
  text: string;
}

/** Order matters: the wizard lists the approved templates first and the custom option last. */
export const INSTRUCTION_TEMPLATES: readonly InstructionTemplate[] = [
  {
    name: "Approved: Support assistant",
    text: "You help support agents draft replies to customer tickets. Answer only from the connected knowledge. If the knowledge does not cover the question, say so and suggest escalating to a person. Keep replies short, polite and free of promises about timelines or refunds.",
  },
  {
    name: "Approved: Sales research",
    text: "You prepare account research summaries for sales representatives. Use only the connected knowledge and the information the representative provides. Do not speculate about a customer's budget or decision-makers; mark anything unverified as an assumption.",
  },
  {
    name: "Approved: Internal helpdesk",
    text: "You answer employee questions about internal tools, IT procedures and company policies from the connected knowledge. Link to the source document whenever possible. Never ask for or repeat passwords, access tokens or personal data.",
  },
  { name: CUSTOM_TEMPLATE, text: "" },
];

export function templateByName(name: string): InstructionTemplate | undefined {
  return INSTRUCTION_TEMPLATES.find((t) => t.name === name);
}

export function isApprovedTemplate(name: string): boolean {
  return name.startsWith("Approved:");
}

export const RETENTION_OPTIONS = ["7 days", "30 days", "90 days", "Indefinite"] as const;
export type RetentionOption = (typeof RETENTION_OPTIONS)[number];
export const DEFAULT_RETENTION: RetentionOption = "90 days";

export const REVIEWERS = ["Priya Natarajan — Head of Support", "Daniel Okafor — Security lead", "Sofia Marin — Legal counsel"] as const;
export type ReviewerName = (typeof REVIEWERS)[number];

export const VISIBILITY_OPTIONS = ["Organization only", "Anyone with the link"] as const;
export type Visibility = (typeof VISIBILITY_OPTIONS)[number];

export type ProjectStatus = "Active" | "Pending review" | "Archived";

/** The signed-in demo user. */
export const CURRENT_USER = { name: "Maya Lindqvist", firstName: "Maya", email: "maya@northwind-labs.example", role: "Workspace admin" } as const;

export const WORKSPACE_NAME = "Northwind Labs";

export interface Project {
  id: string;
  name: string;
  purpose: string;
  model: ModelName;
  template: string;
  instructions: string;
  /** Names of the connected knowledge sources. */
  sources: string[];
  restrictToKnowledge: boolean;
  retention: RetentionOption;
  reviewer: string;
  visibility: Visibility;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  kind: string;
  documents: number;
  status: "Connected" | "Syncing";
  lastSyncedAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Invited";
  joinedAt: string;
}

/** Seeded demo figures for the usage page; not measurements. */
export interface UsageRow {
  id: string;
  projectId: string;
  conversations: number;
  messages: number;
  activeUsers: number;
  lastActiveAt: string;
}

export interface LumenDb {
  version: number;
  projects: Project[];
  sources: KnowledgeSource[];
  members: Member[];
  usage: UsageRow[];
}

// ───────────────────────────── Seed ─────────────────────────────

function approvedText(name: string): string {
  return templateByName(name)?.text ?? "";
}

function createSeed(): LumenDb {
  const projects: Project[] = [
    {
      id: "PRJ-1001",
      name: "Support reply drafts",
      purpose: "Drafts first replies to customer tickets for the support team to review",
      model: "Lumen Standard",
      template: "Approved: Support assistant",
      instructions: approvedText("Approved: Support assistant"),
      sources: ["Support knowledge base", "Product documentation"],
      restrictToKnowledge: true,
      retention: "30 days",
      reviewer: "Priya Natarajan — Head of Support",
      visibility: "Organization only",
      status: "Active",
      createdAt: "2026-06-12",
      updatedAt: "2026-09-18",
      createdBy: "Priya Natarajan",
    },
    {
      id: "PRJ-1002",
      name: "Sales account research",
      purpose: "Summarizes what we know about an account before a first call",
      model: "Lumen Pro",
      template: "Approved: Sales research",
      instructions: approvedText("Approved: Sales research"),
      sources: ["Product documentation"],
      restrictToKnowledge: true,
      retention: "90 days",
      reviewer: "Daniel Okafor — Security lead",
      visibility: "Organization only",
      status: "Active",
      createdAt: "2026-07-03",
      updatedAt: "2026-09-15",
      createdBy: "Tomás Ferreira",
    },
    {
      id: "PRJ-1003",
      name: "IT helpdesk triage",
      purpose: "Answers common IT questions and routes the rest to the helpdesk queue",
      model: "Lumen Fast",
      template: "Approved: Internal helpdesk",
      instructions: approvedText("Approved: Internal helpdesk"),
      sources: ["Engineering wiki"],
      restrictToKnowledge: true,
      retention: "30 days",
      reviewer: "Daniel Okafor — Security lead",
      visibility: "Organization only",
      status: "Active",
      createdAt: "2026-07-21",
      updatedAt: "2026-09-10",
      createdBy: "Maya Lindqvist",
    },
    {
      id: "PRJ-1004",
      name: "Policy Q&A pilot",
      purpose: "Pilot that answers employee questions about HR policies",
      model: "Lumen Standard",
      template: CUSTOM_TEMPLATE,
      instructions: "Answer questions about our HR policies in plain language. Where a policy allows exceptions, explain who can approve them.",
      sources: ["HR policies"],
      restrictToKnowledge: false,
      retention: "Indefinite",
      reviewer: "Sofia Marin — Legal counsel",
      visibility: "Organization only",
      status: "Pending review",
      createdAt: "2026-08-14",
      updatedAt: "2026-09-02",
      createdBy: "Tomás Ferreira",
    },
    {
      id: "PRJ-1005",
      name: "Onboarding buddy",
      purpose: "Guides new hires through their first weeks with links to the right pages",
      model: "Lumen Standard",
      template: "Approved: Internal helpdesk",
      instructions: approvedText("Approved: Internal helpdesk"),
      sources: ["HR policies", "Engineering wiki"],
      restrictToKnowledge: true,
      retention: "90 days",
      reviewer: "Sofia Marin — Legal counsel",
      visibility: "Organization only",
      status: "Active",
      createdAt: "2026-08-28",
      updatedAt: "2026-09-17",
      createdBy: "Maya Lindqvist",
    },
    {
      id: "PRJ-1006",
      name: "Release notes summarizer",
      purpose: "Turns engineering change logs into customer-facing release notes",
      model: "Lumen Fast",
      template: "Approved: Support assistant",
      instructions: approvedText("Approved: Support assistant"),
      sources: ["Product documentation", "Engineering wiki"],
      restrictToKnowledge: true,
      retention: "7 days",
      reviewer: "Priya Natarajan — Head of Support",
      visibility: "Organization only",
      status: "Active",
      createdAt: "2026-09-04",
      updatedAt: "2026-09-19",
      createdBy: "Tomás Ferreira",
    },
  ];

  const sources: KnowledgeSource[] = [
    { id: "SRC-2001", name: "Support knowledge base", kind: "Help center articles", documents: 1240, status: "Connected", lastSyncedAt: "2026-09-21T06:00:00" },
    { id: "SRC-2002", name: "Product documentation", kind: "Documentation site", documents: 380, status: "Connected", lastSyncedAt: "2026-09-21T06:05:00" },
    { id: "SRC-2003", name: "HR policies", kind: "Policy library", documents: 96, status: "Connected", lastSyncedAt: "2026-09-20T22:10:00" },
    { id: "SRC-2004", name: "Engineering wiki", kind: "Internal wiki", documents: 2150, status: "Syncing", lastSyncedAt: "2026-09-19T18:30:00" },
  ];

  const members: Member[] = [
    { id: "USR-3001", name: "Maya Lindqvist", email: "maya@northwind-labs.example", role: "Workspace admin", status: "Active", joinedAt: "2026-05-02" },
    { id: "USR-3002", name: "Priya Natarajan", email: "priya@northwind-labs.example", role: "Reviewer", status: "Active", joinedAt: "2026-05-06" },
    { id: "USR-3003", name: "Daniel Okafor", email: "daniel@northwind-labs.example", role: "Reviewer", status: "Active", joinedAt: "2026-05-06" },
    { id: "USR-3004", name: "Sofia Marin", email: "sofia@northwind-labs.example", role: "Reviewer", status: "Active", joinedAt: "2026-05-13" },
    { id: "USR-3005", name: "Tomás Ferreira", email: "tomas@northwind-labs.example", role: "Team lead", status: "Active", joinedAt: "2026-06-01" },
  ];

  const usage: UsageRow[] = [
    { id: "USE-1", projectId: "PRJ-1001", conversations: 842, messages: 3960, activeUsers: 14, lastActiveAt: "2026-09-21T15:42:00" },
    { id: "USE-2", projectId: "PRJ-1002", conversations: 133, messages: 610, activeUsers: 6, lastActiveAt: "2026-09-19T11:05:00" },
    { id: "USE-3", projectId: "PRJ-1003", conversations: 517, messages: 1480, activeUsers: 41, lastActiveAt: "2026-09-21T16:10:00" },
    { id: "USE-4", projectId: "PRJ-1004", conversations: 28, messages: 96, activeUsers: 4, lastActiveAt: "2026-09-12T09:30:00" },
    { id: "USE-5", projectId: "PRJ-1005", conversations: 76, messages: 402, activeUsers: 9, lastActiveAt: "2026-09-20T13:25:00" },
    { id: "USE-6", projectId: "PRJ-1006", conversations: 19, messages: 58, activeUsers: 3, lastActiveAt: "2026-09-18T17:50:00" },
  ];

  return { version: DB_VERSION, projects, sources, members, usage };
}

// ───────────────────────────── Store ─────────────────────────────

const listeners = new Set<() => void>();
let cache: LumenDb | null = null;

function isDb(value: unknown): value is LumenDb {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<LumenDb>;
  return v.version === DB_VERSION && Array.isArray(v.projects) && Array.isArray(v.sources) && Array.isArray(v.members) && Array.isArray(v.usage);
}

function persist(db: LumenDb): void {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage unavailable; the in-memory copy still works for this session.
  }
}

function load(): LumenDb {
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

function commit(next: LumenDb): void {
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

function getServerSnapshot(): LumenDb | null {
  return null;
}

/** Live database. Returns null on the server and during hydration. */
export function useDb(): LumenDb | null {
  return useSyncExternalStore(subscribe, load, getServerSnapshot);
}

export function getDb(): LumenDb {
  return load();
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

// ───────────────────────────── Mutations ─────────────────────────────

export interface NewProjectInput {
  name: string;
  purpose: string;
  model: ModelName;
  template: string;
  instructions: string;
  sources: string[];
  restrictToKnowledge: boolean;
  retention: RetentionOption;
  reviewer: string;
  visibility: Visibility;
}

/** Creates a project with the next sequential id (PRJ-1007 upward after the seed). */
export function createProject(input: NewProjectInput): Project {
  const db = load();
  const today = todayIso();
  const project: Project = {
    id: nextId("PRJ", db.projects, 1001),
    ...input,
    status: isApprovedTemplate(input.template) ? "Active" : "Pending review",
    createdAt: today,
    updatedAt: today,
    createdBy: CURRENT_USER.name,
  };
  commit({ ...db, projects: [...db.projects, project] });
  return project;
}

export function archiveProject(projectId: string): void {
  const db = load();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project || project.status === "Archived") return;
  commit({ ...db, projects: db.projects.map((p) => (p.id === projectId ? { ...p, status: "Archived", updatedAt: todayIso() } : p)) });
}

/** Copies a project's configuration under a new name. The copy keeps the original's review status. */
export function duplicateProject(projectId: string, name: string): Project | undefined {
  const db = load();
  const source = db.projects.find((p) => p.id === projectId);
  if (!source) return undefined;
  const today = todayIso();
  const copy: Project = {
    ...source,
    id: nextId("PRJ", db.projects, 1001),
    name,
    status: isApprovedTemplate(source.template) ? "Active" : "Pending review",
    createdAt: today,
    updatedAt: today,
    createdBy: CURRENT_USER.name,
  };
  commit({ ...db, projects: [...db.projects, copy] });
  return copy;
}

export function resetDb(): void {
  commit(createSeed());
}

// ───────────────────────────── Selectors ─────────────────────────────

export function getProject(db: LumenDb, id: string): Project | undefined {
  return db.projects.find((p) => p.id === id);
}

export function getSource(db: LumenDb, name: string): KnowledgeSource | undefined {
  return db.sources.find((s) => s.name === name);
}

export function projectsUsingSource(db: LumenDb, name: string): Project[] {
  return db.projects.filter((p) => p.status !== "Archived" && p.sources.includes(name));
}

export function usageForProject(db: LumenDb, projectId: string): UsageRow | undefined {
  return db.usage.find((u) => u.projectId === projectId);
}

/** Projects sorted by most recent update. */
export function recentProjects(db: LumenDb, limit: number): Project[] {
  return [...db.projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? 1 : -1)).slice(0, limit);
}

// ───────────────────────────── Formatting / validation ─────────────────────────────

const number = new Intl.NumberFormat("en-US");

export function formatNumber(value: number): string {
  return number.format(value);
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

/** Project names: letters, digits, spaces and hyphens. */
export function isValidProjectName(value: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(value);
}

export function projectNameExists(db: LumenDb, name: string, exceptId?: string): boolean {
  const needle = name.trim().toLowerCase();
  return db.projects.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === needle);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
