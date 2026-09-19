"use client";
import * as React from "react";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SYSTEM_LABEL, type StepWindow, type StimulusAnalysis, type SystemId } from "@/lib/synforma/analysis/stimulus";

/**
 * Small multiples of a stimulus analysis: one panel per cortical system, the
 * predicted response of an average subject (z-scored by the bridge) against
 * seconds of the recording. Step windows are shaded and titled. One hue for
 * the single series in each panel; neutral surfaces for the bands; nothing
 * about a person is encoded anywhere.
 */

// Palette tokens from app/globals.css (recharts needs literal values).
const INK = "#0b0b0c";
const GRAPHITE = "#3a3a3c";
const SLATE = "#6b6b70";
const LINE = "#e4e2dd";
const SURFACE = "#ffffff";
const SURFACE_2 = "#f3f2ee";
const SURFACE_3 = "#ebe9e3";

interface Point {
  s: number;
  v: number;
}

function stepAt(steps: StepWindow[], s: number): StepWindow | undefined {
  return steps.find((st) => s >= st.startS && s < st.endS);
}

function shortTitle(title: string, max = 18): string {
  return title.length > max ? title.slice(0, max - 1).trimEnd() + "…" : title;
}

function FacetTooltip({ active, payload, label, system, steps }: { active?: boolean; payload?: { payload: Point }[]; label?: number; system: string; steps: StepWindow[] }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  const point = payload[0].payload;
  const step = stepAt(steps, label);
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-ink">{system}</div>
      <div className="mono-data mt-1 text-graphite">
        {label.toFixed(1)} s · predicted response {point.v >= 0 ? "+" : ""}
        {point.v.toFixed(2)} z
      </div>
      <div className="mt-1 text-slate">{step ? `Step window: ${step.title}` : "Outside any step window"}</div>
    </div>
  );
}

export function StimulusChart({ analysis }: { analysis: StimulusAnalysis }) {
  const { sampleS, durationS } = analysis.source;
  const steps = analysis.steps;
  const facets = React.useMemo(
    () =>
      analysis.systems.map((series) => ({
        id: series.id as SystemId,
        label: SYSTEM_LABEL[series.id],
        vertices: series.vertices,
        points: series.values.map((v, i) => ({ s: Number((i * sampleS).toFixed(3)), v })),
      })),
    [analysis.systems, sampleS],
  );
  // One shared y-scale so the panels are comparable; the values are z-scores across the recording.
  const domain = React.useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of analysis.systems) for (const v of s.values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-1, 1];
    const pad = Math.max(0.1, (hi - lo) * 0.05);
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [analysis.systems]);
  const yTicks = React.useMemo(() => (domain[0] < 0 && domain[1] > 0 ? [domain[0], 0, domain[1]] : domain), [domain]);
  const xMax = Math.max(durationS, facets[0]?.points[facets[0].points.length - 1]?.s ?? 0);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="stimulus-chart" data-facets={facets.length}>
        {facets.map((f) => (
          <figure key={f.id} className="rounded-lg border border-line bg-surface p-3" data-system={f.id}>
            <figcaption className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{f.label}</span>
              <span className="mono-data text-[11px] text-slate">{f.vertices.toLocaleString()} vertices</span>
            </figcaption>
            <div className="mt-2 h-[132px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={f.points} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  {steps.map((st, i) => (
                    <ReferenceArea
                      key={`${st.stepId}-${i}`}
                      x1={st.startS}
                      x2={st.endS}
                      fill={i % 2 ? SURFACE_3 : SURFACE_2}
                      fillOpacity={1}
                      stroke="none"
                      ifOverflow="hidden"
                      label={{ value: shortTitle(st.title), position: "insideTopLeft", fontSize: 10, fill: GRAPHITE, offset: 6 }}
                    />
                  ))}
                  <XAxis dataKey="s" type="number" domain={[0, xMax]} tick={{ fontSize: 10, fill: SLATE }} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={(v: number) => `${Math.round(v)}s`} />
                  <YAxis domain={domain} ticks={yTicks} tick={{ fontSize: 10, fill: SLATE }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(0)} width={44} />
                  <Tooltip content={<FacetTooltip system={f.label} steps={steps} />} cursor={{ stroke: LINE, strokeWidth: 1 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="v" stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" dot={false} activeDot={{ r: 4, fill: INK, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate">
        x: seconds of the recording · y: predicted response of an average subject, z-scored across the recording (one scale for all panels)
        {steps.length ? ` · shaded bands: step windows ${steps.map((st, i) => `${i + 1} ${st.title} (${Math.round(st.startS)}–${Math.round(st.endS)} s)`).join(", ")}` : " · no step windows in this file"}.
      </p>
    </div>
  );
}
