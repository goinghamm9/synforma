"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowUpRight, Play, Search, Square, X } from "lucide-react";
import type { GraphNode, NodeType, Program, WorkGraph } from "@/lib/synforma/types";
import { useSynforma } from "@/lib/synforma/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TYPE_LABEL, TYPE_ORDER } from "./constants";
import { computeIntentPath, type IntentHop } from "./intent-path";
import { NodeDetail, NodeDetailEmpty } from "./node-detail";
import { SAMPLE_GRAPH } from "./sample-graph";

const WorkGraph3D = dynamic(() => import("./work-graph-3d").then((m) => m.WorkGraph3D), {
  ssr: false,
  loading: () => <GraphLoading />,
});

const HOP_MS = 1400;
const SEARCH_HIGHLIGHT_CAP = 12;
const EMPTY_GRAPH: WorkGraph = { id: "none", nodes: [], edges: [], version: 0, updatedAt: 0 };

function GraphLoading() {
  return (
    <div className="dot-paper flex h-full w-full items-center justify-center" data-testid="work-graph-loading">
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-2 text-xs text-slate">
        <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-ink" />
        Preparing the 3D view
      </div>
    </div>
  );
}

function useStoreHydrated(): boolean {
  return React.useSyncExternalStore(
    (onChange) => useSynforma.persist.onFinishHydration(onChange),
    () => useSynforma.persist.hasHydrated(),
    () => false,
  );
}

function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

interface FlowState {
  index: number;
  playing: boolean;
}

export function GraphWorkbench() {
  const hydrated = useStoreHydrated();
  const programs = useSynforma((s) => s.programs);
  const graphs = useSynforma((s) => s.graphs);
  const activeProgramId = useSynforma((s) => s.activeProgramId);

  const program: Program | null = React.useMemo(() => {
    if (activeProgramId && programs[activeProgramId]) return programs[activeProgramId];
    const all = Object.values(programs);
    if (!all.length) return null;
    return all.reduce((best, p) => (p.updatedAt > best.updatedAt ? p : best), all[0]);
  }, [programs, activeProgramId]);
  const storedGraph = program ? graphs[program.graphId] ?? null : null;
  const isSample = hydrated && !program;
  const graph: WorkGraph = !hydrated ? EMPTY_GRAPH : program ? storedGraph ?? EMPTY_GRAPH : SAMPLE_GRAPH;

  const nodeById = React.useMemo(() => new Map(graph.nodes.map((n) => [n.id, n] as const)), [graph.nodes]);
  const counts = React.useMemo(() => {
    const c: Partial<Record<NodeType, number>> = {};
    for (const n of graph.nodes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [graph.nodes]);

  // ── Layers ──
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<NodeType>>(() => new Set());
  const layers = React.useMemo(() => TYPE_ORDER.filter((t) => !hiddenTypes.has(t)), [hiddenTypes]);
  const toggleType = (t: NodeType) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  // ── Selection ──
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedNode: GraphNode | null = selectedId ? nodeById.get(selectedId) ?? null : null;

  // ── Intent flow ──
  const path = React.useMemo(() => computeIntentPath(graph), [graph]);
  const [flow, setFlow] = React.useState<FlowState | null>(null);
  const [flowGraphId, setFlowGraphId] = React.useState<string | null>(null);
  if (flow && flowGraphId !== graph.id) {
    // The graph changed underneath the flow: drop it.
    setFlow(null);
    setFlowGraphId(graph.id);
  }
  React.useEffect(() => {
    if (!flow?.playing) return;
    const id = window.setTimeout(() => {
      setFlow((f) => {
        if (!f || !f.playing) return f;
        const next = f.index + 1;
        if (next >= path.length) return { index: f.index, playing: false };
        setSelectedId(path[next].nodeId);
        return { index: next, playing: true };
      });
    }, HOP_MS);
    return () => window.clearTimeout(id);
  }, [flow, path]);

  const startFlow = () => {
    if (path.length < 2) return;
    setFlowGraphId(graph.id);
    setFlow({ index: 0, playing: true });
    setSelectedId(path[0].nodeId);
  };
  const stopFlow = () => setFlow((f) => (f ? { ...f, playing: false } : f));
  const clearFlow = () => setFlow(null);

  const flowHighlight = React.useMemo(() => {
    if (!flow) return [] as string[];
    const ids: string[] = [];
    for (const hop of path.slice(0, flow.index + 1)) {
      ids.push(hop.nodeId);
      for (const s of hop.sideIds) ids.push(s);
    }
    return ids;
  }, [flow, path]);
  const currentHop: IntentHop | null = flow ? path[flow.index] ?? null : null;

  // ── Search ──
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const q = query.trim().toLowerCase();
  const matches = React.useMemo(() => (q ? graph.nodes.filter((n) => n.label.toLowerCase().includes(q) || n.type === q) : []), [graph.nodes, q]);
  const searchHighlight = React.useMemo(() => (q && matches.length <= SEARCH_HIGHLIGHT_CAP ? matches.map((n) => n.id) : []), [q, matches]);

  const highlightNodeIds = flow ? flowHighlight : searchHighlight;

  const onSelectNode = React.useCallback((node: GraphNode | null) => {
    setSelectedId(node?.id ?? null);
    setFlow((f) => (f?.playing ? { ...f, playing: false } : f));
  }, []);
  const selectFromPanel = React.useCallback((id: string) => {
    setSelectedId(id);
    setFlow((f) => (f?.playing ? { ...f, playing: false } : f));
  }, []);

  const isLarge = useMediaQuery("(min-width: 1024px)");
  const title = !hydrated ? "" : program ? program.title : "Illustrative sample";

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-[560px] flex-col" data-testid="graph-page">
      <header className="border-b border-line bg-paper px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="min-w-0">
            <p className="eyebrow">Work Graph</p>
            {hydrated ? (
              <h1 className="truncate text-sm font-medium text-ink" data-testid="graph-title">
                {title}
              </h1>
            ) : (
              <Skeleton className="mt-1 h-4 w-40" />
            )}
          </div>
          <p className="mono-data text-xs text-slate" data-testid="graph-counts">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </p>
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" />
              <Input
                aria-label="Search nodes by label"
                placeholder="Search nodes"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) {
                    selectFromPanel(matches[0].id);
                    setSearchOpen(false);
                  } else if (e.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
                  }
                }}
                className="h-8 pl-8 pr-7 text-xs"
                data-testid="graph-search"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-mist hover:text-ink cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {searchOpen && q ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-lg" data-testid="graph-search-results">
                  {matches.length ? (
                    <ul className="max-h-72 overflow-y-auto py-1">
                      {matches.slice(0, 8).map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              selectFromPanel(n.id);
                              setSearchOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2 cursor-pointer"
                          >
                            <span className="eyebrow w-20 shrink-0 truncate text-[9px]">{TYPE_LABEL[n.type].one}</span>
                            <span className="min-w-0 flex-1 truncate text-ink">{n.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate">No node matches “{query.trim()}”.</p>
                  )}
                  <p className="border-t border-line px-3 py-1.5 text-[10px] text-mist">
                    {matches.length} match{matches.length === 1 ? "" : "es"}
                    {matches.length > SEARCH_HIGHLIGHT_CAP ? " · refine to highlight in the graph" : matches.length ? " · highlighted in the graph" : ""}
                  </p>
                </div>
              ) : null}
            </div>
            {flow?.playing ? (
              <Button size="sm" variant="outline" onClick={stopFlow} data-testid="graph-stop-flow">
                <Square aria-hidden="true" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={startFlow}
                disabled={path.length < 2}
                title={path.length < 2 ? "No workflow has been inferred yet" : "Animate objective → workflow → steps → screens → outcome"}
                data-testid="graph-play-flow"
              >
                <Play aria-hidden="true" />
                Play intent flow
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin" role="group" aria-label="Layers" data-testid="graph-layer-toggles">
          {TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => {
            const on = !hiddenTypes.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors cursor-pointer",
                  on ? "border-line-strong bg-surface text-ink hover:bg-surface-2" : "border-transparent bg-transparent text-mist hover:text-graphite",
                )}
              >
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full", on ? "bg-ink" : "border border-line-strong")} aria-hidden="true" />
                {TYPE_LABEL[t].many}
                <span className="mono-data text-[10px] text-slate">{counts[t]}</span>
              </button>
            );
          })}
          {hiddenTypes.size ? (
            <button type="button" onClick={() => setHiddenTypes(new Set())} className="ml-1 shrink-0 text-[11px] text-slate underline-offset-2 hover:text-ink hover:underline cursor-pointer">
              Show all
            </button>
          ) : null}
        </div>
      </header>

      {isSample ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-amber-soft/60 px-4 py-1.5 text-xs text-amber sm:px-6" data-testid="graph-sample-banner">
          <span className="font-medium">Illustrative sample — run the demo to see a discovered graph.</span>
          <Link href="/demo" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
            Open Mission Control
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      {hydrated && program && !storedGraph ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-1.5 text-xs text-graphite sm:px-6" data-testid="graph-no-graph-banner">
          <span>This program has no discovered graph yet.</span>
          <Link href="/demo" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
            Run discovery in Mission Control
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {hydrated ? (
            <WorkGraph3D
              graph={graph}
              height="100%"
              layers={layers}
              selectedNodeId={selectedId}
              onSelectNode={onSelectNode}
              highlightNodeIds={highlightNodeIds}
              showLegend={false}
            />
          ) : (
            <GraphLoading />
          )}

          {currentHop ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-md border border-line bg-surface/95 px-3 py-2 shadow-sm backdrop-blur-sm" data-testid="graph-flow-caption">
                <div className="min-w-0">
                  <p className="eyebrow text-[9px]">
                    {flow?.playing ? "Intent flow" : "Intent flow · complete"} · hop {flow ? flow.index + 1 : 0} of {path.length} · {currentHop.kind}
                  </p>
                  <p className="truncate text-xs text-ink">
                    {currentHop.caption}
                    {currentHop.detail ? <span className="text-slate"> · {currentHop.detail}</span> : null}
                  </p>
                </div>
                {flow?.playing ? (
                  <Button size="icon-sm" variant="ghost" aria-label="Stop" onClick={stopFlow}>
                    <Square aria-hidden="true" />
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="outline" onClick={startFlow}>
                      Replay
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Clear intent flow" onClick={clearFlow}>
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="hidden w-[380px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface lg:flex scrollbar-thin" aria-label="Node details">
          {selectedNode ? <NodeDetail key={selectedNode.id} graph={graph} node={selectedNode} onSelect={selectFromPanel} className="min-h-full" /> : <NodeDetailEmpty />}
        </aside>
      </div>

      <Dialog open={Boolean(selectedNode) && !isLarge} onOpenChange={(open) => (!open ? setSelectedId(null) : undefined)}>
        <DialogContent side="right" className="max-w-sm p-0 pt-10">
          <DialogTitle className="sr-only">Node details</DialogTitle>
          <DialogDescription className="sr-only">Details of the selected Work Graph node.</DialogDescription>
          {selectedNode ? <NodeDetail key={selectedNode.id} graph={graph} node={selectedNode} onSelect={selectFromPanel} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
