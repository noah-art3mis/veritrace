import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type {
  FactGraph,
  SourceTextItem,
  ClaimItem,
  QuestionItem,
  EvidenceItem,
} from "./graph-types";
import { STANCE_META, VERDICT_META } from "./visuals";
import { isDeciding } from "./pipeline/verdict";

// Typed node aliases so each card component knows its data shape.
export type SourceNode = Node<{ item: SourceTextItem }, "source">;
export type ClaimNode = Node<{ item: ClaimItem }, "claim">;
export type QuestionNode = Node<{ item: QuestionItem }, "question">;
export type EvidenceNode = Node<{ item: EvidenceItem }, "evidence">;
export type AppNode = SourceNode | ClaimNode | QuestionNode | EvidenceNode;

// Approximate card sizes per layer — dagre needs these to space things; React Flow
// then renders the real DOM. Widths here must match the `width` we set on each node.
const SIZES: Record<AppNode["type"], { w: number; h: number }> = {
  source: { w: 380, h: 150 },
  claim: { w: 320, h: 160 },
  question: { w: 280, h: 80 },
  evidence: { w: 320, h: 210 },
};

export function graphToFlow(graph: FactGraph): { nodes: AppNode[]; edges: Edge[] } {
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];

  nodes.push({ id: graph.source.id, type: "source", position: { x: 0, y: 0 }, data: { item: graph.source } });

  for (const claim of graph.claims) {
    nodes.push({ id: claim.id, type: "claim", position: { x: 0, y: 0 }, data: { item: claim } });
    edges.push({
      id: `e-${graph.source.id}-${claim.id}`,
      source: graph.source.id,
      target: claim.id,
      type: "smoothstep",
      animated: false,
      style: { stroke: "#2b3645", strokeWidth: 1.5 },
    });
  }

  for (const q of graph.questions) {
    nodes.push({ id: q.id, type: "question", position: { x: 0, y: 0 }, data: { item: q } });
    edges.push({
      id: `e-${q.claimId}-${q.id}`,
      source: q.claimId,
      target: q.id,
      type: "smoothstep",
      style: { stroke: "#1f6f78", strokeWidth: 1.5, strokeDasharray: "4 3" },
    });
  }

  for (const ev of graph.evidence) {
    nodes.push({ id: ev.id, type: "evidence", position: { x: 0, y: 0 }, data: { item: ev } });
    const stroke = STANCE_META[ev.stance].color;
    edges.push({
      id: `e-${ev.questionId}-${ev.id}`,
      source: ev.questionId,
      target: ev.id,
      type: "smoothstep",
      label: STANCE_META[ev.stance].label,
      animated: true,
      style: { stroke, strokeWidth: 2 },
      labelStyle: { fill: stroke, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
      labelBgStyle: { fill: "#0b0e15", fillOpacity: 0.9 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 3,
    });
  }

  // Conflict overlay (CLUE): when one claim has both deciding support AND deciding
  // refutation, link the two strongest opposing sources so "Conflicting" means *these two
  // sources disagree*, not a flat label. Layout ranks on the structural edges only —
  // these same-rank evidence↔evidence links would otherwise distort the dagre layering.
  const laidOut = layout(nodes, edges);
  return { nodes: laidOut, edges: [...edges, ...conflictEdges(graph)] };
}

/** Edges between the strongest opposing deciding sources within each conflicting claim. */
export function conflictEdges(graph: FactGraph): Edge[] {
  const claimOfQuestion = new Map(graph.questions.map((q) => [q.id, q.claimId]));
  const byClaim = new Map<string, { supports: EvidenceItem[]; refutes: EvidenceItem[] }>();

  for (const ev of graph.evidence) {
    if (!isDeciding(ev)) continue;
    if (ev.stance !== "supports" && ev.stance !== "refutes") continue;
    const claimId = claimOfQuestion.get(ev.questionId);
    if (!claimId) continue;
    const bucket = byClaim.get(claimId) ?? { supports: [], refutes: [] };
    bucket[ev.stance].push(ev);
    byClaim.set(claimId, bucket);
  }

  const strongest = (items: EvidenceItem[]) =>
    items.reduce((best, e) => ((e.stanceConfidence ?? 0) > (best.stanceConfidence ?? 0) ? e : best));
  const color = VERDICT_META.conflicting.color;
  const edges: Edge[] = [];

  for (const [claimId, { supports, refutes }] of byClaim) {
    if (supports.length === 0 || refutes.length === 0) continue;
    const a = strongest(supports);
    const b = strongest(refutes);
    edges.push({
      id: `conflict-${claimId}`,
      source: a.id,
      target: b.id,
      type: "smoothstep",
      animated: true,
      label: "conflicts",
      style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "2 4" },
      labelStyle: { fill: color, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },
      labelBgStyle: { fill: "#0b0e15", fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 3,
      markerEnd: undefined,
      markerStart: undefined,
    });
  }

  return edges;
}

function layout(nodes: AppNode[], edges: Edge[]): AppNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 26, ranksep: 96, marginx: 48, marginy: 48 });

  for (const n of nodes) {
    const s = SIZES[n.type];
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  return nodes.map((n) => {
    const s = SIZES[n.type];
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - s.w / 2, y: p.y - s.h / 2 },
      width: s.w,
      style: { width: s.w },
    };
  });
}
