import type { Edge } from "@xyflow/react";
import type { FactGraph, EvidenceItem } from "./graph-types";
import { CIRCLE_DIAMETER, type RadialDepth, buildRadialEdges } from "./radial-layout";

// The "Spiral" depth-walk layout — the companion to depth mode. Where the radial Constellation puts
// each layer on its own concentric ring (good for reading the breadth of a fan-out), the spiral
// winds the whole investigation outward along ONE Archimedean coil, in reading order: Source at the
// centre, then each Claim, its Questions, and each Question's Evidence — and crucially, the evidence
// under a question is ordered by its DEPTH-WALK hop, so a chain the agent traced from echo → origin
// reads as a continuous outward arc. Depth-as-distance: the deeper the walk went toward the source,
// the further out along the coil it sits.
//
// Like the radial layout this is the source-of-truth geometry; any springy motion lives in the
// force layer's transition. The four layers stay intact — encoded by circle size (depth), not by
// ring — so the spiral is a third *rendering* of the same graph, never a new topology.

export type SpiralDepth = RadialDepth;

export interface SpiralPosition {
  x: number; // centre-origin coordinates (Source at 0,0)
  y: number;
  angle: number; // radians along the coil
  radius: number; // distance from centre — grows monotonically along the walk
  depth: SpiralDepth;
  diameter: number; // circle size — depth-only encoding (same as the radial view)
}

// Archimedean spiral r = B·θ. B sets how fast the coil expands per radian; the angular step per node
// is arc-length normalised (Δθ ≈ pitch / r) so circles stay ~evenly spaced as the radius grows
// instead of bunching near the centre. START clears the source before the first claim lands.
const SPIRAL_B = 24;
const SPIRAL_GAP = 18; // min gap between consecutive circles along the coil
const SPIRAL_START = 2.4; // starting angle (radians)

const DEPTH_OF: Record<"source" | "claim" | "question" | "evidence", SpiralDepth> = {
  source: 0,
  claim: 1,
  question: 2,
  evidence: 3,
};

// Evidence under one question reads in walk order: hop 0 first, then 1, 2, … toward the origin.
// Breadth-gathered evidence has no `depth`, so it keeps its retrieved order (stable sort).
function byHop(a: EvidenceItem, b: EvidenceItem): number {
  return (a.depth ?? Number.POSITIVE_INFINITY) - (b.depth ?? Number.POSITIVE_INFINITY);
}

/**
 * Lay the graph out as one spiral. Pure + deterministic; positions are centre-origin. The node
 * VISIT ORDER (source → per claim: claim, then per question: question, then its evidence by hop) is
 * what the coil traces, so a claim's whole subtree stays contiguous and a depth chain winds outward.
 */
export function spiralLayout(graph: FactGraph): Map<string, SpiralPosition> {
  const positions = new Map<string, SpiralPosition>();

  const questionsByClaim = new Map<string, FactGraph["questions"]>();
  for (const q of graph.questions) {
    const bucket = questionsByClaim.get(q.claimId) ?? [];
    bucket.push(q);
    questionsByClaim.set(q.claimId, bucket);
  }
  const evidenceByQuestion = new Map<string, EvidenceItem[]>();
  for (const e of graph.evidence) {
    const bucket = evidenceByQuestion.get(e.questionId) ?? [];
    bucket.push(e);
    evidenceByQuestion.set(e.questionId, bucket);
  }

  // Build the reading-order list of (id, depth) the coil will trace, source first.
  const order: { id: string; depth: SpiralDepth }[] = [
    { id: graph.source.id, depth: DEPTH_OF.source },
  ];
  for (const claim of graph.claims) {
    order.push({ id: claim.id, depth: DEPTH_OF.claim });
    for (const q of questionsByClaim.get(claim.id) ?? []) {
      order.push({ id: q.id, depth: DEPTH_OF.question });
      for (const e of [...(evidenceByQuestion.get(q.id) ?? [])].sort(byHop)) {
        order.push({ id: e.id, depth: DEPTH_OF.evidence });
      }
    }
  }

  // Source sits at the centre; the rest wind outward along the Archimedean coil.
  const [head, ...rest] = order;
  positions.set(head.id, {
    x: 0,
    y: 0,
    angle: 0,
    radius: 0,
    depth: head.depth,
    diameter: CIRCLE_DIAMETER[head.depth],
  });

  let theta = SPIRAL_START;
  for (const node of rest) {
    const radius = SPIRAL_B * theta;
    const diameter = CIRCLE_DIAMETER[node.depth];
    positions.set(node.id, {
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
      angle: theta,
      radius,
      depth: node.depth,
      diameter,
    });
    // Advance by an arc-length-normalised step so spacing stays ~constant as the coil expands.
    theta += (diameter + SPIRAL_GAP) / Math.max(radius, SPIRAL_B);
  }

  return positions;
}

/**
 * Edges for the spiral view. Reuses the radial edge set — verdict-coloured structural spokes plus
 * stance-labelled evidence spokes and conflict chords — so parentage and stance read the same way
 * they do in the Constellation; only the node placement (coil vs rings) differs.
 */
export function buildSpiralEdges(graph: FactGraph): Edge[] {
  return buildRadialEdges(graph);
}
