import type { IframeDriver } from "../interaction/driver";
import type { Action, ActionClass, LedgerEntry, PageModel, RunActor, PlannerKind } from "../types";
import { shortId } from "@/lib/utils";

/**
 * Provenance + rollback ledger — git history for enterprise work.
 *
 * Every action Synforma performs records who requested it, what Synforma
 * believed the intent was, what it relied on, who decided, the before and
 * after state, the approval status and whether it can be undone.
 */

export interface LedgerDraft {
  runId: string;
  programId: string;
  stepId: string;
  requestedBy: RunActor;
  intent: string;
  reliedOn: string[];
  decidedBy: PlannerKind | "rule";
  actionClass: ActionClass;
  action: Action;
  before?: { key: string; value: string };
  after?: { key: string; value: string };
  approval: LedgerEntry["approval"];
  result: LedgerEntry["result"];
  regrounded?: boolean;
}

export function fieldValue(page: PageModel | null | undefined, key: string | undefined): string | undefined {
  if (!page || !key) return undefined;
  const f = page.fields.find((x) => x.key === key);
  if (!f) return undefined;
  if (f.role === "checkbox" || f.role === "switch") return f.checked ? "checked" : "unchecked";
  return f.value ?? "";
}

export function makeLedgerEntry(d: LedgerDraft): LedgerEntry {
  const reversible = d.action.kind === "type" || d.action.kind === "select" || d.action.kind === "check";
  const rollback: LedgerEntry["rollback"] = reversible
    ? { possible: d.before !== undefined, method: "restore_value", reason: d.before === undefined ? "previous value not captured" : undefined }
    : d.action.kind === "expand" || d.action.kind === "navigate" || d.action.kind === "wait"
      ? { possible: false, method: "none", reason: "no state change to reverse" }
      : d.actionClass === "C_consequential_write" || d.actionClass === "D_external_or_destructive"
        ? { possible: false, method: "compensating_action", reason: "requires a compensating action in the target system (not available in the sandbox)" }
        : { possible: false, method: "none", reason: "navigation-only click" };
  return {
    id: shortId("ldg"),
    runId: d.runId,
    programId: d.programId,
    stepId: d.stepId,
    t: Date.now(),
    requestedBy: d.requestedBy,
    intent: d.intent,
    reliedOn: d.reliedOn,
    decidedBy: d.decidedBy,
    actionClass: d.actionClass,
    action: { kind: d.action.kind, label: d.action.label, targetName: d.action.targetName, targetRole: d.action.targetRole },
    before: d.before,
    after: d.after,
    approval: d.approval,
    result: d.result,
    regrounded: d.regrounded,
    rollback,
  };
}

const BACK_RE = /^(back|previous)\b/i;

/** Bring a field back on screen by stepping back through a wizard (never forward, never a commit). */
async function locateField(driver: IframeDriver, key: string, name?: string): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const snap = driver.snapshot();
    if (snap.elements.has(key) || (name && snap.page.fields.some((f) => f.name === name))) return true;
    const back = snap.page.actions.find((a) => a.role === "button" && BACK_RE.test(a.name) && !a.commit && !a.disabled);
    if (!back) return false;
    const r = await driver.perform({ kind: "click", target: back.key, targetName: back.name, targetRole: "button", targetCommit: false, label: `Undo: go back via ${back.name}` });
    if (!r.ok) return false;
  }
  return false;
}

/** Undo reversible entries (newest first) by restoring the previous value in the live interface. */
export async function rollbackEntries(driver: IframeDriver, entries: LedgerEntry[]): Promise<{ restored: LedgerEntry[]; skipped: LedgerEntry[] }> {
  const restored: LedgerEntry[] = [];
  const skipped: LedgerEntry[] = [];
  const ordered = [...entries].filter((e) => !e.rolledBackAt).sort((a, b) => b.t - a.t);
  for (const e of ordered) {
    if (!e.rollback.possible || !e.before) {
      skipped.push(e);
      continue;
    }
    if (!(await locateField(driver, e.before.key, e.action.targetName))) {
      skipped.push(e);
      continue;
    }
    const kind = e.action.kind;
    const value = e.before.value;
    const action: Action = {
      kind: kind === "check" ? "check" : kind === "select" ? "select" : "type",
      target: e.before.key,
      targetName: e.action.targetName,
      targetRole: e.action.targetRole,
      value: kind === "check" ? (value === "checked" ? "true" : "false") : value,
      label: `Undo: restore ${e.action.targetName ?? e.before.key}`,
    };
    driver.snapshot();
    const r = await driver.perform(action);
    if (r.ok) {
      e.rolledBackAt = Date.now();
      restored.push(e);
    } else skipped.push(e);
  }
  return { restored, skipped };
}
