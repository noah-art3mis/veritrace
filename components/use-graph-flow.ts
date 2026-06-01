/* eslint-disable react-hooks/refs */
// Derive the card view's ANCHORS for the force layout (components/use-force-layout.ts). Keeps the
// deliberate cross-render cache (dagre positions) in a ref read inside useMemo — the standard
// layout-memoization pattern for React Flow. Safe because the cache is keyed by topology: a render
// React discards (StrictMode/concurrent) at worst recomputes, never produces wrong output. dagre
// runs ONLY when the node-id set changes (the perf win), not on every streaming data tick.
import { useMemo, useRef } from "react";
import {
  buildNodes,
  buildFlowEdges,
  computeLayout,
  conflictEdges,
  type NodePosition,
} from "@/lib/graph-to-flow";
import type { FactGraph } from "@/lib/graph-types";
import { buildCardAnchors, type AnchorFlow } from "@/lib/force-layout";

/**
 * Card-view anchors: dagre column positions (re-run only on topology change) turned into the
 * per-node anchors the simulation pulls toward, plus the edges to render, the structural edges to
 * use as springs, and the raw nodes (stable data.item refs) the sim reads for streaming updates.
 */
export function useGraphAnchors(graph: FactGraph): AnchorFlow {
  const cache = useRef<{ topology: string; positions: Map<string, NodePosition> }>({
    topology: "",
    positions: new Map(),
  });

  return useMemo(() => {
    const rawNodes = buildNodes(graph);
    const flowEdges = buildFlowEdges(graph);
    const edges = [...flowEdges, ...conflictEdges(graph)];

    const topology = rawNodes.map((n) => n.id).join("|");
    const c = cache.current;
    if (topology !== c.topology) {
      c.positions = computeLayout(rawNodes, flowEdges);
      c.topology = topology;
    }

    const anchors = buildCardAnchors(rawNodes, c.positions, graph.source.id);
    return { anchors, edges, linkEdges: flowEdges, dataNodes: rawNodes, topology };
  }, [graph]);
}
