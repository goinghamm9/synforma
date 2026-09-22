"use client";
import { useEffect, useMemo, useState } from "react";
import { createDecider, deciderLabel, fetchDecisionStatus, type DecisionStatus, type RemoteDecider } from "@/lib/synforma/decisions";
import { useSynforma } from "@/lib/synforma/store";

export interface DeciderApi {
  /** What /api/decide/status reported; null until fetched. */
  status: DecisionStatus | null;
  /** The decision model for runs started here; null when the server has no credentials or the person turned decisions off. */
  decider: RemoteDecider | null;
  /** "Jev · Cloudflare Workers AI · typesafe/jev" when configured, else null. */
  label: string | null;
}

export function useDecider(): DeciderApi {
  const preference = useSynforma((s) => s.settings.decisionPreference);
  const [status, setStatus] = useState<DecisionStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDecisionStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const decider = useMemo(() => createDecider(status, preference), [status, preference]);
  const label = status?.configured ? deciderLabel(status) : null;
  return { status, decider, label };
}
