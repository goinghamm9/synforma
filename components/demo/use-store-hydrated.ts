"use client";
import { useEffect, useState } from "react";
import { useSynforma } from "@/lib/synforma/store";

/**
 * Reactive hydration guard. The persisted store rehydrates after mount, so the
 * first client render must show a skeleton rather than empty data.
 */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const persist = useSynforma.persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsubscribe = persist.onFinishHydration(() => setHydrated(true));
    return unsubscribe;
  }, []);
  return hydrated;
}
