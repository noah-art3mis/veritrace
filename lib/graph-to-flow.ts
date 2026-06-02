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
export const SIZES: Record<AppNode["type"], { w: number; h: number }> = {
  source: { w: 380, h: 150 },
  claim: { w: 320, h: 160 },
  question: { w: 280, h: 80 },
  evidence: { w: 320, h: 210 },
};

/** Build the (unpositioned) node list for a graph — data only; layout fills in positions. */
export function buildNodes(graph: FactGraph): AppNode[] {
  const nodes: AppNode[] = [];
  nodes.push({
    id: graph.source.id,
    type: "source",
    position: { x: 0, y: 0 },
    data: { item: graph.source },
  });
  for (const claim of graph.claims) {
    nodes.push({ id: claim.id, type: "claim", position: { x: 0, y: 0 }, data: { item: claim } });
  }
  for (const q of graph.questions) {
    nodes.push({ id: q.id, type: "question", position: { x: 0, y: 0 }, data: { item: q } });
  }
  for (const ev of graph.evidence) {
    nodes.push({ id: ev.id, type: "evidence", position: { x: 0, y: 0 }, data: { item: ev } });
  }
  return nodes;
}

/**
 * The structural + comb edges that dagre ranks on and the canvas draws (everything EXCEPT
 * the conflict overlay, which rides dedicated handles and must not perturb the layout).
 *
 * Evidence under one question wraps into a grid of EV_COLS columns (see computeLayout). Fanning
 * every card out from the question would force edges to the inner columns to cross their
 * sibling cards — they only reach a left-edge handle that sits *behind* other cards. Instead
 * wire each row as a "comb": the question feeds the row's leftmost card, and each remaining
 * card hangs off its left neighbour's right handle, so every edge joins adjacent cards only.
 */
// Structural chrome stays a neutral hue until a claim resolves; once it has a verdict the
// connectors INTO and OUT OF that claim take the verdict colour, so the green/red/amber/grey
// reading propagates along source → claim → question, not just sitting in the badges (#24). Red,
// green, and amber are thus reserved for veracity; unresolved structure is the neutral slate.
const STRUCTURAL_STROKE = "#2b3645";

/**
 * The colour the structural edges INTO and OUT OF a claim carry. Once the claim has a verdict that
 * verdict colour wins (the authoritative resolution, #24). Before it resolves, the support colour
 * of the deciding evidence beneath it propagates up so the source → claim → question connectors
 * already read green/red/amber as evidence streams in, instead of sitting neutral until the verdict
 * lands. `evidence` is the subtree under the node being coloured (a claim's whole evidence set for
 * source→claim, one question's set for claim→question). Falls back to neutral when nothing decides.
 */
function claimStroke(claim: ClaimItem, evidence: EvidenceItem[]): string {
  if (claim.verdict) return VERDICT_META[claim.verdict].color;
  return aggregateStanceColor(evidence) ?? STRUCTURAL_STROKE;
}

/**
 * The dominant deciding stance colour for a set of evidence, or null when nothing in it can decide.
 * Mirrors the conflict overlay + verdict semantics (isDeciding): only high-confidence, reliable
 * supports/refutes count, both present ⇒ conflicting (amber). This keeps the veracity hues meaning
 * the same thing on a propagated edge as they do in the badges and the conflict chord.
 */
export function aggregateStanceColor(evidence: EvidenceItem[]): string | null {
  const deciding = evidence.filter(isDeciding);
  const supports = deciding.some((e) => e.stance === "supports");
  const refutes = deciding.some((e) => e.stance === "refutes");
  if (supports && refutes) return VERDICT_META.conflicting.color;
  if (supports) return STANCE_META.supports.color;
  if (refutes) return STANCE_META.refutes.color;
  return null;
}

export function buildFlowEdges(graph: FactGraph): Edge[] {
  const edges: Edge[] = [];
  const claimById = new Map(graph.claims.map((c) => [c.id, c]));
  const evidenceByClaim = groupEvidenceByClaim(graph);
  const evidenceByQuestion = groupBy(graph.evidence, (e) => e.questionId);
  for (const claim of graph.claims) {
    edges.push({
      id: `e-${graph.source.id}-${claim.id}`,
      source: graph.source.id,
      target: claim.id,
      type: "smoothstep",
      animated: false,
      style: {
        stroke: claimStroke(claim, evidenceByClaim.get(claim.id) ?? []),
        strokeWidth: 1.5,
      },
    });
  }
  for (const q of graph.questions) {
    const claim = claimById.get(q.claimId);
    edges.push({
      id: `e-${q.claimId}-${q.id}`,
      source: q.claimId,
      target: q.id,
      type: "smoothstep",
      style: {
        stroke: claim ? claimStroke(claim, evidenceByQuestion.get(q.id) ?? []) : STRUCTURAL_STROKE,
        strokeWidth: 1.5,
        strokeDasharray: "4 3",
      },
    });
  }
  for (const row of evidenceRows(graph)) {
    row.forEach((ev, i) => {
      const fromQuestion = i === 0;
      edges.push(
        stanceEdge(
          fromQuestion ? ev.questionId : row[i - 1].id,
          ev,
          fromQuestion ? undefined : "flow-out",
        ),
      );
    });
  }
  return edges;
}

/**
 * Stateless derive: build nodes + edges and lay them out fresh. The live canvas uses the
 * cached hook (useGraphFlow) instead so it doesn't re-run dagre on every stream tick — but
 * this stays the simple, pure entry point for tests and any one-shot render.
 *
 * Conflict overlay (CLUE): when one claim has both deciding support AND deciding refutation,
 * link the two strongest opposing sources so "Conflicting" means *these two sources disagree*.
 */
export function graphToFlow(graph: FactGraph): { nodes: AppNode[]; edges: Edge[] } {
  const nodes = buildNodes(graph);
  const flowEdges = buildFlowEdges(graph);
  const positions = computeLayout(nodes, flowEdges);
  return {
    nodes: nodes.map((n) => positionNode(n, positions.get(n.id))),
    edges: [...flowEdges, ...conflictEdges(graph)],
  };
}

/** Bucket items by a derived key, preserving insertion order within each bucket. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(key(item)) ?? [];
    bucket.push(item);
    map.set(key(item), bucket);
  }
  return map;
}

/** All evidence under each claim, resolved through its questions (claimId → evidence[]). */
function groupEvidenceByClaim(graph: FactGraph): Map<string, EvidenceItem[]> {
  const claimOfQuestion = new Map(graph.questions.map((q) => [q.id, q.claimId]));
  return groupBy(
    graph.evidence.filter((e) => claimOfQuestion.has(e.questionId)),
    (e) => claimOfQuestion.get(e.questionId)!,
  );
}

/** Evidence grouped by question and chunked into the same rows the grid layout draws. */
function evidenceRows(graph: FactGraph): EvidenceItem[][] {
  const byQuestion = new Map<string, EvidenceItem[]>();
  for (const ev of graph.evidence) {
    const bucket = byQuestion.get(ev.questionId) ?? [];
    bucket.push(ev);
    byQuestion.set(ev.questionId, bucket);
  }
  const rows: EvidenceItem[][] = [];
  for (const evs of byQuestion.values()) {
    for (let i = 0; i < evs.length; i += EV_COLS) rows.push(evs.slice(i, i + EV_COLS));
  }
  return rows;
}

/** A stance-coloured, labelled flow edge into an evidence card (comb wiring). */
function stanceEdge(source: string, ev: EvidenceItem, sourceHandle?: string): Edge {
  const stroke = STANCE_META[ev.stance].color;
  return {
    id: `e-${source}-${ev.id}`,
    source,
    target: ev.id,
    sourceHandle,
    type: "smoothstep",
    label: STANCE_META[ev.stance].label,
    animated: true,
    style: { stroke, strokeWidth: 2 },
    labelStyle: {
      fill: stroke,
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    },
    labelBgStyle: { fill: "#0b0e15", fillOpacity: 0.9 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 3,
  };
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
    items.reduce((best, e) =>
      (e.stanceConfidence ?? 0) > (best.stanceConfidence ?? 0) ? e : best,
    );
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
      // The left/right handles carry the structural comb flow. Conflict links join siblings
      // in the same rank, so they ride dedicated top/bottom handles instead.
      sourceHandle: "conflict-out",
      targetHandle: "conflict-in",
      type: "smoothstep",
      animated: true,
      label: "conflicts",
      style: { stroke: color, strokeWidth: 1.5, strokeDasharray: "2 4" },
      labelStyle: {
        fill: color,
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      },
      labelBgStyle: { fill: "#0b0e15", fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 3,
      markerEnd: undefined,
      markerStart: undefined,
    });
  }

  return edges;
}

// Evidence ("sources") is the populous rank: in a pure LR layout every source under a
// question stacks into one column, so the graph's height grows with source count and fitView
// zooms everything down. We wrap each question's evidence into EV_COLS columns — dagre ranks a
// single virtual "row" node per chunk (so vertical spacing stays correct), then we expand each
// row into its side-by-side cards. Height scales with rows, not raw source count.
const EV_COLS = 4;
const EV_COL_GAP = 24;

/** A laid-out position + width for one node, keyed by node id in the returned map. */
export interface NodePosition {
  x: number;
  y: number;
  width: number;
}

/**
 * Run dagre over the graph and return positions keyed by node id. Pure and stateless: the
 * caller decides when to re-run it (the live canvas only re-runs on a topology change, not on
 * every data patch). Width is returned per node so positionNode can apply it without re-deriving.
 */
export function computeLayout(nodes: AppNode[], edges: Edge[]): Map<string, NodePosition> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 26, ranksep: 96, marginx: 48, marginy: 48 });

  const evidenceIds = new Set(nodes.filter((n) => n.type === "evidence").map((n) => n.id));
  const nonEvidence = nodes.filter((n) => n.type !== "evidence");

  for (const n of nonEvidence) {
    const s = SIZES[n.type];
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  // Structural edges only — question→evidence is replaced by question→row below.
  for (const e of edges) {
    if (evidenceIds.has(e.target)) continue;
    g.setEdge(e.source, e.target);
  }

  // Group evidence by question, then chunk into rows of EV_COLS. Each row is one dagre node.
  const evSize = SIZES.evidence;
  const rowWidth = evSize.w * EV_COLS + EV_COL_GAP * (EV_COLS - 1);
  const byQuestion = new Map<string, EvidenceNode[]>();
  for (const n of nodes) {
    if (n.type !== "evidence") continue;
    const qId = n.data.item.questionId;
    const bucket = byQuestion.get(qId) ?? [];
    bucket.push(n);
    byQuestion.set(qId, bucket);
  }
  const rows: { id: string; members: EvidenceNode[] }[] = [];
  for (const [qId, evs] of byQuestion) {
    for (let i = 0; i < evs.length; i += EV_COLS) {
      const id = `evrow-${qId}-${i / EV_COLS}`;
      rows.push({ id, members: evs.slice(i, i + EV_COLS) });
      g.setNode(id, { width: rowWidth, height: evSize.h });
      g.setEdge(qId, id);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, NodePosition>();
  for (const n of nonEvidence) {
    const s = SIZES[n.type];
    const p = g.node(n.id);
    positions.set(n.id, { x: p.x - s.w / 2, y: p.y - s.h / 2, width: s.w });
  }
  for (const row of rows) {
    const p = g.node(row.id);
    const left = p.x - rowWidth / 2;
    const top = p.y - evSize.h / 2;
    row.members.forEach((n, i) => {
      positions.set(n.id, { x: left + i * (evSize.w + EV_COL_GAP), y: top, width: evSize.w });
    });
  }

  return positions;
}

/** Apply a computed position to a node, returning a new node object (or the input if unplaced). */
export function positionNode(n: AppNode, pos?: NodePosition): AppNode {
  if (!pos) return n;
  // initialWidth/initialHeight are dimension fallbacks the MiniMap reads when a node hasn't
  // been DOM-measured — which, with onlyRenderVisibleElements, is every off-screen node. Without
  // a known height the MiniMap's nodeHasDimensions() check drops the node and the map renders
  // empty. measured dims still override these once a node is on screen, so they're hints only.
  return {
    ...n,
    position: { x: pos.x, y: pos.y },
    width: pos.width,
    initialWidth: pos.width,
    initialHeight: SIZES[n.type].h,
    style: { width: pos.width },
  };
}
