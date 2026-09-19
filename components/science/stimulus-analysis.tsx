"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { useStoreHydrated } from "@/components/demo/use-store-hydrated";
import { DISCLAIMER, SYSTEM_LABEL, parseStimulusAnalysis, stepTable, type StimulusAnalysis, type SystemId } from "@/lib/synforma/analysis/stimulus";
import { useSynforma } from "@/lib/synforma/store";
import { cn, formatDuration } from "@/lib/utils";
import { ClaimTag, Prose } from "./shell";

const StimulusChart = dynamic(() => import("./stimulus-chart").then((m) => m.StimulusChart), { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> });

/** The bridge's command line, shown in the empty state and the docs. */
export const BRIDGE_CLI = "python -m tribe_bridge.analyze --video run.webm --steps run-steps.json --out analysis.json";

const EMPTY_ANALYSES: Record<string, StimulusAnalysis> = {};

function signed(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function EmptyState() {
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Record",
      body: (
        <>
          In Mission Control&rsquo;s advanced view, open the Act phase and choose <em>Record screen</em> before running the workflow. Stopping the recording downloads <code className="mono-data text-[12px]">synforma-run-&lt;runId&gt;.webm</code> and{" "}
          <code className="mono-data text-[12px]">synforma-run-&lt;runId&gt;-steps.json</code>. Nothing leaves your computer.
        </>
      ),
    },
    {
      title: "Analyse offline",
      body: (
        <>
          Run the bridge in <code className="mono-data text-[12px]">services/tribe-bridge</code> on that recording. It loads TRIBE v2, predicts the average subject&rsquo;s cortical response per sample and aggregates it into six systems:
          <code className="mono-data mt-2 block overflow-x-auto whitespace-pre rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-ink" data-testid="stimulus-cli">
            {BRIDGE_CLI}
          </code>
        </>
      ),
    },
    { title: "Import", body: <>Choose the resulting JSON above. It is validated against the contract in <code className="mono-data text-[12px]">lib/synforma/analysis/stimulus.ts</code> and stored in this browser only.</> },
  ];
  return (
    <div className="dot-paper rounded-lg border border-dashed border-line-strong p-5 sm:p-6" data-testid="stimulus-empty">
      <p className="text-sm font-medium text-ink">No stimulus analysis imported yet</p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="mono-data text-xs text-mist">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-sm font-medium text-ink">{s.title}</span>
            </div>
            <div className="mt-1.5 text-[13px] leading-relaxed text-graphite">{s.body}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AnalysisRow({ analysis, selected, programTitle, onSelect, onRemove }: { analysis: StimulusAnalysis; selected: boolean; programTitle?: string; onSelect: () => void; onRemove: () => void }) {
  const samples = analysis.systems[0]?.values.length ?? 0;
  return (
    <li className={cn("flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors", selected ? "bg-surface-2/70" : "hover:bg-surface-2/40")} data-testid="stimulus-entry" data-analysis-id={analysis.id} data-selected={selected}>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 cursor-pointer text-left" aria-pressed={selected}>
        <p className="truncate text-sm font-medium text-ink">{analysis.source.fileName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate">
          <span className="mono-data">{new Date(analysis.createdAt).toLocaleString([], { hour12: false })}</span>
          <span>·</span>
          <span>
            {analysis.model.name} · <span className="mono-data">{analysis.model.checkpoint}</span>
          </span>
          <span>·</span>
          <span className="mono-data">{formatDuration(analysis.source.durationS * 1000)}</span>
          <span>·</span>
          <span className="mono-data">
            {samples} samples · {analysis.systems.length} systems · {analysis.steps.length} step windows
          </span>
          {analysis.runId ? (
            <>
              <span>·</span>
              <span>
                run <span className="mono-data">{analysis.runId}</span>
              </span>
            </>
          ) : null}
          {analysis.programId ? (
            <>
              <span>·</span>
              <span>
                program {programTitle ? `“${programTitle}”` : <span className="mono-data">{analysis.programId}</span>}
              </span>
            </>
          ) : null}
        </p>
      </button>
      <Button variant="outline" size="sm" onClick={onRemove} data-testid="stimulus-remove">
        <Trash2 aria-hidden="true" />
        Remove
      </Button>
    </li>
  );
}

function StepTable({ analysis }: { analysis: StimulusAnalysis }) {
  const rows = React.useMemo(() => stepTable(analysis), [analysis]);
  const systems = analysis.systems.map((s) => s.id as SystemId);
  if (!rows.length) return <p className="text-sm text-slate">This file carries no step windows, so there is no per-step table.</p>;
  return (
    <Table data-testid="stimulus-step-table">
      <TableHeader>
        <TableRow>
          <TableHead>Step window</TableHead>
          <TableHead className="text-right">Seconds</TableHead>
          {systems.map((id) => (
            <TableHead key={id} className="text-right">
              {SYSTEM_LABEL[id]}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ step, means }, i) => {
          const entries = systems.map((id) => [id, means[id]] as const).filter((e): e is readonly [SystemId, number] => typeof e[1] === "number");
          const highest = entries.length ? entries.reduce((best, e) => (e[1] > best[1] ? e : best))[0] : null;
          return (
            <TableRow key={`${step.stepId}-${i}`} data-testid="stimulus-step-row">
              <TableCell className="max-w-[220px] truncate">
                {i + 1}. {step.title}
              </TableCell>
              <TableCell className="mono-data whitespace-nowrap text-right text-slate">
                {Math.round(step.startS)}–{Math.round(step.endS)}
              </TableCell>
              {systems.map((id) => {
                const m = means[id];
                const top = id === highest;
                return (
                  <TableCell key={id} className={cn("mono-data text-right", top ? "font-medium text-ink" : "text-graphite")} data-highest={top ? "true" : undefined}>
                    {typeof m === "number" ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {signed(m)}
                        {top ? (
                          <Badge variant="outline" className="text-[10px]">
                            highest
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-mist">—</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function StimulusAnalysisPanel() {
  const hydrated = useStoreHydrated();
  const analyses = useSynforma((s) => (hydrated ? s.analyses : EMPTY_ANALYSES));
  const programs = useSynforma((s) => s.programs);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const list = React.useMemo(() => Object.values(analyses).sort((a, b) => b.createdAt - a.createdAt), [analyses]);
  const selected = (selectedId ? analyses[selectedId] : undefined) ?? list[0] ?? null;

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setError(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setError(`${file.name} is not valid JSON.`);
      return;
    }
    const result = parseStimulusAnalysis(data);
    if (!result.ok) {
      setError(`${file.name}: ${result.error}`);
      return;
    }
    useSynforma.getState().addAnalysis(result.analysis);
    setSelectedId(result.analysis.id);
    toast.success("Stimulus analysis imported", { description: `${result.analysis.source.fileName} · ${result.analysis.model.name} · predicted response of an average subject to the screens` });
  }

  function remove(a: StimulusAnalysis) {
    useSynforma.getState().removeAnalysis(a.id);
    if (selectedId === a.id) setSelectedId(null);
    toast("Stimulus analysis removed", { description: a.source.fileName });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ClaimTag tone="outline">Research use</ClaimTag>
        <ClaimTag tone="amber">Model prediction, not a measurement</ClaimTag>
        <span className="text-sm text-slate">TRIBE v2 (Meta FAIR) · CC BY-NC 4.0</span>
      </div>

      <Prose className="mt-5">
        <p>
          A <strong>stimulus analysis</strong> is the predicted response of an average subject&rsquo;s cortex to the screen content a person saw during a Mission Control run. It is a property of the screens, like a readability score: which cortical
          systems a typical viewer is predicted to engage while these screens are on display. It is <strong>not</strong> a measurement of anyone&rsquo;s brain, attention or state; Synforma records no biometrics and infers no traits.
        </p>
        <p>
          It is produced offline. A screen recording of a run, exported from the Act phase with its step windows, is analysed by the bridge in <code className="mono-data text-[13px]">services/tribe-bridge</code> with Meta&rsquo;s TRIBE v2 encoding model, and the
          resulting JSON is imported here. The browser never calls the model. TRIBE v2 is licensed CC BY-NC 4.0, so this feature is for research use.
        </p>
      </Prose>

      <div className="mt-6 rounded-lg border border-amber/30 bg-amber-soft/50 p-4 text-sm leading-relaxed text-ink" role="note" data-testid="stimulus-disclaimer">
        {DISCLAIMER}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a stimulus analysis JSON file"
          data-testid="stimulus-import"
          onChange={(e) => {
            void onFileChosen(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden="true" />
          Import analysis JSON
        </Button>
        <span className="text-[13px] text-slate">Validated against the contract before anything is stored; stored in this browser only.</span>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-signal" data-testid="stimulus-import-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {!hydrated ? (
          <Skeleton className="h-16 w-full" />
        ) : list.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface" data-testid="stimulus-list">
            {list.map((a) => (
              <AnalysisRow key={a.id} analysis={a} selected={selected?.id === a.id} programTitle={a.programId ? programs[a.programId]?.title : undefined} onSelect={() => setSelectedId(a.id)} onRemove={() => remove(a)} />
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </div>

      {hydrated && selected ? (
        <section className="mt-8 space-y-6" data-testid="stimulus-detail" aria-label="Selected stimulus analysis">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-medium text-ink">Predicted response per cortical system</h3>
              <span className="mono-data text-[11px] text-slate">
                {selected.source.fileName} · one sample every {selected.source.sampleS} s · lag correction {selected.source.lagS} s
              </span>
            </div>
            <div className="mt-3">
              <StimulusChart analysis={selected} />
            </div>
          </div>
          <div>
            <h3 className="text-base font-medium text-ink">Mean predicted response per step window</h3>
            <p className="mt-1 text-[13px] text-slate">Average of the samples inside each step window, per system; the highest system in each row is marked. Comparing rows says which screens are predicted to engage which systems more, and nothing about the person who used them.</p>
            <div className="mt-3">
              <StepTable analysis={selected} />
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-slate" data-testid="stimulus-detail-disclaimer">
            {DISCLAIMER}
            {selected.disclaimer !== DISCLAIMER ? <span className="mt-1 block text-amber">The file&rsquo;s own disclaimer text differs from this wording; the wording above is the one that applies.</span> : null}
          </p>
        </section>
      ) : null}
    </div>
  );
}
