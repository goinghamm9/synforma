"use client";
import * as React from "react";
import type { EdgeType, GraphNode, NodeType, WorkGraph } from "@/lib/synforma/types";
import { neighbors } from "@/lib/synforma/graph/work-graph";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EDGE_LABEL, NODE_RADIUS, STATUS_LABEL, TYPE_LABEL } from "./constants";

/** Keys shown first, per node type. Everything else follows in data order. */
const PREFERRED_KEYS: Partial<Record<NodeType, string[]>> = {
  screen: ["route", "url", "dialog", "fields", "actions"],
  field: ["role", "inputType", "options", "required", "region", "revealedBy", "key"],
  action: ["role", "commit", "menu", "disclosure", "pattern", "href", "region", "key"],
  object: ["attributes", "rows"],
  step: ["mode", "commit", "judgment"],
  workflow: ["steps"],
  requirement: ["kind", "judgment"],
  application: ["baseUrl"],
  intervention: ["technique", "status"],
};

const HIDDEN_KEYS = new Set(["fingerprint", "path", "screen", "menuKey"]);

const KEY_LABEL: Record<string, string> = {
  route: "Route",
  url: "URL",
  inputType: "Input type",
  revealedBy: "Revealed by",
  baseUrl: "Base URL",
  commit: "Commits data",
  judgment: "Needs judgment",
  mode: "Mode",
  rows: "Rows",
  attributes: "Attributes",
  options: "Options",
  required: "Required",
  region: "Region",
  role: "Role",
  href: "Href",
  pattern: "Route pattern",
  menu: "Menu",
  disclosure: "Disclosure",
  steps: "Steps",
  kind: "Kind",
  fields: "Fields",
  actions: "Actions",
  dialog: "Dialog",
  key: "Semantic key",
  technique: "Technique",
  status: "Status",
};

function humanize(key: string): string {
  return KEY_LABEL[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return v.trim() ? v : null;
  if (Array.isArray(v)) {
    const items = v.map((x) => (typeof x === "string" ? x : formatValue(x) ?? "")).filter(Boolean);
    if (!items.length) return null;
    return items.length > 8 ? `${items.slice(0, 8).join(", ")} … (+${items.length - 8})` : items.join(", ");
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return o.role ? `${o.name} (${String(o.role)})` : o.name;
    const s = JSON.stringify(o);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  }
  return String(v);
}

export function describeNodeData(node: GraphNode): { key: string; label: string; value: string }[] {
  const data = node.data ?? {};
  const preferred = PREFERRED_KEYS[node.type] ?? [];
  const keys = [...preferred.filter((k) => k in data), ...Object.keys(data).filter((k) => !preferred.includes(k))];
  const out: { key: string; label: string; value: string }[] = [];
  for (const key of keys) {
    if (HIDDEN_KEYS.has(key)) continue;
    const value = formatValue(data[key]);
    if (value === null) continue;
    out.push({ key, label: humanize(key), value });
    if (out.length >= 12) break;
  }
  return out;
}

function statusVariant(status: GraphNode["status"]): "outline" | "amber" | "verdant" {
  return status === "hypothesis" ? "amber" : status === "confirmed" ? "verdant" : "outline";
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export interface NodeDetailProps {
  graph: WorkGraph;
  node: GraphNode;
  onSelect: (id: string) => void;
  className?: string;
}

export function NodeDetail({ graph, node, onSelect, className }: NodeDetailProps) {
  const data = React.useMemo(() => describeNodeData(node), [node]);
  const groups = React.useMemo(() => {
    const map = new Map<string, { edgeType: EdgeType; direction: "out" | "in"; title: string; items: { node: GraphNode; label?: string }[] }>();
    for (const nb of neighbors(graph, node.id)) {
      const key = `${nb.edge.type}:${nb.direction}`;
      const existing = map.get(key);
      const item = { node: nb.node, label: nb.edge.label };
      if (existing) existing.items.push(item);
      else map.set(key, { edgeType: nb.edge.type, direction: nb.direction, title: EDGE_LABEL[nb.edge.type][nb.direction], items: [item] });
    }
    return [...map.values()].sort((a, b) => (a.direction === b.direction ? b.items.length - a.items.length : a.direction === "out" ? -1 : 1));
  }, [graph, node.id]);
  const confidence = Math.max(0, Math.min(1, Number.isFinite(node.confidence) ? node.confidence : 0));

  return (
    <div className={cn("flex flex-col", className)} data-testid="node-detail">
      <div className="border-b border-line px-5 py-4">
        <p className="eyebrow">{TYPE_LABEL[node.type].one}</p>
        <h2 className="mt-1 text-base font-medium leading-snug text-ink">{node.label}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(node.status)}>{STATUS_LABEL[node.status]}</Badge>
          <span className="mono-data truncate text-[11px] text-mist" title={node.id}>
            {node.id}
          </span>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-slate">
            <span>Confidence</span>
            <span className="mono-data">{Math.round(confidence * 100)}%</span>
          </div>
          <div className="mt-1.5 h-px w-full bg-line-strong" role="progressbar" aria-valuenow={Math.round(confidence * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
            <div className="-mt-px h-[3px] bg-ink transition-[width] duration-500 ease-out" style={{ width: `${confidence * 100}%` }} />
          </div>
        </div>
        {node.description ? <p className="mt-4 text-sm leading-relaxed text-graphite">{node.description}</p> : null}
      </div>

      {data.length ? (
        <div className="border-b border-line px-5 py-4">
          <p className="eyebrow">Data</p>
          <dl className="mt-2 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
            {data.map((d) => (
              <React.Fragment key={d.key}>
                <dt className="truncate text-slate">{d.label}</dt>
                <dd className="mono-data break-words text-ink">{d.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Neighbours</p>
          <span className="mono-data text-[11px] text-slate">{groups.reduce((n, g) => n + g.items.length, 0)}</span>
        </div>
        {groups.length ? (
          <div className="mt-2 space-y-3">
            {groups.map((g) => (
              <div key={`${g.edgeType}:${g.direction}`}>
                <p className="flex items-baseline gap-2 text-[11px] font-medium text-graphite">
                  {g.title}
                  <span className="mono-data font-normal text-mist">{g.items.length}</span>
                </p>
                <ul className="mt-1 space-y-px">
                  {g.items.map((it) => (
                    <li key={it.node.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(it.node.id)}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-ink transition-colors hover:bg-surface-2 cursor-pointer"
                      >
                        <span
                          aria-hidden="true"
                          className={cn("inline-block shrink-0 rounded-full", it.node.status === "hypothesis" ? "border border-amber/70" : it.node.status === "confirmed" ? "bg-ink" : "bg-graphite")}
                          style={{ width: 5 + NODE_RADIUS[it.node.type] * 10, height: 5 + NODE_RADIUS[it.node.type] * 10, background: it.node.status === "hypothesis" ? "#e4dac2" : undefined }}
                        />
                        <span className="min-w-0 flex-1 truncate">{it.node.label}</span>
                        <span className="shrink-0 text-[10px] text-mist">{it.label ?? TYPE_LABEL[it.node.type].one}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate">No edges yet.</p>
        )}
      </div>

      <p className="mt-auto border-t border-line px-5 py-3 text-[11px] text-mist">
        {node.status === "hypothesis" ? "Current hypothesis" : "Observed"} · {DATE_FMT.format(new Date(node.discoveredAt))}
      </p>
    </div>
  );
}

export function NodeDetailEmpty({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col px-5 py-4", className)} data-testid="node-detail-empty">
      <p className="eyebrow">Selection</p>
      <p className="mt-2 text-sm text-graphite">Select a node to read what Synforma observed about it.</p>
      <ul className="mt-4 space-y-1.5 text-xs text-slate">
        <li>Drag to orbit, scroll to zoom, right-drag to pan.</li>
        <li>Hover a node for its label; click to inspect its neighbours.</li>
        <li>Press Escape or click empty space to clear the selection.</li>
      </ul>
    </div>
  );
}
