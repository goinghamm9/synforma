"use client";
import { useSyncExternalStore } from "react";
import { useSynforma } from "@/lib/synforma/store";

function subscribe(onChange: () => void): () => void {
  const persist = useSynforma.persist;
  if (!persist) return () => {};
  const offFinish = persist.onFinishHydration(onChange);
  const offStart = persist.onHydrate(onChange);
  return () => {
    offFinish();
    offStart();
  };
}

function getSnapshot(): boolean {
  return useSynforma.persist?.hasHydrated() ?? true;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Reactive hydration guard. The persisted store rehydrates after mount, so the
 * server render and the first client render show a skeleton rather than empty
 * data; the component re-renders once hydration finishes.
 */
export function useStoreHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
