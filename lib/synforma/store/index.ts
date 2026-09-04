"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ApprovalRequest,
  AuditEntry,
  Hypothesis,
  Intervention,
  ProficiencyState,
  Program,
  Run,
  RunEvent,
  StruggleSignal,
  SynformaSettings,
  WorkGraph,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import type { DiscoveredState } from "../engine/explorer";
import { shortId } from "@/lib/utils";

/**
 * Local persistence for the prototype. All state lives in the browser
 * (localStorage) so the demo runs with zero infrastructure. The shape mirrors
 * the tables a Postgres deployment would use; see docs/ARCHITECTURE.md.
 */

const MAX_EVENTS = 6000;

export interface SynformaState {
  programs: Record<string, Program>;
  graphs: Record<string, WorkGraph>;
  discoveries: Record<string, DiscoveredState[]>;
  runs: Record<string, Run>;
  events: RunEvent[];
  signals: StruggleSignal[];
  hypotheses: Record<string, Hypothesis>;
  interventions: Record<string, Intervention>;
  audit: AuditEntry[];
  approvals: Record<string, ApprovalRequest>;
  /** Keyed by `${programId}/${stepId}`. */
  proficiency: Record<string, ProficiencyState>;
  settings: SynformaSettings;
  activeProgramId: string | null;

  setProficiency: (p: ProficiencyState) => void;
  upsertProgram: (p: Program) => void;
  setActiveProgram: (id: string | null) => void;
  saveGraph: (g: WorkGraph) => void;
  saveDiscovery: (programId: string, states: DiscoveredState[]) => void;
  addRun: (r: Run) => void;
  updateRun: (id: string, patch: Partial<Run>) => void;
  addEvent: (e: Omit<RunEvent, "id" | "t"> & { t?: number }) => RunEvent;
  addSignal: (s: Omit<StruggleSignal, "id">) => StruggleSignal;
  addHypothesis: (h: Hypothesis) => void;
  upsertIntervention: (i: Intervention) => void;
  addAudit: (a: Omit<AuditEntry, "id" | "t"> & { t?: number }) => AuditEntry;
  addApproval: (a: ApprovalRequest) => void;
  decideApproval: (id: string, decision: "granted" | "denied") => void;
  setSettings: (patch: Partial<SynformaSettings>) => void;
  deleteProgram: (id: string) => void;
  resetAll: () => void;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

const empty = () => ({
  programs: {},
  graphs: {},
  discoveries: {},
  runs: {},
  events: [] as RunEvent[],
  signals: [] as StruggleSignal[],
  hypotheses: {},
  interventions: {},
  audit: [] as AuditEntry[],
  approvals: {},
  proficiency: {} as Record<string, ProficiencyState>,
  settings: DEFAULT_SETTINGS,
  activeProgramId: null as string | null,
});

export const useSynforma = create<SynformaState>()(
  persist(
    (set, get) => ({
      ...empty(),
      setProficiency: (p) => set((s) => ({ proficiency: { ...s.proficiency, [`${p.programId}/${p.stepId}`]: p } })),
      upsertProgram: (p) => set((s) => ({ programs: { ...s.programs, [p.id]: { ...p, updatedAt: Date.now() } } })),
      setActiveProgram: (id) => set({ activeProgramId: id }),
      saveGraph: (g) => set((s) => ({ graphs: { ...s.graphs, [g.id]: { ...g, nodes: g.nodes.map((n) => ({ ...n })), edges: g.edges.map((e) => ({ ...e })) } } })),
      saveDiscovery: (programId, states) =>
        set((s) => ({ discoveries: { ...s.discoveries, [programId]: states.map((st) => ({ ...st, page: { ...st.page, elements: st.page.elements.map((e) => ({ ...e, rect: undefined })) , fields: st.page.fields.map((e) => ({ ...e, rect: undefined })), actions: st.page.actions.map((e) => ({ ...e, rect: undefined })) } })) } })),
      addRun: (r) => set((s) => ({ runs: { ...s.runs, [r.id]: r } })),
      updateRun: (id, patch) => set((s) => (s.runs[id] ? { runs: { ...s.runs, [id]: { ...s.runs[id], ...patch } } } : {})),
      addEvent: (e) => {
        const ev: RunEvent = { ...e, id: shortId("ev"), t: e.t ?? Date.now() };
        set((s) => {
          const events = s.events.length >= MAX_EVENTS ? [...s.events.slice(s.events.length - MAX_EVENTS + 1), ev] : [...s.events, ev];
          return { events };
        });
        return ev;
      },
      addSignal: (sg) => {
        const signal: StruggleSignal = { ...sg, id: shortId("sig") };
        set((s) => ({ signals: [...s.signals, signal] }));
        return signal;
      },
      addHypothesis: (h) => set((s) => ({ hypotheses: { ...s.hypotheses, [h.id]: h } })),
      upsertIntervention: (i) => set((s) => ({ interventions: { ...s.interventions, [i.id]: i } })),
      addAudit: (a) => {
        const entry: AuditEntry = { ...a, id: shortId("aud"), t: a.t ?? Date.now() };
        set((s) => ({ audit: [...s.audit.slice(-1999), entry] }));
        return entry;
      },
      addApproval: (a) => set((s) => ({ approvals: { ...s.approvals, [a.id]: a } })),
      decideApproval: (id, decision) => set((s) => (s.approvals[id] ? { approvals: { ...s.approvals, [id]: { ...s.approvals[id], decision, decidedAt: Date.now() } } } : {})),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      deleteProgram: (id) =>
        set((s) => {
          const programs = { ...s.programs };
          const program = programs[id];
          delete programs[id];
          const graphs = { ...s.graphs };
          if (program) delete graphs[program.graphId];
          const discoveries = { ...s.discoveries };
          delete discoveries[id];
          const runIds = new Set(Object.values(s.runs).filter((r) => r.programId === id).map((r) => r.id));
          const runs = Object.fromEntries(Object.entries(s.runs).filter(([, r]) => r.programId !== id));
          const events = s.events.filter((e) => !runIds.has(e.runId));
          const signals = s.signals.filter((sg) => !runIds.has(sg.runId));
          const hypotheses = Object.fromEntries(Object.entries(s.hypotheses).filter(([, h]) => h.programId !== id));
          const interventions = Object.fromEntries(Object.entries(s.interventions).filter(([, i]) => i.programId !== id));
          const approvals = Object.fromEntries(Object.entries(s.approvals).filter(([, a]) => !runIds.has(a.runId)));
          const proficiency = Object.fromEntries(Object.entries(s.proficiency).filter(([, p]) => p.programId !== id));
          return { programs, graphs, discoveries, runs, events, signals, hypotheses, interventions, approvals, proficiency, activeProgramId: s.activeProgramId === id ? null : s.activeProgramId };
        }),
      resetAll: () => set(empty()),
      exportJSON: () => {
        const s = get();
        const { programs, graphs, discoveries, runs, events, signals, hypotheses, interventions, audit, approvals, proficiency, settings } = s;
        return JSON.stringify({ exportedAt: new Date().toISOString(), programs, graphs, discoveries, runs, events, signals, hypotheses, interventions, audit, approvals, proficiency, settings }, null, 2);
      },
      importJSON: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data || typeof data !== "object" || !data.programs) return false;
          set({ ...empty(), ...data, activeProgramId: Object.keys(data.programs)[0] ?? null });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "synforma-store-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        programs: s.programs,
        graphs: s.graphs,
        discoveries: s.discoveries,
        runs: s.runs,
        events: s.events,
        signals: s.signals,
        hypotheses: s.hypotheses,
        interventions: s.interventions,
        audit: s.audit,
        approvals: s.approvals,
        proficiency: s.proficiency,
        settings: s.settings,
        activeProgramId: s.activeProgramId,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<SynformaState>), settings: { ...DEFAULT_SETTINGS, ...((persisted as Partial<SynformaState>)?.settings ?? {}) } }),
    },
  ),
);

// ─────────────── selectors ───────────────

export const selectActiveProgram = (s: SynformaState) => (s.activeProgramId ? s.programs[s.activeProgramId] ?? null : null);
export const selectRunsForProgram = (programId: string) => (s: SynformaState) => Object.values(s.runs).filter((r) => r.programId === programId).sort((a, b) => a.startedAt - b.startedAt);
export const selectEventsForRun = (runId: string) => (s: SynformaState) => s.events.filter((e) => e.runId === runId);
export const selectInterventionsForProgram = (programId: string) => (s: SynformaState) => Object.values(s.interventions).filter((i) => i.programId === programId);

/** Hydration guard: zustand persist rehydrates after mount. */
export function useHydrated(): boolean {
  return useSynforma.persist?.hasHydrated?.() ?? true;
}
