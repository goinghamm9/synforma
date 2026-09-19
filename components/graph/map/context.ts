"use client";
import * as React from "react";
import type { Lens, MapNode } from "./model";

/**
 * Interaction state shared by the canvas, its nodes and its edges: which lens
 * is active, what is selected, hovered or highlighted, and the neighbourhood
 * to keep lit while everything else dims.
 */
export interface MapInteraction {
  lens: Lens;
  selectedId: string | null;
  hoveredId: string | null;
  /** Search, intent-flow or "inferred only" highlight. */
  highlight: ReadonlySet<string>;
  /** The hovered (else selected, when it is on the map and nothing is highlighted) node and its neighbours; null when nothing dims. */
  related: ReadonlySet<string> | null;
  /** The node `related` is built around. */
  dimFocus: string | null;
  maxTraffic: number;
  sample: boolean;
  setHovered: (id: string | null) => void;
  select: (node: MapNode | null) => void;
}

const EMPTY = new Set<string>();

export const MapInteractionContext = React.createContext<MapInteraction>({
  lens: "workflow",
  selectedId: null,
  hoveredId: null,
  highlight: EMPTY,
  related: null,
  dimFocus: null,
  maxTraffic: 0,
  sample: false,
  setHovered: () => {},
  select: () => {},
});

export function useMapInteraction(): MapInteraction {
  return React.useContext(MapInteractionContext);
}
