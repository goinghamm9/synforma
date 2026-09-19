"use client";
import * as React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { TYPE_LABEL } from "../constants";
import { useMapInteraction } from "./context";
import type { LaidOutNode } from "./layout";
import { FRICTION_KIND_LABEL, nodeTrustText, type FrictionKind, type RunStats } from "./model";

/**
 * Node components for the process map, one shape per Work Graph node type.
 * Every node is a button with an accessible name; the chrome (selection,
 * highlight, dimming, path, trust tone) is driven by data attributes and the
 * classes in process-map.css.
 */

export type MapFlowNode = Node<{ node: LaidOutNode }, "map">;

const MODE_LABEL = { guide: "Guide", assist: "Assist", act: "Act" } as const;

function frictionSummary(r: RunStats): string {
  const parts = (Object.entries(r.friction) as [FrictionKind, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return parts.map(([k, v]) => `${FRICTION_KIND_LABEL[k]} ${v}`).join(", ");
}

function RunBadges({ runs }: { runs: RunStats }) {
  if (!runs.frictionTotal && !runs.regroundings && !runs.dropOffs) return null;
  return (
    <span className="pm-badges" aria-hidden="true">
      {runs.frictionTotal ? (
        <span className="pm-badge pm-badge--friction" data-testid="map-friction" data-count={runs.frictionTotal} title={frictionSummary(runs)}>
          <AlertTriangle className="h-2.5 w-2.5" />
          {runs.frictionTotal}
        </span>
      ) : null}
      {runs.regroundings ? (
        <span className="pm-badge pm-badge--heal" data-testid="map-self-heal" data-count={runs.regroundings} title={`${runs.regroundings} action${runs.regroundings === 1 ? "" : "s"} re-grounded after the interface changed`}>
          <RefreshCw className="h-2.5 w-2.5" />
          {runs.regroundings}
        </span>
      ) : null}
      {runs.dropOffs ? (
        <span className="pm-badge pm-badge--drop" data-testid="map-drop-off" data-count={runs.dropOffs} title={`${runs.dropOffs} run${runs.dropOffs === 1 ? "" : "s"} ended here without completing`}>
          −{runs.dropOffs}
        </span>
      ) : null}
    </span>
  );
}

function runsLine(n: LaidOutNode): string | null {
  const r = n.runs;
  if (!r) return null;
  if (n.type === "outcome") return `${r.completed} completed`;
  if (n.type === "objective" || n.type === "workflow") return `${r.visits} run${r.visits === 1 ? "" : "s"}`;
  const parts = [`${r.visits} run${r.visits === 1 ? "" : "s"}`];
  if (r.medianMs !== null) parts.push(`median ${formatDuration(r.medianMs)}`);
  return parts.join(" · ");
}

function ariaLabelFor(n: LaidOutNode, lens: string): string {
  const parts: string[] = [];
  if (n.type === "step" && n.stepIndex !== undefined) parts.push(`Step ${n.stepIndex + 1}: ${n.label}`);
  else parts.push(`${n.dialog ? "Dialog" : TYPE_LABEL[n.type].one}: ${n.label}`);
  if (n.mode) parts.push(MODE_LABEL[n.mode]);
  if (n.route) parts.push(n.route);
  const rl = runsLine(n);
  if (rl) parts.push(rl);
  if (n.runs?.frictionTotal) parts.push(`${n.runs.frictionTotal} friction events`);
  if (n.runs?.regroundings) parts.push(`${n.runs.regroundings} self-healed`);
  if (lens === "evidence") parts.push(nodeTrustText(n));
  return parts.join(", ");
}

function Content({ n, lens }: { n: LaidOutNode; lens: string }) {
  const rl = lens === "runs" ? runsLine(n) : null;
  const tone = lens === "evidence" ? <span className="pm-tone">{nodeTrustText(n)}</span> : null;
  switch (n.type) {
    case "step":
      return (
        <>
          <span className="pm-step-num" aria-hidden="true">
            {n.stepIndex !== undefined ? n.stepIndex + 1 : "·"}
          </span>
          <span className="pm-body">
            <span className="pm-title pm-title--2">{n.label}</span>
            <span className="pm-meta">
              {n.mode ? <span className={cn("pm-chip", `pm-chip--${n.mode}`)}>{MODE_LABEL[n.mode]}</span> : null}
              {n.commit ? <span className="pm-meta-item">commits</span> : null}
              {n.judgment ? <span className="pm-meta-item">judgment</span> : null}
            </span>
            {rl ? <span className="pm-runs mono-data">{rl}</span> : null}
            {tone}
          </span>
        </>
      );
    case "screen":
      return (
        <span className="pm-body">
          <span className="pm-eyebrow">{n.dialog ? "Dialog" : "Screen"}</span>
          <span className="pm-title">{n.label}</span>
          {n.route ? <span className="pm-route mono-data">{n.route}</span> : null}
          {n.counts && (n.counts.actions || n.counts.fields) ? (
            <span className="pm-meta mono-data" data-testid="map-screen-counts">
              {n.counts.actions} action{n.counts.actions === 1 ? "" : "s"} · {n.counts.fields} field{n.counts.fields === 1 ? "" : "s"}
            </span>
          ) : null}
          {rl ? <span className="pm-runs mono-data">{rl}</span> : null}
          {tone}
        </span>
      );
    case "objective":
    case "outcome":
    case "workflow":
    case "application":
      return (
        <span className="pm-body">
          <span className="pm-eyebrow">{TYPE_LABEL[n.type].one}</span>
          <span className="pm-title pm-title--2">{n.label}</span>
          {n.sublabel ? <span className="pm-sub mono-data">{n.sublabel}</span> : null}
          {rl ? <span className="pm-runs mono-data">{rl}</span> : null}
          {tone}
        </span>
      );
    case "requirement":
      return (
        <span className="pm-body">
          <span className="pm-eyebrow">
            Requirement
            {n.judgment ? <span className="pm-meta-item"> · judgment</span> : null}
          </span>
          <span className="pm-title pm-title--small">{n.label}</span>
          {tone}
        </span>
      );
    default:
      return (
        <span className="pm-body">
          <span className="pm-eyebrow">{TYPE_LABEL[n.type].one}</span>
          <span className="pm-title pm-title--small">{n.label}</span>
          {n.sublabel ? <span className="pm-sub">{n.sublabel}</span> : null}
          {tone}
        </span>
      );
  }
}

function MapNodeViewInner({ data }: NodeProps<MapFlowNode>) {
  const n = data.node;
  const { lens, selectedId, highlight, related, setHovered } = useMapInteraction();
  const selected = selectedId === n.id;
  const highlighted = highlight.has(n.id);
  const dimmed = related !== null && !related.has(n.id) && !selected;
  const onEnter = React.useCallback(() => setHovered(n.id), [setHovered, n.id]);
  const onLeave = React.useCallback(() => setHovered(null), [setHovered]);
  return (
    <>
      <Handle type="target" position={Position.Left} id="t-l" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="t-t" isConnectable={false} />
      <Handle type="target" position={Position.Bottom} id="t-b" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="s-r" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="s-b" isConnectable={false} />
      <Handle type="source" position={Position.Top} id="s-t" isConnectable={false} />
      <button
        type="button"
        aria-label={ariaLabelFor(n, lens)}
        aria-pressed={selected}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        className={cn("pm-node", `pm-node--${n.type}`, n.onPath && "is-path", selected && "is-selected", highlighted && "is-highlighted", dimmed && "is-dimmed", lens === "evidence" && `tone-${n.trust}`)}
        style={{ width: n.width, height: n.height }}
        data-testid="map-node"
        data-node-id={n.id}
        data-node-type={n.type}
        data-on-path={n.onPath ? "true" : "false"}
        data-selected={selected ? "true" : "false"}
        data-trust={lens === "evidence" ? n.trust : undefined}
        data-step-index={n.stepIndex !== undefined ? n.stepIndex + 1 : undefined}
        data-visits={n.runs ? n.runs.visits : undefined}
      >
        <Content n={n} lens={lens} />
        {lens === "runs" && n.runs ? <RunBadges runs={n.runs} /> : null}
      </button>
    </>
  );
}

export const MapNodeView = React.memo(MapNodeViewInner);

export const nodeTypes = { map: MapNodeView };
