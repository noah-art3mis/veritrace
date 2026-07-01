// The physics layer. It takes the static dagre/radial layout (as per-node ANCHORS from
// useGraphAnchors/useRadialAnchors) and drives React Flow node positions with a d3-force simulation
// running on a manual requestAnimationFrame loop:
//   - new nodes spawn at their parent and SPRING outward (pop-in);
//   - adding a node REHEATS the sim so neighbours jostle and re-settle ("respond with forces");
//   - hash-seeded jitter (lib/force-layout.ts) breaks the mirror symmetry of a tidy tree.
// The sim works in CENTRE coordinates; React Flow positions by top-left, so we convert on write.
//
// Two invariants preserve the existing performance:
//   1. dagre/radial still run only on topology change (the anchor hooks' cache).
//   2. each tick maps the PREVIOUS nodes and only replaces a node object whose position actually
//      moved, keeping `data` identity stable — so the memoised cards/circles don't re-render on
//      movement; only the cheap wrapper transform updates.
// Dragging is owned by React Flow (a dragged node is pinned into the sim and skipped by the tick so
// its flags survive); we wrap onNodesChange only to reheat while a card is dragged.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNodesState, type OnNodesChange } from "@xyflow/react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
} from "d3-force";
import type { AppNode } from "@/lib/graph-to-flow";
import { seedPosition, type AnchorFlow, type ForceNodeMeta } from "@/lib/force-layout";

// "radial" (concentric Constellation) and "spiral" (depth-walk coil) are both circle views driven by
// the same physics; only their anchor geometry differs (rings vs coil). "cards" uses static dagre.
type ViewMode = "cards" | "radial" | "spiral";
const isCircleView = (v: ViewMode) => v !== "cards";

/** A d3 simulation node: our meta plus the mutable position/velocity d3 maintains. */
type SimNode = ForceNodeMeta & {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

interface ForceConfig {
  charge: number;
  chargeMax: number;
  linkGap: number;
  linkStrength: number;
  anchorX: number;
  anchorY: number;
  collidePad: number;
  collideIter: number;
}

// Radial only: a moderate pull to the computed slot keeps the rings legible while a gentle charge
// perturbs the circles. The card view doesn't run the sim at all — it uses the static dagre
// placement (SOURCE→CLAIM→QUESTION→EVIDENCE columns + the evidence grid), no physics.
const RADIAL_FORCES: ForceConfig = {
  charge: -30,
  chargeMax: 200,
  linkGap: 24,
  linkStrength: 0.05,
  anchorX: 0.18,
  anchorY: 0.18,
  collidePad: 4,
  collideIter: 1,
};

const ALPHA_MIN = 0.02; // settle a touch earlier than d3's 0.001 default
const REHEAT_ALPHA = 0.6; // full settle for a view switch / first build (coordinate space changes)
// Streaming a single source in shouldn't reheat the whole constellation — that makes a question's
// staggered sources land as one pop instead of a sequential drip (#108), and the whole-graph jostle
// reads as dead time (#106). A gentler reheat springs the NEW node into its (now nearby, #107) halo
// while barely disturbing the settled rest, so each source arrives on its own beat.
const ADD_REHEAT_ALPHA = 0.3;
const DRAG_ALPHA = 0.3; // keep neighbours live while a card is dragged
const MOVE_EPSILON = 0.5; // sub-pixel moves don't warrant a new node object (skip the re-render)
// Above this the per-frame sim isn't worth the frame budget; fall back to static placement (the
// radial overview is suggested at 60 nodes anyway, so this is a safety ceiling, not the norm).
const HARD_CAP = 150;

const topLeft = (m: ForceNodeMeta, cx: number, cy: number) => ({
  x: cx - m.w / 2,
  y: cy - m.h / 2,
});

/** Build a render node from a raw data node + its sim centre (centre → top-left). */
function renderNode(
  meta: ForceNodeMeta,
  data: AppNode["data"],
  sn: SimNode,
  view: ViewMode,
): AppNode {
  return {
    id: meta.id,
    type: meta.type,
    position: topLeft(meta, sn.x, sn.y),
    data,
    width: meta.w,
    initialWidth: meta.w,
    initialHeight: meta.h,
    style: isCircleView(view) ? { width: meta.w, height: meta.h } : { width: meta.w },
  } as AppNode;
}

export interface ForceLayout {
  nodes: AppNode[];
  onNodesChange: OnNodesChange<AppNode>;
  /** Bumps each time the sim settles — drives a single post-settle fitView in the canvas. */
  settleNonce: number;
}

/**
 * Drive React Flow nodes from a d3-force simulation seeded by `flow`'s anchors. The sim runs for the
 * radial view only — the card view (plus prefers-reduced-motion, or any graph over HARD_CAP) places
 * nodes statically at their anchors with no simulation and no rAF.
 */
export function useForceLayout(flow: AnchorFlow, view: ViewMode, motion: boolean): ForceLayout {
  const [nodes, setNodes, baseOnNodesChange] = useNodesState<AppNode>([]);
  const [settleNonce, setSettleNonce] = useState(0);

  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const metaRef = useRef<Map<string, ForceNodeMeta>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTopoRef = useRef<string>("");
  const lastViewRef = useRef<ViewMode>(view);

  // Force runs in the circle views (radial + spiral); cards use the static dagre placement below.
  const enabled =
    isCircleView(view) && motion && flow.anchors.length > 0 && flow.anchors.length <= HARD_CAP;

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  // Run the sim on a manual rAF loop. `tick` is a hoisted function so it can re-schedule itself
  // without the lint hazard of a useCallback referencing its own identity. Each frame we map the
  // previous nodes: a node being dragged is pinned into the sim and left untouched (React Flow owns
  // its position + flags); every other node takes the sim's position, reusing the object when it
  // barely moved so the memoised card/circle doesn't re-render.
  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    function tick() {
      const sim = simRef.current;
      if (!sim) {
        rafRef.current = null;
        return;
      }
      sim.tick();
      setNodes((prev) =>
        prev.map((n) => {
          const sn = simNodesRef.current.get(n.id);
          const m = metaRef.current.get(n.id);
          if (!sn || !m) return n;
          if (n.dragging) {
            sn.fx = n.position.x + m.w / 2;
            sn.fy = n.position.y + m.h / 2;
            return n;
          }
          const p = topLeft(m, sn.x, sn.y);
          if (
            Math.abs(n.position.x - p.x) < MOVE_EPSILON &&
            Math.abs(n.position.y - p.y) < MOVE_EPSILON
          ) {
            return n;
          }
          return { ...n, position: p };
        }),
      );
      if (sim.alpha() < sim.alphaMin()) {
        rafRef.current = null;
        setSettleNonce((nonce) => nonce + 1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [setNodes]);

  // Build the full node list from the raw data nodes + current sim positions (used on a topology
  // change and for static placement). Fresh `data` here; ticks afterwards keep data identity.
  const buildNodeList = useCallback(
    (): AppNode[] =>
      flow.dataNodes
        .map((dn) => {
          const m = metaRef.current.get(dn.id);
          const sn = simNodesRef.current.get(dn.id);
          return m && sn ? renderNode(m, dn.data, sn, view) : null;
        })
        .filter((n): n is AppNode => n != null),
    [flow, view],
  );

  useEffect(() => {
    metaRef.current = new Map(flow.anchors.map((m) => [m.id, m]));

    const topologyChanged = flow.topology !== lastTopoRef.current;
    const viewChanged = view !== lastViewRef.current;

    // Data-only tick (verdict/status/trace stream): swap changed `data` refs, keep positions, do
    // NOT reheat. Position-unchanged nodes keep their object identity → no needless re-render. Runs
    // for both views, so the static card view keeps the same cheap streaming path as sim'd radial.
    if (!topologyChanged && !viewChanged) {
      const byId = new Map(flow.dataNodes.map((dn) => [dn.id, dn.data]));
      setNodes((prev) =>
        prev.map((n) => {
          const data = byId.get(n.id);
          return data && data.item !== n.data.item ? ({ ...n, data } as AppNode) : n;
        }),
      );
      return;
    }

    // Card view (plus reduced motion / oversized graph): static placement at anchors, no sim, no rAF.
    if (!enabled) {
      stopLoop();
      simRef.current?.stop();
      simRef.current = null;
      simNodesRef.current = new Map(
        flow.anchors.map((m) => [m.id, { ...m, x: m.anchorX, y: m.anchorY }]),
      );
      setNodes(buildNodeList());
      lastTopoRef.current = flow.topology;
      lastViewRef.current = view;
      return;
    }

    // Topology (or view) changed → (re)build the sim. On a TOPOLOGY change, survivors keep their
    // live position/velocity (continuity) and new nodes spawn at their parent's live centre and
    // spring out. On a VIEW switch the coordinate space changes entirely (card columns ↔ radial
    // rings), so we re-seed every node at its own anchor rather than carry stale positions.
    const carryOver = !viewChanged;
    const prevSims = simNodesRef.current;
    // An incremental streaming add (already in this view, survivors carried over) gets a gentle
    // reheat so the new node springs in alone; a view switch / first build gets the full settle.
    const incrementalAdd = carryOver && prevSims.size > 0;
    const sims = new Map<string, SimNode>();
    for (const m of flow.anchors) {
      const existing = carryOver ? prevSims.get(m.id) : undefined;
      if (existing) {
        sims.set(m.id, Object.assign(existing, m)); // refresh anchor/geometry, keep x,y,vx,vy
      } else {
        const parent = carryOver && m.parentId ? prevSims.get(m.parentId) : null;
        const seed = seedPosition(m, parent ? { x: parent.x, y: parent.y } : null);
        sims.set(m.id, { ...m, x: seed.x, y: seed.y, vx: 0, vy: 0 });
      }
    }
    simNodesRef.current = sims;

    const F = RADIAL_FORCES; // enabled ⇒ a circle view (cards returned via the static branch above)
    const links: SimulationLinkDatum<SimNode>[] = flow.linkEdges
      .filter((e) => sims.has(e.source) && sims.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    let sim = simRef.current;
    if (!sim) sim = forceSimulation<SimNode>().stop().alphaMin(ALPHA_MIN);
    sim.nodes([...sims.values()]);
    sim.force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance((l) => (l.source as SimNode).radius + (l.target as SimNode).radius + F.linkGap)
        .strength(F.linkStrength),
    );
    sim.force("charge", forceManyBody<SimNode>().strength(F.charge).distanceMax(F.chargeMax));
    sim.force(
      "collide",
      forceCollide<SimNode>((d) => d.radius + F.collidePad)
        .strength(0.85)
        .iterations(F.collideIter),
    );
    sim.force("x", forceX<SimNode>((d) => d.anchorX).strength(F.anchorX));
    sim.force("y", forceY<SimNode>((d) => d.anchorY).strength(F.anchorY));
    sim.alpha(incrementalAdd ? ADD_REHEAT_ALPHA : REHEAT_ALPHA);
    simRef.current = sim;

    setNodes(buildNodeList());
    lastTopoRef.current = flow.topology;
    lastViewRef.current = view;
    stopLoop();
    startLoop();
  }, [flow, view, enabled, buildNodeList, setNodes, startLoop, stopLoop]);

  // Tear down on unmount (no leaked frames/timers).
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      simRef.current?.stop();
    },
    [],
  );

  // React Flow owns drag/selection/measurement; we wrap its handler only to reheat the sim while a
  // card is dragged (so neighbours react) and let it cool on release.
  const onNodesChange = useCallback<OnNodesChange<AppNode>>(
    (changes) => {
      let drag: boolean | null = null;
      for (const c of changes) if (c.type === "position" && "dragging" in c) drag = !!c.dragging;
      if (drag === true) {
        simRef.current?.alphaTarget(DRAG_ALPHA);
        startLoop();
      } else if (drag === false) {
        simRef.current?.alphaTarget(0);
      }
      baseOnNodesChange(changes);
    },
    [baseOnNodesChange, startLoop],
  );

  return useMemo(
    () => ({ nodes, onNodesChange, settleNonce }),
    [nodes, onNodesChange, settleNonce],
  );
}
