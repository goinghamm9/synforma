"use client";
import { useSyncExternalStore } from "react";
import { Skeleton } from "@/components/ui";
import { useSynforma } from "@/lib/synforma/store";
import { AboutSection } from "./about-section";
import { DataSection } from "./data-section";
import { ObservationSection } from "./observation-section";
import { PlannerSection } from "./planner-section";

const CONTENTS: { id: string; label: string }[] = [
  { id: "planner", label: "Planner" },
  { id: "observation", label: "Observation" },
  { id: "data", label: "Data" },
  { id: "about", label: "About this prototype" },
];

/** True once the persisted store has rehydrated on the client; false during SSR and the first client render. */
function useStoreReady(): boolean {
  return useSyncExternalStore(
    (onChange) => useSynforma.persist.onFinishHydration(onChange),
    () => useSynforma.persist.hasHydrated(),
    () => false,
  );
}

export function SettingsView() {
  const ready = useStoreReady();
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="display mt-5 text-balance text-4xl text-ink sm:text-5xl">Settings</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-graphite">Planner, observation thresholds, experiment split, and the data this browser holds. Changes save immediately.</p>
        <nav aria-label="Contents" className="mt-6">
          <ol className="flex flex-wrap gap-x-5 gap-y-2">
            {CONTENTS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="inline-flex items-baseline gap-2 text-sm text-graphite transition-colors hover:text-ink">
                  <span className="mono-data text-xs text-mist">{String(i + 1).padStart(2, "0")}</span>
                  {c.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <div className="mt-12 space-y-12 sm:mt-14 sm:space-y-14">
        {ready ? (
          <>
            <PlannerSection />
            <ObservationSection />
            <DataSection />
          </>
        ) : (
          <div aria-busy="true" aria-label="Loading settings" className="space-y-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-t border-line pt-8">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-4 h-7 w-56" />
                <Skeleton className="mt-3 h-4 w-full max-w-xl" />
                <div className="mt-6 space-y-5">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}
        <AboutSection />
      </div>
    </div>
  );
}
