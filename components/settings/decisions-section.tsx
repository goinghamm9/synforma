"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { ACCEPT_PROBABILITY, deciderLabel, decisionViaLabel } from "@/lib/synforma/decisions";
import { DecisionStatusSchema, type DecisionStatus } from "@/lib/synforma/decisions/protocol";
import { useSynforma } from "@/lib/synforma/store";
import type { SynformaSettings } from "@/lib/synforma/types";
import { cn } from "@/lib/utils";
import { FieldRow, SettingsSection, StatusLine } from "./section";

type Preference = SynformaSettings["decisionPreference"];

const OPTIONS: { value: Preference; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Automatic",
    hint: `Ask the decision model when the lexical rules are unsure which field is which, if the server has credentials. Every question and answer is recorded with its probability; an answer below ${ACCEPT_PROBABILITY} is never acted on.`,
  },
  { value: "off", label: "Off", hint: "Lexical rules only. Runs behave exactly as they do without any credentials." },
];

type Fetch = { state: "loading" } | { state: "ok"; status: DecisionStatus } | { state: "error"; message: string };
type Probe = { state: "idle" } | { state: "running" } | { state: "done"; probe: NonNullable<DecisionStatus["probe"]> } | { state: "error"; message: string };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function DecisionsSection() {
  const preference = useSynforma((s) => s.settings.decisionPreference);
  const setSettings = useSynforma((s) => s.setSettings);
  const [fetch_, setFetch] = useState<Fetch>({ state: "loading" });
  const [probe, setProbe] = useState<Probe>({ state: "idle" });
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${BASE}/api/decide/status`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = DecisionStatusSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("unexpected response shape");
        setFetch({ state: "ok", status: parsed.data });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setFetch({ state: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => controller.abort();
  }, [reloads]);

  const status: DecisionStatus | null = fetch_.state === "ok" ? fetch_.status : null;

  const runProbe = async () => {
    setProbe({ state: "running" });
    try {
      const res = await fetch(`${BASE}/api/decide/status?probe=1`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = DecisionStatusSchema.safeParse(await res.json());
      if (!parsed.success || !parsed.data.probe) throw new Error("unexpected response shape");
      setProbe({ state: "done", probe: parsed.data.probe });
    } catch (e) {
      setProbe({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <SettingsSection
      id="decisions"
      eyebrow="Decisions"
      title="System One decisions"
      lede="When the lexical rules cannot tell which control is which after a vendor update, the runner can put the screen's fields to a decision model (TypeSafe's Jev) as a typed multiple-choice question. The model returns one option with a calibrated probability; it never writes text, never plans and never acts on its own."
    >
      <FieldRow label="Server status" hint="Read from /api/decide/status. The credentials stay on the server.">
        {fetch_.state === "loading" ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : fetch_.state === "error" ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="signal">Unreachable</Badge>
              <span className="text-sm text-graphite">Could not read the decision status ({fetch_.message}).</span>
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setReloads((n) => n + 1)}>
              Retry
            </Button>
          </div>
        ) : status?.configured ? (
          <div data-testid="decisions-status" data-configured="true">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="verdant">Configured</Badge>
              <span className="text-sm text-graphite">{deciderLabel(status)}</span>
            </div>
            <StatusLine>
              Jev via {decisionViaLabel(status.via)}. Questions carry field names, roles, options, help text and the requirement&rsquo;s wording; never a person&rsquo;s typed text. A call that has not answered within 4 s is dropped and the rules decide alone.
            </StatusLine>
          </div>
        ) : (
          <div data-testid="decisions-status" data-configured="false">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">No decision model</Badge>
              <span className="text-sm text-graphite">
                Set <code className="mono-data text-[12px]">CLOUDFLARE_ACCOUNT_ID</code> and <code className="mono-data text-[12px]">CLOUDFLARE_API_TOKEN</code> (Jev on Cloudflare Workers AI) or{" "}
                <code className="mono-data text-[12px]">TYPESAFE_API_KEY</code> (TypeSafe&rsquo;s API) to enable it.
              </span>
            </div>
            <StatusLine>
              Optional: <code className="mono-data text-[12px]">JEV_MODEL</code> overrides the model id; <code className="mono-data text-[12px]">DECISION_PROVIDER</code> pins <code className="mono-data text-[12px]">cloudflare</code> or{" "}
              <code className="mono-data text-[12px]">typesafe</code> when both are set. Restart the server after changing the environment.
            </StatusLine>
          </div>
        )}
      </FieldRow>

      {status?.configured ? (
        <FieldRow label="Test a decision" hint="Asks the model one fixed question (a renamed CRM field) and shows what came back, so the credentials and the route can be checked before a demo.">
          <Button variant="outline" size="sm" onClick={() => void runProbe()} disabled={probe.state === "running"} data-testid="decisions-probe">
            {probe.state === "running" ? "Asking…" : "Ask Jev one question"}
          </Button>
          {probe.state === "done" ? (
            <StatusLine tone={probe.probe.ok ? "verdant" : "signal"}>
              <span data-testid="decisions-probe-result" data-ok={probe.probe.ok ? "true" : "false"}>
                {probe.probe.ok
                  ? `Answered${probe.probe.latencyMs !== undefined ? ` in ${probe.probe.latencyMs} ms` : ""}${probe.probe.route ? ` over the ${probe.probe.route} route` : ""}${probe.probe.model ? ` (${probe.probe.model})` : ""}: ${probe.probe.detail ?? ""}`
                  : `No usable answer${probe.probe.latencyMs !== undefined ? ` after ${probe.probe.latencyMs} ms` : ""}: ${probe.probe.detail ?? "unknown error"}`}
              </span>
            </StatusLine>
          ) : probe.state === "error" ? (
            <StatusLine tone="signal">Could not run the test ({probe.message}).</StatusLine>
          ) : null}
        </FieldRow>
      ) : null}

      <FieldRow label="Preference" hint="Whether runs started in this browser may consult the decision model.">
        <fieldset>
          <legend className="sr-only">Decision model preference</legend>
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {OPTIONS.map((o) => {
              const checked = preference === o.value;
              return (
                <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 p-3.5 transition-colors hover:bg-surface-2", checked && "bg-surface-2/70")}>
                  <input type="radio" name="decisionPreference" value={o.value} checked={checked} onChange={() => setSettings({ decisionPreference: o.value })} className="mt-0.5 h-4 w-4 accent-ink" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-slate">{o.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {status ? (
          <StatusLine tone={preference === "auto" && !status.configured ? "muted" : "muted"}>
            Effective right now: <span className="font-medium text-ink">{preference === "off" ? "lexical rules only (by preference)" : status.configured ? deciderLabel(status) : "lexical rules only (no credentials on the server)"}</span>.
          </StatusLine>
        ) : null}
      </FieldRow>
    </SettingsSection>
  );
}
