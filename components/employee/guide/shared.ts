"use client";
import { useMemo, useRef, type RefObject } from "react";
import type { HumanObserver } from "@/lib/synforma/engine/observer";
import type { IframeDriver } from "@/lib/synforma/interaction/driver";
import type { AssistancePreference, Intervention, Run, RunEventType, WorkflowStep } from "@/lib/synforma/types";
import type { RunPhase } from "./types";

/**
 * Mutable state shared by the guide-run hooks. Every ref is created once here and
 * handed to the hooks that need it; nothing is duplicated. Hooks destructure the
 * bundle (`const { driverRef } = refs`) and touch `.current` only in callbacks and
 * effects, never during render.
 */
export interface GuideRefs {
  /** The one IframeDriver for the mounted iframe (created lazily by useFrame). */
  driverRef: RefObject<IframeDriver | null>;
  /** At most one HumanObserver per run. */
  observerRef: RefObject<HumanObserver | null>;
  runIdRef: RefObject<string | null>;
  phaseRef: RefObject<RunPhase>;
  currentStepRef: RefObject<WorkflowStep | null>;
  /** The card on screen, if any (cards never stack). */
  interventionRef: RefObject<Intervention | null>;
  /** Step id (or "get_it_done") while Synforma is acting: signals then are not the person's struggle. */
  assistingRef: RefObject<string | null>;
  /** Mirrors the `preference` state for callbacks that must read the latest value. */
  preferenceRef: RefObject<AssistancePreference>;
  /** True once the person asked Synforma to Get It Done in this run. */
  getItDoneRef: RefObject<boolean>;
  /** Step on which the person has already located the target: no ring for a found control. */
  foundRef: RefObject<string | null>;
}

export function useGuideRefs(initialPreference: AssistancePreference): GuideRefs {
  const driverRef = useRef<IframeDriver | null>(null);
  const observerRef = useRef<HumanObserver | null>(null);
  const runIdRef = useRef<string | null>(null);
  const phaseRef = useRef<RunPhase>("idle");
  const currentStepRef = useRef<WorkflowStep | null>(null);
  const interventionRef = useRef<Intervention | null>(null);
  const assistingRef = useRef<string | null>(null);
  const preferenceRef = useRef<AssistancePreference>(initialPreference);
  const getItDoneRef = useRef(false);
  const foundRef = useRef<string | null>(null);
  return useMemo(
    () => ({ driverRef, observerRef, runIdRef, phaseRef, currentStepRef, interventionRef, assistingRef, preferenceRef, getItDoneRef, foundRef }),
    [],
  );
}

/** Write a RunEvent for the current run (no-op outside a run). Defined once in useGuideRun. */
export type RecordEvent = (type: RunEventType, data?: Record<string, unknown>, stepId?: string, message?: string) => void;

/** The current run, read fresh from the store. Defined once in useGuideRun. */
export type CurrentRun = () => Run | null;
