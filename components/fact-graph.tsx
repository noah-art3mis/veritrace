"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  nodeTypes,
  InternalsContext,
  WithholdVerdictContext,
  ReincludeContext,
} from "./graph-nodes";
import { circleNodeTypes, NodeDetail } from "./graph-circles";
import { radialEdgeTypes } from "./radial-edges";
import { useGraphAnchors } from "./use-graph-flow";
import { useRadialAnchors } from "./use-radial-flow";
import { useSpiralAnchors } from "./use-spiral-flow";
import { useForceLayout } from "./use-force-layout";
import { useIsMobile } from "./use-is-mobile";
import { GraphLegend } from "./graph-legend";
import type { AppNode } from "@/lib/graph-to-flow";
import type { FactGraph, ClaimItem } from "@/lib/graph-types";

const MINIMAP_COLOR: Record<string, string> = {
  source: "#5b6678",
  claim: "#97a2b4",
  question: "#3ad6e6",
  evidence: "#34d399",
};

// Past this many nodes the MiniMap (one SVG rect per node) costs more than it helps — the
// thumbnail is an unreadable speckle anyway — so we drop it rather than re-render it per tick.
const MINIMAP_MAX_NODES = 220;

// Past this many nodes the card graph gets hard to read; suggest the radial overview (ADR 0003).
const RADIAL_SUGGEST_NODES = 60;

// Zoom-out floor. fitView clamps the frame zoom to >= minZoom, so a too-high floor leaves a big
// constellation cropped — its rim sits outside the viewport instead of the view zooming out to
// frame it (#109). The circle views (radial / spiral) grow their radius with the source count, so
// they need a far lower floor than the card flow to keep the whole constellation on screen.
const MIN_ZOOM_CARDS = 0.2;
const MIN_ZOOM_CIRCLE = 0.04;

// Three renderings of the same 4-layer graph: "cards" (default dagre lanes), "radial" (concentric
// Constellation overview), and "spiral" (the depth-walk coil — the companion to depth mode).
type ViewMode = "cards" | "radial" | "spiral";
const isCircleView = (v: ViewMode) => v !== "cards";

// OS "reduce motion" preference, SSR-safe. Server snapshot is `true` (assume reduced) so we never
// schedule a requestAnimationFrame loop during render on the server; the client re-reads on mount.
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

// Keep the whole graph in frame as nodes stream in (and when the view mode changes). Trailing-
// debounced: a burst of evidence landing together triggers ONE fitView after it settles. The
// debounce + tween used to total ~700ms of reframing per burst, which read as a stall between
// bursts and a back-and-forth lurch (#106); a shorter wait + quicker tween keeps the build a
// continuous fill without the dead time, while still coalescing a burst into a single reframe.
const FIT_DEBOUNCE_MS = 160;
const FIT_DURATION_MS = 260;
function FitOnChange({ dep }: { dep: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(
      () => fitView({ padding: 0.15, duration: FIT_DURATION_MS }),
      FIT_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [dep, fitView]);
  return null;
}

export default function FactGraphCanvas({
  graph,
  showMinimap = true,
  withholdVerdict = false,
  depthMode = false,
  onReinclude,
}: {
  graph: FactGraph;
  showMinimap?: boolean;
  withholdVerdict?: boolean;
  /** This run used depth mode — default to the spiral view, which is built to read the walk. */
  depthMode?: boolean;
  onReinclude?: (claim: ClaimItem) => void;
}) {
  const isMobile = useIsMobile();
  const [view, setView] = useState<ViewMode>(depthMode ? "spiral" : "cards");
  // Pipeline internals (HyDE seed, agent queries, stance confidence, raw fragments) are a graph
  // affordance, not a run setting — toggled live from the "details" button beside the view toggle.
  const [showInternals, setShowInternals] = useState(false);
  // Radial detail: hover surfaces the full card; clicking a circle pins it so it survives the
  // mouse leaving; a pane click (or close) clears it.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const isCircle = isCircleView(view);
  // Respect the OS reduced-motion setting: when set, fall back to static placement (no sim, no rAF).
  // SSR snapshot is `true` (assume reduced) so the server never schedules animation frames.
  const reducedMotion = useReducedMotion();
  const motion = !reducedMotion;

  // The depth→spiral default is set in the initial view state above. The canvas is keyed by run
  // (workbench remounts it per check), so a fresh run in depth mode opens straight on the spiral
  // without an effect — and a manual view switch afterward is never overridden.

  // All three anchor hooks run unconditionally (hooks rule); the force layer drives whichever view
  // is active. dagre/radial/spiral still only recompute on topology change inside the anchor hooks.
  const cardFlow = useGraphAnchors(graph);
  const radialFlow = useRadialAnchors(graph);
  const spiralFlow = useSpiralAnchors(graph);
  const flow = view === "spiral" ? spiralFlow : view === "radial" ? radialFlow : cardFlow;
  const { nodes, onNodesChange, settleNonce } = useForceLayout(flow, view, motion);
  const edges = flow.edges;

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n as AppNode])), [nodes]);
  const peekNode = isCircle ? byId.get(hoveredId ?? pinnedId ?? "") : undefined;

  // Suggest the radial overview once the card graph crosses the legibility threshold (once).
  const [suggested, setSuggested] = useState(false);
  const suggestRadial = view === "cards" && !suggested && nodes.length > RADIAL_SUGGEST_NODES;

  // React Flow's MiniMap picks shapeRendering ("crispEdges" vs "geometricPrecision") differently
  // on the server than in the browser, which trips a hydration mismatch. The minimap is purely
  // decorative and depends on browser layout anyway, so render it only after hydration. We read the
  // mounted flag via useSyncExternalStore (server snapshot false, client true) rather than a
  // setState-in-effect, which the react-hooks lint rule forbids.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <WithholdVerdictContext.Provider value={withholdVerdict}>
      <InternalsContext.Provider value={showInternals}>
        <ReincludeContext.Provider value={onReinclude ?? null}>
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={edges}
            nodeTypes={isCircle ? circleNodeTypes : nodeTypes}
            edgeTypes={isCircle ? radialEdgeTypes : undefined}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={isCircle ? MIN_ZOOM_CIRCLE : MIN_ZOOM_CARDS}
            maxZoom={1.5}
            onlyRenderVisibleElements
            nodesDraggable={!isCircle}
            proOptions={{ hideAttribution: true }}
            // vt-sim-active turns off the per-node CSS transform transition while physics owns
            // motion — the simulation writes positions every frame, so a CSS tween would fight it.
            className={`bg-transparent${motion ? " vt-sim-active" : ""}`}
            onNodeMouseEnter={(_, n) => isCircle && setHoveredId(n.id)}
            onNodeMouseLeave={() => isCircle && setHoveredId(null)}
            onNodeClick={(_, n) => {
              if (!isCircle) return;
              setPinnedId((prev) => (prev === n.id ? null : n.id));
            }}
            onPaneClick={() => {
              setPinnedId(null);
              setHoveredId(null);
            }}
          >
            {/* Frame after the sim SETTLES (settleNonce), not on every node-count change mid-stream,
              so a burst of evidence triggers one fitView once it comes to rest. Reduced motion has no
              sim, so fall back to the node count. */}
            <FitOnChange dep={motion ? `${view}:${settleNonce}` : `${view}:${nodes.length}`} />
            <Background variant={BackgroundVariant.Cross} gap={36} size={4} color="#18202c" />
            {/* The +/- zoom controls are desktop affordances; on touch you pinch-zoom, so they just
              add clutter on the scarce mobile first screen (#27). Hidden there, like the minimap. */}
            {!isMobile && (
              <Controls
                showInteractive={false}
                className="!overflow-hidden !rounded-md !border !border-[var(--line)] !shadow-xl [&_button]:!border-[var(--line)] [&_button]:!bg-[var(--panel-2)] [&_button]:!fill-[var(--ink-2)] [&_button:hover]:!bg-[var(--line)]"
              />
            )}

            {/* Reading-order orientation for the left-to-right card flow (#25): name the four lanes
              so SOURCE → CLAIMS → QUESTIONS → EVIDENCE is explicit. Cards view only (the circle
              views have no lanes); hidden on mobile where horizontal space is scarce. */}
            {!isCircle && !isMobile && (
              <Panel position="top-left" className="!m-2">
                <div className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--panel-2)]/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] shadow-lg backdrop-blur">
                  {(
                    [
                      ["source", "Source"],
                      ["claim", "Claims"],
                      ["question", "Questions"],
                      ["evidence", "Evidence"],
                    ] as const
                  ).map(([type, label], i) => (
                    <span key={type} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-[var(--ink-4)]">→</span>}
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: MINIMAP_COLOR[type] }}
                      />
                      <span className="text-[var(--ink-3)]">{label}</span>
                    </span>
                  ))}
                </div>
              </Panel>
            )}

            <Panel position="top-right" className="!m-2 flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {suggestRadial && (
                  <button
                    onClick={() => {
                      setView("radial");
                      setSuggested(true);
                    }}
                    className="rounded-md border border-[var(--accent)]/50 bg-[var(--panel-2)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] shadow-lg hover:bg-[var(--line)]"
                  >
                    ◎ big graph — try radial
                  </button>
                )}
                {/* Three renderings of the same graph: Cards (dagre lanes), Radial (Constellation),
                    Spiral (the depth-walk coil). A segmented control so all three are one tap away. */}
                <div className="flex items-center overflow-hidden rounded-md border border-[var(--line)] shadow-lg">
                  {(
                    [
                      ["cards", "▦ Cards"],
                      ["radial", "◎ Radial"],
                      ["spiral", "✺ Spiral"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setView(mode);
                        setSuggested(true);
                        setPinnedId(null);
                      }}
                      aria-pressed={view === mode}
                      className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
                        view === mode
                          ? "bg-[var(--line)] text-[var(--accent)]"
                          : "bg-[var(--panel-2)] text-[var(--ink-2)] hover:bg-[var(--line)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Reveals the pipeline internals (HyDE seed, agent queries, stance confidence,
                    raw fragments) live in the graph — accent-lit while on. */}
                <button
                  onClick={() => setShowInternals((s) => !s)}
                  aria-pressed={showInternals}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider shadow-lg ${
                    showInternals
                      ? "border-[var(--accent)] bg-[var(--panel-2)] text-[var(--accent)]"
                      : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--ink-2)] hover:bg-[var(--line)]"
                  }`}
                >
                  {showInternals ? "◉ Details" : "○ Details"}
                </button>
              </div>
              <GraphLegend />
            </Panel>

            {peekNode && (
              <Panel position="bottom-center" className="!mb-3">
                <NodeDetail
                  node={peekNode}
                  onClose={() => {
                    setPinnedId(null);
                    setHoveredId(null);
                  }}
                />
              </Panel>
            )}

            {/* On a small/touch viewport the minimap is an unreadable speckle eating scarce screen,
              so force it off there regardless of the toggle or the node-count cap (#4). */}
            {mounted && !isMobile && showMinimap && nodes.length <= MINIMAP_MAX_NODES && (
              <MiniMap
                pannable
                zoomable
                nodeColor={(n: Node) => MINIMAP_COLOR[n.type ?? "source"] ?? "#5b6678"}
                nodeStrokeWidth={0}
                maskColor="rgba(8,10,15,0.78)"
                className="!rounded-md !border !border-[var(--line)] !bg-[var(--bg-2)]"
                style={{ width: 168, height: 112 }}
              />
            )}
          </ReactFlow>
        </ReincludeContext.Provider>
      </InternalsContext.Provider>
    </WithholdVerdictContext.Provider>
  );
}
