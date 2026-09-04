"use client";
import * as React from "react";
import { AlertCircle, CheckCircle2, CircleDashed, Hand, MousePointerClick, Sparkle, XCircle } from "lucide-react";
import { Badge, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ExecutionMode, RunOutcome } from "@/lib/synforma/types";
import { MODE_LABEL, OUTCOME_LABEL, type LogLine, type LogLevel } from "./types";

/** Small shared pieces used by several phase panels. */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

export function PanelHeader({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="display mt-1 text-xl text-ink">{title}</h2>
        {description ? <p className="mt-1.5 text-sm leading-relaxed text-graphite">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "ink", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ink" | "verdant" | "amber" | "signal" | "slate"; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface px-3 py-2.5", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate">{label}</div>
      <div
        className={cn(
          "mono-data mt-1 text-lg leading-none",
          tone === "ink" && "text-ink",
          tone === "verdant" && "text-verdant",
          tone === "amber" && "text-amber",
          tone === "signal" && "text-signal",
          tone === "slate" && "text-slate",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-slate">{hint}</div> : null}
    </div>
  );
}

export function ModeBadge({ mode, className }: { mode: ExecutionMode; className?: string }) {
  const Icon = mode === "guide" ? Hand : mode === "assist" ? Sparkle : MousePointerClick;
  return (
    <Badge variant={mode === "act" ? "default" : mode === "assist" ? "outline" : "muted"} className={className}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {MODE_LABEL[mode]}
    </Badge>
  );
}

export function OutcomeBadge({ outcome }: { outcome?: RunOutcome }) {
  if (!outcome)
    return (
      <Badge variant="muted">
        <CircleDashed className="h-3 w-3" aria-hidden="true" />
        In progress
      </Badge>
    );
  if (outcome === "completed")
    return (
      <Badge variant="verdant">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {OUTCOME_LABEL[outcome]}
      </Badge>
    );
  if (outcome === "abandoned")
    return (
      <Badge variant="amber">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        {OUTCOME_LABEL[outcome]}
      </Badge>
    );
  return (
    <Badge variant="signal">
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {OUTCOME_LABEL[outcome]}
    </Badge>
  );
}

export function ActorBadge({ actor, persona }: { actor: "agent" | "human" | "synthetic"; persona?: string }) {
  if (actor === "synthetic")
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge variant="amber">Synthetic · simulation</Badge>
        {persona ? <span className="text-xs text-graphite">{persona}</span> : null}
      </span>
    );
  if (actor === "human")
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge variant="outline">Human</Badge>
        {persona ? <span className="text-xs text-graphite">{persona}</span> : null}
      </span>
    );
  return <Badge variant="default">Agent</Badge>;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="dot-paper flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      {Icon ? <Icon className="mb-3 h-5 w-5 text-slate" /> : null}
      <div className="text-sm font-medium text-ink">{title}</div>
      {body ? <div className="mt-1 max-w-sm text-sm text-slate">{body}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ title, body, action }: { title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-signal/30 bg-signal-soft px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        {body ? <div className="mt-0.5 text-sm text-graphite">{body}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function Note({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "verdant" }) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-relaxed",
        tone === "slate" && "border-line bg-surface-2 text-graphite",
        tone === "amber" && "border-amber/20 bg-amber-soft text-amber",
        tone === "verdant" && "border-verdant/20 bg-verdant-soft text-verdant",
      )}
    >
      {children}
    </p>
  );
}

const LEVEL_CLASS: Record<LogLevel, string> = {
  info: "text-graphite",
  warn: "text-amber",
  action: "text-ink",
  heal: "bg-verdant-soft text-verdant",
  approval: "bg-amber-soft text-amber",
  done: "text-verdant",
};

/** Streaming log with auto-scroll while the user is near the bottom. */
export function LogView({ lines, height = 220, emptyText = "Nothing yet.", className }: { lines: LogLine[]; height?: number; emptyText?: string; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className={cn("scrollbar-thin overflow-y-auto rounded-lg border border-line bg-surface font-mono text-[11.5px] leading-5", className)}
      style={{ height }}
      aria-live="polite"
    >
      {lines.length === 0 ? (
        <div className="px-3 py-2 text-slate">{emptyText}</div>
      ) : (
        <ol className="px-2 py-1.5">
          {lines.map((l) => (
            <li key={l.id} className={cn("flex gap-2 rounded px-1", LEVEL_CLASS[l.level])}>
              <span className="shrink-0 tabular-nums text-mist">{new Date(l.t).toLocaleTimeString([], { hour12: false })}</span>
              <span className="min-w-0 break-words">{l.message}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-40" />
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map((it) => (
        <React.Fragment key={it.label}>
          <dt className="text-slate">{it.label}</dt>
          <dd className="min-w-0 break-words text-ink">{it.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
