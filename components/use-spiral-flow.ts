/* eslint-disable react-hooks/refs */
// Spiral-view twin of useRadialAnchors: the same topology-keyed layout cache, but it runs
// spiralLayout instead of radialLayout, so each claim's depth walk reads as its own spiral-galaxy
// arm. Returns the per-node anchors (the spiral slot the simulation pulls toward) plus the edges and
// raw nodes the sim needs. Like the radial view it reuses the structural+stance edge set, so the
// only difference from the constellation is where the circles sit (galaxy arms vs concentric rings).
import { useMemo, useRef } from "react";
import type { FactGraph } from "@/lib/graph-types";
import { buildNodes } from "@/lib/graph-to-flow";
import { spiralLayout, buildSpiralEdges, type SpiralPosition } from "@/lib/spiral-layout";
import { buildSpiralAnchors, type AnchorFlow } from "@/lib/force-layout";

/**
 * Spiral-view anchors: the computed spiral slot per node (re-run only on topology change), shaped
 * into the simulation's anchor/edge/raw-node inputs.
 */
export function useSpiralAnchors(graph: FactGraph): AnchorFlow {
  const cache = useRef<{ topology: string; positions: Map<string, SpiralPosition> }>({
    topology: "",
    positions: new Map(),
  });

  return useMemo(() => {
    const rawNodes = buildNodes(graph);
    const edges = buildSpiralEdges(graph);

    // Topology includes evidence count + per-question hop order, so a new source landing (which
    // re-sorts a chain) re-runs the spiral; a pure data patch (verdict/stance) reuses the cache.
    const topology = rawNodes.map((n) => n.id).join("|");
    const c = cache.current;
    if (topology !== c.topology) {
      c.positions = spiralLayout(graph);
      c.topology = topology;
    }

    const anchors = buildSpiralAnchors(rawNodes, c.positions, graph.source.id);
    return { anchors, edges, linkEdges: edges, dataNodes: rawNodes, topology };
  }, [graph]);
}
