/* eslint-disable react-hooks/refs */
// Radial-view twin of useGraphAnchors: same deliberate topology-keyed layout cache, but it runs
// radialLayout instead of dagre. Returns the per-node anchors (the radial slot the simulation pulls
// toward) plus the edges and raw nodes the sim needs. Radial has no conflict overlay, so the
// structural edges ARE the render edges. The motion/easing now lives in the force layer
// (components/use-force-layout.ts), so this hook no longer carries a CSS transform transition.
import { useMemo, useRef } from "react";
import type { FactGraph } from "@/lib/graph-types";
import { buildNodes } from "@/lib/graph-to-flow";
import { radialLayout, buildRadialEdges, type RadialPosition } from "@/lib/radial-layout";
import { buildRadialAnchors, type AnchorFlow } from "@/lib/force-layout";

/**
 * Radial-view anchors: the computed radial slot per node (re-run only on topology change), shaped
 * into the simulation's anchor/edge/raw-node inputs.
 */
export function useRadialAnchors(graph: FactGraph): AnchorFlow {
  const cache = useRef<{ topology: string; positions: Map<string, RadialPosition> }>({
    topology: "",
    positions: new Map(),
  });

  return useMemo(() => {
    const rawNodes = buildNodes(graph);
    const edges = buildRadialEdges(graph);

    const topology = rawNodes.map((n) => n.id).join("|");
    const c = cache.current;
    if (topology !== c.topology) {
      c.positions = radialLayout(graph);
      c.topology = topology;
    }

    const anchors = buildRadialAnchors(rawNodes, c.positions, graph.source.id);
    return { anchors, edges, linkEdges: edges, dataNodes: rawNodes, topology };
  }, [graph]);
}
