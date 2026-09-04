import type { EdgeType, GraphEdge, GraphNode, NodeStatus, NodeType, WorkGraph } from "../types";
import { slug } from "../interaction/text";

/**
 * The Work Graph: a semantic model of how work happens, not a map of web pages.
 * People · Roles · Objectives · Workflows · Applications · Screens · Actions ·
 * Fields · Objects · Requirements · Policies · Capabilities · Outcomes.
 */

export function createGraph(id: string): WorkGraph {
  return { id, nodes: [], edges: [], version: 1, updatedAt: Date.now() };
}

export function nodeId(type: NodeType, ...parts: string[]): string {
  return `${type}:${parts.map((p) => slug(p) || "x").join("/")}`;
}

export function upsertNode(
  graph: WorkGraph,
  node: Omit<GraphNode, "discoveredAt" | "confidence" | "status"> & { confidence?: number; status?: NodeStatus; discoveredAt?: number },
): GraphNode {
  const existing = graph.nodes.find((n) => n.id === node.id);
  if (existing) {
    existing.label = node.label || existing.label;
    if (node.description) existing.description = node.description;
    if (node.data) existing.data = { ...(existing.data ?? {}), ...node.data };
    if (node.confidence !== undefined) existing.confidence = Math.max(existing.confidence, node.confidence);
    if (node.status) existing.status = rankStatus(existing.status, node.status);
    graph.updatedAt = Date.now();
    return existing;
  }
  const created: GraphNode = {
    id: node.id,
    type: node.type,
    label: node.label,
    description: node.description,
    data: node.data,
    confidence: node.confidence ?? 0.6,
    status: node.status ?? "observed",
    discoveredAt: node.discoveredAt ?? Date.now(),
  };
  graph.nodes.push(created);
  graph.version += 1;
  graph.updatedAt = Date.now();
  return created;
}

function rankStatus(a: NodeStatus, b: NodeStatus): NodeStatus {
  const order: NodeStatus[] = ["hypothesis", "observed", "confirmed"];
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}

export function upsertEdge(graph: WorkGraph, from: string, to: string, type: EdgeType, label?: string, weight?: number): GraphEdge {
  const id = `${type}:${from}->${to}`;
  const existing = graph.edges.find((e) => e.id === id);
  if (existing) {
    if (label) existing.label = label;
    if (weight !== undefined) existing.weight = weight;
    return existing;
  }
  const edge: GraphEdge = { id, from, to, type, label, weight };
  graph.edges.push(edge);
  graph.version += 1;
  graph.updatedAt = Date.now();
  return edge;
}

export function neighbors(graph: WorkGraph, id: string): { node: GraphNode; edge: GraphEdge; direction: "out" | "in" }[] {
  const out: { node: GraphNode; edge: GraphEdge; direction: "out" | "in" }[] = [];
  for (const e of graph.edges) {
    if (e.from === id) {
      const n = graph.nodes.find((x) => x.id === e.to);
      if (n) out.push({ node: n, edge: e, direction: "out" });
    } else if (e.to === id) {
      const n = graph.nodes.find((x) => x.id === e.from);
      if (n) out.push({ node: n, edge: e, direction: "in" });
    }
  }
  return out;
}

export function countByType(graph: WorkGraph): Record<NodeType, number> {
  const counts = {} as Record<NodeType, number>;
  for (const n of graph.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  return counts;
}

export function nodesOfType(graph: WorkGraph, type: NodeType): GraphNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

/** Deep-clone so React state updates see a new reference. */
export function cloneGraph(graph: WorkGraph): WorkGraph {
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n })), edges: graph.edges.map((e) => ({ ...e })) };
}
