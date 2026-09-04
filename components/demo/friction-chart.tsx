"use client";
import * as React from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StepMetrics } from "@/lib/synforma/types";

/**
 * Per-step friction index (0..1) as a horizontal bar chart. One series, one hue;
 * steps without enough entries render as a light placeholder labeled
 * "insufficient data" rather than a fabricated zero.
 */
interface Row {
  name: string;
  title: string;
  friction: number;
  hasData: boolean;
  entered: number;
  errors: number;
  hesitations: number;
  backtracks: number;
}

function FrictionTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-ink">{row.title}</div>
      {row.hasData ? (
        <div className="mono-data mt-1 text-graphite">friction {Math.round(row.friction * 100)}%</div>
      ) : (
        <div className="mt-1 text-amber">Insufficient data ({row.entered} of 3 entries needed)</div>
      )}
      <div className="mt-1 text-slate">
        {row.entered} entered · {row.errors} errors · {row.hesitations} hesitations · {row.backtracks} backtracks
      </div>
    </div>
  );
}

export function FrictionChart({ steps }: { steps: StepMetrics[] }) {
  const rows: Row[] = steps.map((s, i) => ({
    name: `${i + 1}. ${s.title.length > 22 ? s.title.slice(0, 21) + "…" : s.title}`,
    title: s.title,
    friction: s.friction ?? 0,
    hasData: s.friction !== null,
    entered: s.entered,
    errors: s.errors,
    hesitations: s.hesitations,
    backtracks: s.backtracks,
  }));
  const height = Math.max(120, rows.length * 30 + 24);
  const insufficient = rows.filter((r) => !r.hasData);
  return (
    <div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={8}>
            <XAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "#6b6b70" }} axisLine={{ stroke: "#e4e2dd" }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: "#3a3a3c" }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip content={<FrictionTooltip />} cursor={{ fill: "#f3f2ee" }} />
            <Bar dataKey={(r: Row) => (r.hasData ? r.friction : 1)} isAnimationActive={false} radius={[0, 4, 4, 0]} maxBarSize={18}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.hasData ? "#0b0b0c" : "#f3f2ee"} stroke={r.hasData ? undefined : "#e4e2dd"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {insufficient.length ? (
        <p className="mt-1 text-[11px] text-slate">
          Light bars: insufficient data ({insufficient.length} step{insufficient.length > 1 ? "s" : ""} with fewer than 3 human or synthetic entries).
        </p>
      ) : null}
    </div>
  );
}
