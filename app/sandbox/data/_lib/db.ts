"use client";
/**
 * Nimbus Data Console data store.
 *
 * A tiny typed document store persisted to localStorage under `nimbus-data-db`.
 * Seeded on first load. Components subscribe through `useDb()` (a
 * useSyncExternalStore hook) so every page re-renders when data changes.
 * On the server (and during hydration) `useDb()` returns null so pages can
 * render a loading skeleton and avoid hydration mismatches.
 */
import { useSyncExternalStore } from "react";

export const DB_KEY = "nimbus-data-db";
const DB_VERSION = 1;

// ───────────────────────────── Types ─────────────────────────────

export const DEFAULT_PROJECT_ID = "PRJ-2001";

export const COLUMN_TYPES = ["uuid", "text", "int4", "int8", "numeric", "float8", "bool", "timestamptz", "date", "jsonb"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const POLICY_ROLES = ["anon", "authenticated", "service_role"] as const;
export type PolicyRole = (typeof POLICY_ROLES)[number];

export const POLICY_COMMANDS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
export type PolicyCommand = (typeof POLICY_COMMANDS)[number];

export const MEMBER_ROLES = ["Owner", "Admin", "Editor", "Viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** The signed-in demo user. */
export const CURRENT_USER = { name: "Dana Whitfield", email: "dana@acme-ops.example", role: "Owner" } as const;

export interface Project {
  id: string;
  name: string;
  org: string;
  ref: string;
  region: string;
  plan: string;
  status: string;
  engine: string;
  createdAt: string;
}

export interface Column {
  name: string;
  type: ColumnType;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string;
}

export interface Policy {
  id: string;
  name: string;
  role: PolicyRole;
  command: PolicyCommand;
  using: string;
  createdAt: string;
}

export interface DataTable {
  id: string;
  projectId: string;
  schema: string;
  name: string;
  description: string;
  rlsEnabled: boolean;
  columns: Column[];
  policies: Policy[];
  rowCount: number;
  createdAt: string;
  createdBy: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: "Active" | "Invited";
  joinedAt: string;
}

export interface KeyRotation {
  at: string;
  by: string;
  reason: string;
}

export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  kind: "public" | "secret";
  value: string;
  createdAt: string;
  lastRotatedAt: string;
  rotations: KeyRotation[];
}

export interface AuthUser {
  id: string;
  email: string;
  provider: string;
  confirmed: boolean;
  createdAt: string;
  lastSignInAt: string;
}

export interface AuthProvider {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Bucket {
  id: string;
  name: string;
  isPublic: boolean;
  objects: number;
  sizeBytes: number;
  createdAt: string;
}

export interface Activity {
  id: string;
  at: string;
  text: string;
  actor: string;
  tableId?: string;
}

export interface NimbusDb {
  version: number;
  projects: Project[];
  tables: DataTable[];
  members: Member[];
  apiKeys: ApiKey[];
  authUsers: AuthUser[];
  authProviders: AuthProvider[];
  buckets: Bucket[];
  activities: Activity[];
}

// ───────────────────────────── Seed ─────────────────────────────

function col(name: string, type: ColumnType, options: Partial<Omit<Column, "name" | "type">> = {}): Column {
  return { name, type, nullable: options.nullable ?? true, primaryKey: options.primaryKey ?? false, defaultValue: options.defaultValue ?? "" };
}

function createSeed(): NimbusDb {
  const projects: Project[] = [
    {
      id: "PRJ-2001",
      name: "Acme Ops",
      org: "Acme Corp",
      ref: "acme-ops-prod",
      region: "eu-west-1 (Ireland)",
      plan: "Pro",
      status: "Healthy",
      engine: "Postgres 16.4",
      createdAt: "2025-11-04",
    },
  ];

  const tables: DataTable[] = [
    {
      id: "TBL-4001",
      projectId: "PRJ-2001",
      schema: "public",
      name: "customers",
      description: "Customer accounts synced from the billing system",
      rlsEnabled: true,
      columns: [
        col("id", "uuid", { nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" }),
        col("user_id", "uuid", { nullable: false }),
        col("email", "text", { nullable: false }),
        col("full_name", "text"),
        col("created_at", "timestamptz", { nullable: false, defaultValue: "now()" }),
      ],
      policies: [
        { id: "POL-5001", name: "Customers read own row", role: "authenticated", command: "SELECT", using: "auth.uid() = user_id", createdAt: "2025-11-06" },
        { id: "POL-5002", name: "Service role updates customers", role: "service_role", command: "UPDATE", using: "true", createdAt: "2025-11-06" },
      ],
      rowCount: 12480,
      createdAt: "2025-11-06",
      createdBy: "Dana Whitfield",
    },
    {
      id: "TBL-4002",
      projectId: "PRJ-2001",
      schema: "public",
      name: "orders",
      description: "Orders placed through the storefront",
      rlsEnabled: true,
      columns: [
        col("id", "uuid", { nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" }),
        col("customer_id", "uuid", { nullable: false }),
        col("user_id", "uuid", { nullable: false }),
        col("status", "text", { nullable: false, defaultValue: "'pending'" }),
        col("total_cents", "int8", { nullable: false, defaultValue: "0" }),
        col("created_at", "timestamptz", { nullable: false, defaultValue: "now()" }),
      ],
      policies: [
        { id: "POL-5003", name: "Customers read own orders", role: "authenticated", command: "SELECT", using: "auth.uid() = user_id", createdAt: "2025-11-09" },
        { id: "POL-5004", name: "Customers create own orders", role: "authenticated", command: "INSERT", using: "auth.uid() = user_id", createdAt: "2025-11-09" },
      ],
      rowCount: 58211,
      createdAt: "2025-11-09",
      createdBy: "Tomasz Nowak",
    },
    {
      id: "TBL-4003",
      projectId: "PRJ-2001",
      schema: "public",
      name: "order_items",
      description: "Line items belonging to an order",
      rlsEnabled: true,
      columns: [
        col("id", "uuid", { nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" }),
        col("order_id", "uuid", { nullable: false }),
        col("product_id", "uuid", { nullable: false }),
        col("quantity", "int4", { nullable: false, defaultValue: "1" }),
        col("unit_price_cents", "int8", { nullable: false }),
      ],
      policies: [
        {
          id: "POL-5005",
          name: "Read items of own orders",
          role: "authenticated",
          command: "SELECT",
          using: "exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())",
          createdAt: "2025-11-09",
        },
      ],
      rowCount: 144902,
      createdAt: "2025-11-09",
      createdBy: "Tomasz Nowak",
    },
    {
      id: "TBL-4004",
      projectId: "PRJ-2001",
      schema: "public",
      name: "products",
      description: "Catalog of sellable products",
      rlsEnabled: true,
      columns: [
        col("id", "uuid", { nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" }),
        col("sku", "text", { nullable: false }),
        col("name", "text", { nullable: false }),
        col("price_cents", "int8", { nullable: false }),
        col("active", "bool", { nullable: false, defaultValue: "true" }),
      ],
      policies: [
        { id: "POL-5006", name: "Anyone reads active products", role: "anon", command: "SELECT", using: "active = true", createdAt: "2025-11-12" },
        { id: "POL-5007", name: "Signed-in users read products", role: "authenticated", command: "SELECT", using: "true", createdAt: "2025-11-12" },
      ],
      rowCount: 312,
      createdAt: "2025-11-12",
      createdBy: "Aisha Bello",
    },
    {
      id: "TBL-4005",
      projectId: "PRJ-2001",
      schema: "public",
      name: "audit_log",
      description: "Append-only record of administrative actions",
      rlsEnabled: false,
      columns: [
        col("id", "int8", { nullable: false, primaryKey: true, defaultValue: "generated by default as identity" }),
        col("actor", "uuid"),
        col("action", "text", { nullable: false }),
        col("payload", "jsonb"),
        col("created_at", "timestamptz", { nullable: false, defaultValue: "now()" }),
      ],
      policies: [],
      rowCount: 901337,
      createdAt: "2025-12-02",
      createdBy: "Dana Whitfield",
    },
    {
      id: "TBL-4006",
      projectId: "PRJ-2001",
      schema: "public",
      name: "invoices",
      description: "Monthly invoices generated from orders",
      rlsEnabled: true,
      columns: [
        col("id", "uuid", { nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" }),
        col("customer_id", "uuid", { nullable: false }),
        col("user_id", "uuid", { nullable: false }),
        col("amount_cents", "int8", { nullable: false }),
        col("issued_at", "date", { nullable: false }),
        col("paid", "bool", { nullable: false, defaultValue: "false" }),
      ],
      policies: [
        { id: "POL-5008", name: "Customers read own invoices", role: "authenticated", command: "SELECT", using: "auth.uid() = user_id", createdAt: "2026-01-15" },
        { id: "POL-5009", name: "Service role inserts invoices", role: "service_role", command: "INSERT", using: "true", createdAt: "2026-01-15" },
      ],
      rowCount: 6104,
      createdAt: "2026-01-15",
      createdBy: "Leo Marchetti",
    },
  ];

  const members: Member[] = [
    { id: "USR-6001", name: "Dana Whitfield", email: "dana@acme-ops.example", role: "Owner", status: "Active", joinedAt: "2025-11-04" },
    { id: "USR-6002", name: "Tomasz Nowak", email: "tomasz@acme-ops.example", role: "Admin", status: "Active", joinedAt: "2025-11-05" },
    { id: "USR-6003", name: "Aisha Bello", email: "aisha@acme-ops.example", role: "Editor", status: "Active", joinedAt: "2025-11-10" },
    { id: "USR-6004", name: "Leo Marchetti", email: "leo@acme-ops.example", role: "Editor", status: "Active", joinedAt: "2026-01-08" },
    { id: "USR-6005", name: "Hannah Kim", email: "hannah@acme-ops.example", role: "Viewer", status: "Active", joinedAt: "2026-03-21" },
  ];

  const apiKeys: ApiKey[] = [
    {
      id: "KEY-7001",
      projectId: "PRJ-2001",
      name: "anon",
      kind: "public",
      value: "nbp_anon_6f3a19c4…d2e1",
      createdAt: "2025-11-04",
      lastRotatedAt: "2025-11-04",
      rotations: [],
    },
    {
      id: "KEY-7002",
      projectId: "PRJ-2001",
      name: "service_role",
      kind: "secret",
      value: "nbp_srv_b81e7c02…9a4f",
      createdAt: "2025-11-04",
      lastRotatedAt: "2026-02-11",
      rotations: [{ at: "2026-02-11T09:40:00", by: "Tomasz Nowak", reason: "Scheduled quarterly rotation" }],
    },
    {
      id: "KEY-7003",
      projectId: "PRJ-2001",
      name: "ci-deploy",
      kind: "secret",
      value: "nbp_ci_4d0c5e77…31b8",
      createdAt: "2026-01-20",
      lastRotatedAt: "2026-01-20",
      rotations: [],
    },
  ];

  const authUsers: AuthUser[] = [
    { id: "AU-8001", email: "maria.lund@example.com", provider: "Email", confirmed: true, createdAt: "2026-02-03", lastSignInAt: "2026-09-17T14:02:00" },
    { id: "AU-8002", email: "j.okonkwo@example.com", provider: "GitHub", confirmed: true, createdAt: "2026-02-19", lastSignInAt: "2026-09-18T08:15:00" },
    { id: "AU-8003", email: "sven.h@example.org", provider: "Magic link", confirmed: true, createdAt: "2026-04-11", lastSignInAt: "2026-09-12T19:44:00" },
    { id: "AU-8004", email: "priyanka.r@example.com", provider: "Email", confirmed: false, createdAt: "2026-09-16", lastSignInAt: "" },
    { id: "AU-8005", email: "t.baumann@example.net", provider: "GitHub", confirmed: true, createdAt: "2026-06-30", lastSignInAt: "2026-09-18T11:27:00" },
    { id: "AU-8006", email: "amira.f@example.com", provider: "Email", confirmed: true, createdAt: "2026-08-22", lastSignInAt: "2026-09-15T07:58:00" },
  ];

  const authProviders: AuthProvider[] = [
    { id: "email", name: "Email", enabled: true },
    { id: "magic-link", name: "Magic link", enabled: true },
    { id: "github", name: "GitHub", enabled: true },
    { id: "google", name: "Google", enabled: false },
    { id: "saml", name: "SAML SSO", enabled: false },
  ];

  const buckets: Bucket[] = [
    { id: "BKT-9001", name: "avatars", isPublic: true, objects: 8421, sizeBytes: 1_284_000_000, createdAt: "2025-11-07" },
    { id: "BKT-9002", name: "invoices", isPublic: false, objects: 6104, sizeBytes: 402_000_000, createdAt: "2026-01-15" },
    { id: "BKT-9003", name: "exports", isPublic: false, objects: 37, sizeBytes: 9_600_000, createdAt: "2026-05-02" },
  ];

  const activities: Activity[] = [
    { id: "ACT-1", at: "2026-09-18T16:20:00", text: "Policy \"Service role inserts invoices\" reviewed", actor: "Leo Marchetti", tableId: "TBL-4006" },
    { id: "ACT-2", at: "2026-09-18T10:05:00", text: "Bucket exports: 3 objects added", actor: "Aisha Bello" },
    { id: "ACT-3", at: "2026-09-17T15:48:00", text: "Auth provider Google disabled", actor: "Tomasz Nowak" },
    { id: "ACT-4", at: "2026-09-16T09:12:00", text: "Table products: description updated", actor: "Aisha Bello", tableId: "TBL-4004" },
    { id: "ACT-5", at: "2026-09-12T13:30:00", text: "Hannah Kim accepted the invitation (Viewer)", actor: "System" },
    { id: "ACT-6", at: "2026-02-11T09:40:00", text: "API key service_role rotated: Scheduled quarterly rotation", actor: "Tomasz Nowak" },
  ];

  return { version: DB_VERSION, projects, tables, members, apiKeys, authUsers, authProviders, buckets, activities };
}

// ───────────────────────────── Store ─────────────────────────────

const listeners = new Set<() => void>();
let cache: NimbusDb | null = null;

function isDb(value: unknown): value is NimbusDb {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NimbusDb>;
  return (
    v.version === DB_VERSION &&
    Array.isArray(v.projects) &&
    Array.isArray(v.tables) &&
    Array.isArray(v.members) &&
    Array.isArray(v.apiKeys) &&
    Array.isArray(v.authUsers) &&
    Array.isArray(v.authProviders) &&
    Array.isArray(v.buckets) &&
    Array.isArray(v.activities)
  );
}

function persist(db: NimbusDb): void {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage unavailable; the in-memory copy still works for this session.
  }
}

function load(): NimbusDb {
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

function commit(next: NimbusDb): void {
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

function getServerSnapshot(): NimbusDb | null {
  return null;
}

/** Live database. Returns null on the server and during hydration. */
export function useDb(): NimbusDb | null {
  return useSyncExternalStore(subscribe, load, getServerSnapshot);
}

export function getDb(): NimbusDb {
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

function allPolicies(db: NimbusDb): Policy[] {
  return db.tables.flatMap((table) => table.policies);
}

function logActivity(db: NimbusDb, text: string, tableId?: string): Activity[] {
  return [...db.activities, { id: nextId("ACT", db.activities, 1), at: nowIso(), text, actor: CURRENT_USER.name, tableId }];
}

// ───────────────────────────── Mutations ─────────────────────────────

export type NewPolicyInput = Omit<Policy, "id" | "createdAt">;

export interface NewTableInput {
  projectId: string;
  name: string;
  description: string;
  columns: Column[];
  rlsEnabled: boolean;
  policies: NewPolicyInput[];
}

/** Creates a table with the next sequential id (TBL-4007 upward after the seed). */
export function createTable(input: NewTableInput): DataTable {
  const db = load();
  const id = nextId("TBL", db.tables, 4001);
  let policyPool = allPolicies(db);
  const policies: Policy[] = input.policies.map((policy) => {
    const created: Policy = { ...policy, id: nextId("POL", policyPool, 5001), createdAt: todayIso() };
    policyPool = [...policyPool, created];
    return created;
  });
  const table: DataTable = {
    id,
    projectId: input.projectId,
    schema: "public",
    name: input.name,
    description: input.description,
    rlsEnabled: input.rlsEnabled,
    columns: input.columns,
    policies,
    rowCount: 0,
    createdAt: todayIso(),
    createdBy: CURRENT_USER.name,
  };
  commit({
    ...db,
    tables: [...db.tables, table],
    activities: logActivity(db, `Table ${input.name} created (${id})${input.rlsEnabled ? " with row level security" : ""}`, id),
  });
  return table;
}

export function setTableRls(tableId: string, enabled: boolean): void {
  const db = load();
  const table = db.tables.find((t) => t.id === tableId);
  if (!table || table.rlsEnabled === enabled) return;
  commit({
    ...db,
    tables: db.tables.map((t) => (t.id === tableId ? { ...t, rlsEnabled: enabled } : t)),
    activities: logActivity(db, `Row level security ${enabled ? "enabled" : "disabled"} on ${table.name}`, tableId),
  });
}

export function addPolicy(tableId: string, input: NewPolicyInput): Policy | undefined {
  const db = load();
  const table = db.tables.find((t) => t.id === tableId);
  if (!table) return undefined;
  const policy: Policy = { ...input, id: nextId("POL", allPolicies(db), 5001), createdAt: todayIso() };
  commit({
    ...db,
    tables: db.tables.map((t) => (t.id === tableId ? { ...t, policies: [...t.policies, policy] } : t)),
    activities: logActivity(db, `Policy "${input.name}" added to ${table.name}`, tableId),
  });
  return policy;
}

export function removePolicy(tableId: string, policyId: string): void {
  const db = load();
  const table = db.tables.find((t) => t.id === tableId);
  const policy = table?.policies.find((p) => p.id === policyId);
  if (!table || !policy) return;
  commit({
    ...db,
    tables: db.tables.map((t) => (t.id === tableId ? { ...t, policies: t.policies.filter((p) => p.id !== policyId) } : t)),
    activities: logActivity(db, `Policy "${policy.name}" removed from ${table.name}`, tableId),
  });
}

export function updateTableDescription(tableId: string, description: string): void {
  const db = load();
  const table = db.tables.find((t) => t.id === tableId);
  if (!table || table.description === description) return;
  commit({
    ...db,
    tables: db.tables.map((t) => (t.id === tableId ? { ...t, description } : t)),
    activities: logActivity(db, `Table ${table.name}: description updated`, tableId),
  });
}

export function deleteTable(tableId: string): void {
  const db = load();
  const table = db.tables.find((t) => t.id === tableId);
  if (!table) return;
  commit({
    ...db,
    tables: db.tables.filter((t) => t.id !== tableId),
    activities: logActivity(db, `Table ${table.name} deleted (${tableId})`),
  });
}

export function inviteMember(email: string, role: MemberRole): Member {
  const db = load();
  const member: Member = {
    id: nextId("USR", db.members, 6001),
    name: "",
    email,
    role,
    status: "Invited",
    joinedAt: todayIso(),
  };
  commit({ ...db, members: [...db.members, member], activities: logActivity(db, `${email} invited as ${role}`) });
  return member;
}

export function updateMemberRole(memberId: string, role: MemberRole): void {
  const db = load();
  const member = db.members.find((m) => m.id === memberId);
  if (!member || member.role === role) return;
  commit({
    ...db,
    members: db.members.map((m) => (m.id === memberId ? { ...m, role } : m)),
    activities: logActivity(db, `${member.name || member.email}: role changed from ${member.role} to ${role}`),
  });
}

export function removeMember(memberId: string): void {
  const db = load();
  const member = db.members.find((m) => m.id === memberId);
  if (!member) return;
  commit({
    ...db,
    members: db.members.filter((m) => m.id !== memberId),
    activities: logActivity(db, `${member.name || member.email} removed from the project`),
  });
}

function randomSuffix(length: number): string {
  const alphabet = "abcdef0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function rotateApiKey(keyId: string, reason: string): ApiKey | undefined {
  const db = load();
  const key = db.apiKeys.find((k) => k.id === keyId);
  if (!key) return undefined;
  const prefix = key.value.split("_").slice(0, 2).join("_");
  const rotated: ApiKey = {
    ...key,
    value: `${prefix}_${randomSuffix(8)}…${randomSuffix(4)}`,
    lastRotatedAt: todayIso(),
    rotations: [...key.rotations, { at: nowIso(), by: CURRENT_USER.name, reason }],
  };
  commit({
    ...db,
    apiKeys: db.apiKeys.map((k) => (k.id === keyId ? rotated : k)),
    activities: logActivity(db, `API key ${key.name} rotated: ${reason}`),
  });
  return rotated;
}

export function setAuthProvider(providerId: string, enabled: boolean): void {
  const db = load();
  const provider = db.authProviders.find((p) => p.id === providerId);
  if (!provider || provider.enabled === enabled) return;
  commit({
    ...db,
    authProviders: db.authProviders.map((p) => (p.id === providerId ? { ...p, enabled } : p)),
    activities: logActivity(db, `Auth provider ${provider.name} ${enabled ? "enabled" : "disabled"}`),
  });
}

export function createBucket(name: string, isPublic: boolean): Bucket {
  const db = load();
  const bucket: Bucket = { id: nextId("BKT", db.buckets, 9001), name, isPublic, objects: 0, sizeBytes: 0, createdAt: todayIso() };
  commit({ ...db, buckets: [...db.buckets, bucket], activities: logActivity(db, `Bucket ${name} created (${isPublic ? "public" : "private"})`) });
  return bucket;
}

export function resetDb(): void {
  commit(createSeed());
}

// ───────────────────────────── Selectors ─────────────────────────────

export function getProject(db: NimbusDb, id: string): Project | undefined {
  return db.projects.find((p) => p.id === id);
}

export function getTable(db: NimbusDb, id: string): DataTable | undefined {
  return db.tables.find((t) => t.id === id);
}

export function tablesForProject(db: NimbusDb, projectId: string): DataTable[] {
  return db.tables.filter((t) => t.projectId === projectId);
}

export function keysForProject(db: NimbusDb, projectId: string): ApiKey[] {
  return db.apiKeys.filter((k) => k.projectId === projectId);
}

export function recentActivities(db: NimbusDb, limit: number): Activity[] {
  return [...db.activities].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

export function primaryKeyOf(table: Pick<DataTable, "columns">): string {
  return table.columns
    .filter((c) => c.primaryKey)
    .map((c) => c.name)
    .join(", ");
}

/** Deterministic sample rows for the data preview (seeded tables only). */
export function previewRows(table: DataTable, count = 5): Record<string, string>[] {
  if (table.rowCount === 0) return [];
  let seed = 0;
  for (const ch of table.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");
  const words = ["north", "atlas", "ember", "quartz", "harbor", "linen", "cobalt", "meadow", "pixel", "summit"];
  return Array.from({ length: count }, (_, row) =>
    Object.fromEntries(
      table.columns.map((column) => {
        let value: string;
        switch (column.type) {
          case "uuid":
            value = `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
            break;
          case "text":
            value = column.name.includes("email")
              ? `${words[Math.floor(rand() * words.length)]}${row + 1}@example.com`
              : column.name === "status"
                ? ["pending", "paid", "shipped"][row % 3]
                : column.name === "sku"
                  ? `SKU-${1000 + Math.floor(rand() * 9000)}`
                  : `${words[Math.floor(rand() * words.length)]} ${words[Math.floor(rand() * words.length)]}`;
            break;
          case "int4":
            value = String(1 + Math.floor(rand() * 12));
            break;
          case "int8":
            value = String(100 + Math.floor(rand() * 90000));
            break;
          case "numeric":
          case "float8":
            value = (rand() * 1000).toFixed(2);
            break;
          case "bool":
            value = rand() > 0.3 ? "true" : "false";
            break;
          case "timestamptz":
            value = `2026-0${1 + Math.floor(rand() * 9)}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}T${String(Math.floor(rand() * 24)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00Z`;
            break;
          case "date":
            value = `2026-0${1 + Math.floor(rand() * 9)}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;
            break;
          case "jsonb":
            value = `{"ip":"10.0.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}"}`;
            break;
          default:
            value = "";
        }
        return [column.name, value];
      }),
    ),
  );
}

// ───────────────────────────── Formatting / validation ─────────────────────────────

const number = new Intl.NumberFormat("en-US");

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

/** snake_case identifier: lowercase letters, digits and underscores, starting with a letter. */
export function isSnakeCase(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
