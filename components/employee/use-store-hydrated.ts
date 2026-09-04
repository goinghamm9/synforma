"use client";
import { useSyncExternalStore } from "react";
import { useSynforma } from "@/lib/synforma/store";

/**
 * Reactive hydration guard. zustand's persist middleware rehydrates from
 * localStorage after mount; this subscribes to the finish event so the page
 * re-renders once the stored programs are available (SSR snapshot is false).
 */
const subscribe = (onChange: () => void) => useSynforma.persist.onFinishHydration(onChange);
const getSnapshot = () => useSynforma.persist.hasHydrated();
const getServerSnapshot = () => false;

export function useStoreHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
