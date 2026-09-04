"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { resolvePlannerKind } from "@/lib/synforma/planner";
import { PlannerStatusSchema, type PlannerStatus } from "@/lib/synforma/planner/protocol";
import { useSynforma } from "@/lib/synforma/store";
import type { SynformaSettings } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { FieldRow, SettingsSection, StatusLine } from "./section";

type Preference = SynformaSettings["plannerPreference"];

const OPTIONS: { value: Preference; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Use Gemini when the server has a key; otherwise the heuristic planner." },
  { value: "heuristic", label: "Heuristic only", hint: "Deterministic and lexical. Runs without any key and behaves the same every time." },
  { value: "gemini", label: "Gemini", hint: "Requires GEMINI_API_KEY on the server. Falls back to the heuristic planner when it is missing." },
];

type Fetch = { state: "loading" } | { state: "ok"; status: PlannerStatus } | { state: "error"; message: string };

export function PlannerSection() {
  const preference = useSynforma((s) => s.settings.plannerPreference);
  const setSettings = useSynforma((s) => s.setSettings);
  const [fetch_, setFetch] = useState<Fetch>({ state: "loading" });
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/planner/status", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = PlannerStatusSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("unexpected response shape");
        setFetch({ state: "ok", status: parsed.data });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setFetch({ state: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => controller.abort();
  }, [reloads]);

  const status: PlannerStatus | null = fetch_.state === "ok" ? fetch_.status : null;
  const effective = status ? resolvePlannerKind(preference, status) : null;

  return (
    <SettingsSection
      id="planner"
      eyebrow="Planner"
      title="Reasoning"
      lede="The planner reads an objective into requirements, matches them to discovered fields, names barriers and phrases assistance. Structure, actions, scoring and citations never come from a language model."
    >
      <FieldRow label="Server status" hint="Read from /api/planner/status. The key, if any, stays on the server.">
        {fetch_.state === "loading" ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : fetch_.state === "error" ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="signal">Unreachable</Badge>
              <span className="text-sm text-graphite">Could not read the planner status ({fetch_.message}).</span>
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setReloads((n) => n + 1)}>
              Retry
            </Button>
          </div>
        ) : status?.configured ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="verdant">Configured</Badge>
              <span className="text-sm text-graphite">
                {status.provider}
                {status.model ? (
                  <>
                    {" "}
                    · <span className="mono-data">{status.model}</span>
                  </>
                ) : null}
              </span>
            </div>
            <StatusLine>Requests are validated against fixed schemas, retried once with a corrective instruction, and otherwise replaced by the heuristic result.</StatusLine>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">Heuristic planner</Badge>
              <span className="text-sm text-graphite">
                Set <code className="mono-data text-[12px]">GEMINI_API_KEY</code> to enable Gemini.
              </span>
            </div>
            <StatusLine>
              Optional: <code className="mono-data text-[12px]">GEMINI_MODEL</code> selects the model (default gemini-2.5-flash). Restart the server after changing the environment.
            </StatusLine>
          </div>
        )}
      </FieldRow>

      <FieldRow label="Preference" hint="Which planner Synforma should use for new programs and new interventions.">
        <fieldset>
          <legend className="sr-only">Planner preference</legend>
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {OPTIONS.map((o) => {
              const checked = preference === o.value;
              return (
                <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 p-3.5 transition-colors hover:bg-surface-2", checked && "bg-surface-2/70")}>
                  <input
                    type="radio"
                    name="plannerPreference"
                    value={o.value}
                    checked={checked}
                    onChange={() => setSettings({ plannerPreference: o.value })}
                    className="mt-0.5 h-4 w-4 accent-ink"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-slate">{o.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {effective ? (
          <StatusLine tone={preference === "gemini" && effective === "heuristic" ? "amber" : "muted"}>
            Effective planner right now: <span className="font-medium text-ink">{effective === "gemini" ? `Gemini${status?.model ? ` (${status.model})` : ""}` : "Heuristic"}</span>
            {preference === "gemini" && effective === "heuristic" ? " — Gemini was requested but no key is configured." : "."}
          </StatusLine>
        ) : null}
      </FieldRow>
    </SettingsSection>
  );
}
