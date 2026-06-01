/* eslint-disable react-hooks/refs */
// Radial-view twin of useGraphFlow: same deliberate topology-keyed layout cache (see that file for
// why the ref-in-useMemo pattern is safe), but it runs radialLayout instead of dagre and shapes
// each node as a circle. The node `style` carries a transform transition so that when the layout
// reflows on a streaming tick, React Flow eases each circle to its new slot (ADR 0003's tween).
import { useMemo, useRef } from "react";
import type { Edge } from "@xyflow/react";
import type { FactGraph } from "@/lib/graph-types";
import { buildNodes, type AppNode } from "@/lib/graph-to-flow";
import { radialLayout, buildRadialEdges, type RadialPosition } from "@/lib/radial-layout";

interface RadialCache {
  topology: string;
  positions: Map<string, RadialPosition>;
  nodesById: Map<string, AppNode>;
}

// Spring-eased settle (#12, part 1 — the "Obsidian feel"). A "back" overshoot curve lets a circle
// slightly overshoot its computed slot and settle, instead of the prior monotonic ease-out, so a
// streaming reflow reads as a soft spring rather than a glide. Stays motion-only per ADR 0003: the
// radial layout remains the source of truth; the easing only animates the approach to the target.
const TWEEN = "transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1)";

export function useRadialFlow(graph: FactGraph): { nodes: AppNode[]; edges: Edge[] } {
  const cache = useRef<RadialCache>({ topology: "", positions: new Map(), nodesById: new Map() });

  return useMemo(() => {
    const rawNodes = buildNodes(graph);
    const edges = buildRadialEdges(graph);

    const topology = rawNodes.map((n) => n.id).join("|");
    const c = cache.current;
    if (topology !== c.topology) {
      c.positions = radialLayout(graph);
      c.topology = topology;
    }

    const prevById = c.nodesById;
    const nextById = new Map<string, AppNode>();
    const nodes = rawNodes.map((raw) => {
      const pos = c.positions.get(raw.id);
      const prev = prevById.get(raw.id);
      // React Flow positions by top-left, so offset by half the diameter to centre the circle on
      // its computed (x, y). Reuse the prior object when nothing observable moved (stable identity
      // → React Flow skips the re-render), exactly as the card hook does.
      const x = pos ? pos.x - pos.diameter / 2 : 0;
      const y = pos ? pos.y - pos.diameter / 2 : 0;
      if (
        prev &&
        prev.data.item === raw.data.item &&
        prev.position.x === x &&
        prev.position.y === y
      ) {
        nextById.set(raw.id, prev);
        return prev;
      }
      const d = pos?.diameter ?? 24;
      const built: AppNode = {
        ...raw,
        position: { x, y },
        width: d,
        height: d,
        initialWidth: d,
        initialHeight: d,
        style: { width: d, height: d, transition: TWEEN },
      };
      nextById.set(raw.id, built);
      return built;
    });
    c.nodesById = nextById;

    return { nodes, edges };
  }, [graph]);
}
