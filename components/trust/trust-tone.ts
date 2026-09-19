import type { TrustState, TrustDecision, ActionClass } from "@/lib/synforma/types";

export type Tone = "verdant" | "ink" | "graphite" | "amber" | "signal" | "mist";

export function trustTone(t: TrustState): Tone {
  switch (t) {
    case "AUTHORITATIVE_LIVE":
    case "AUTHORITATIVE_METADATA":
      return "verdant";
    case "ORGANIZATION_APPROVED":
      return "ink";
    case "VENDOR_DOCUMENTED":
    case "OBSERVED_HIGH_CONFIDENCE":
      return "graphite";
    case "OBSERVED_LOW_CONFIDENCE":
    case "MODEL_INFERRED":
      return "amber";
    default:
      return "mist";
  }
}

export const DECISION_LABEL: Record<TrustDecision, string> = {
  act: "Act",
  prepare_ask: "Prepare + ask",
  guide: "Guide the person",
  ask: "Ask",
  stop: "Stop",
};

export function decisionTone(d: TrustDecision): Tone {
  switch (d) {
    case "act":
      return "ink";
    case "prepare_ask":
    case "ask":
      return "amber";
    case "guide":
      return "graphite";
    case "stop":
      return "signal";
  }
}

export const CLASS_SHORT: Record<ActionClass, string> = {
  A_read: "A · read",
  B_reversible_write: "B · reversible",
  C_consequential_write: "C · consequential",
  D_external_or_destructive: "D · destructive",
};

export const TONE_CLASS: Record<Tone, string> = {
  verdant: "bg-verdant-soft text-verdant",
  ink: "bg-ink text-paper",
  graphite: "bg-surface-2 text-graphite",
  amber: "bg-amber-soft text-amber",
  signal: "bg-signal-soft text-signal",
  mist: "bg-surface-2 text-mist",
};

export function formatTime(t: number): string {
  const d = new Date(t);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}
