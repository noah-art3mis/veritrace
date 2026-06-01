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
import { nodeTypes, InternalsContext } from "./graph-nodes";
import { circleNodeTypes, NodeDetail } from "./graph-circles";
import { useGraphFlow } from "./use-graph-flow";
import { useRadialFlow } from "./use-radial-flow";
import type { AppNode } from "@/lib/graph-to-flow";
import type { FactGraph } from "@/lib/graph-types";

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

type ViewMode = "cards" | "radial";

// Keep the whole graph in frame as nodes stream in (and when the view mode changes). Trailing-
// debounced: a burst of evidence landing together triggers ONE fitView after it settles.
function FitOnChange({ dep }: { dep: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 300);
    return () => clearTimeout(t);
  }, [dep, fitView]);
  return null;
}

export default function FactGraphCanvas({
  graph,
  showInternals = false,
  showMinimap = true,
}: {
  graph: FactGraph;
  showInternals?: boolean;
  showMinimap?: boolean;
}) {
  const [view, setView] = useState<ViewMode>("cards");
  // Peek-then-open (ADR 0003): hover/first-tap peeks (pinned), second click opens, pane clears.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const card = useGraphFlow(graph);
  const radial = useRadialFlow(graph);
  const isRadial = view === "radial";
  const { nodes, edges } = isRadial ? radial : card;

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n as AppNode])), [nodes]);
  const peekNode = isRadial ? byId.get(hoveredId ?? pinnedId ?? "") : undefined;
  const openNode = isRadial ? byId.get(openId ?? "") : undefined;

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
    <InternalsContext.Provider value={showInternals}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={isRadial ? circleNodeTypes : nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.5}
        onlyRenderVisibleElements
        nodesDraggable={!isRadial}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
        onNodeMouseEnter={(_, n) => isRadial && setHoveredId(n.id)}
        onNodeMouseLeave={() => isRadial && setHoveredId(null)}
        onNodeClick={(_, n) => {
          if (!isRadial) return;
          setPinnedId((prev) =>
            prev === n.id ? (setOpenId(n.id), prev) : (setOpenId(null), n.id),
          );
        }}
        onPaneClick={() => {
          setPinnedId(null);
          setOpenId(null);
          setHoveredId(null);
        }}
      >
        <FitOnChange dep={`${view}:${nodes.length}`} />
        <Background variant={BackgroundVariant.Cross} gap={36} size={4} color="#18202c" />
        <Controls
          showInteractive={false}
          className="!overflow-hidden !rounded-md !border !border-[var(--line)] !shadow-xl [&_button]:!border-[var(--line)] [&_button]:!bg-[var(--panel-2)] [&_button]:!fill-[var(--ink-2)] [&_button:hover]:!bg-[var(--line)]"
        />

        <Panel position="top-right" className="!m-2 flex items-center gap-2">
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
          <button
            onClick={() => {
              setView((v) => (v === "radial" ? "cards" : "radial"));
              setSuggested(true);
              setPinnedId(null);
              setOpenId(null);
            }}
            className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-2)] shadow-lg hover:bg-[var(--line)]"
          >
            {isRadial ? "▦ Cards" : "◎ Radial"}
          </button>
        </Panel>

        {peekNode && !openNode && (
          <Panel position="bottom-center" className="!mb-3">
            <NodeDetail
              node={peekNode}
              full={false}
              onOpen={() => setOpenId(peekNode.id)}
              onClose={() => {
                setPinnedId(null);
                setHoveredId(null);
              }}
            />
          </Panel>
        )}

        {openNode && (
          <Panel position="top-center" className="!mt-3">
            <NodeDetail node={openNode} full onOpen={() => {}} onClose={() => setOpenId(null)} />
          </Panel>
        )}

        {mounted && showMinimap && nodes.length <= MINIMAP_MAX_NODES && (
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
    </InternalsContext.Provider>
  );
}
