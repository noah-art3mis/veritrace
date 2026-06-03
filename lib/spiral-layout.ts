import type { Edge } from "@xyflow/react";
import type { FactGraph, EvidenceItem } from "./graph-types";
import { CIRCLE_DIAMETER, type RadialDepth, buildRadialEdges } from "./radial-layout";

// The "Spiral" depth-walk layout — a spiral galaxy, the companion to depth mode. The Source is the
// galactic core; each Claim is the root of its own spiral ARM radiating from the core; and that
// claim's Evidence is threaded OUTWARD along the arm in depth-walk order (hop 0 nearest the core,
// the origin furthest out). Five claims → five arms — "the Milky Way": a central bulge with long
// strands trailing off it. Every arm curls the same way (a shared per-hop angular twist), which is
// what turns a set of radial spokes into a pinwheel.
//
// Where the radial Constellation reads the BREADTH of a fan-out (each layer on its own ring), the
// galaxy reads the DEPTH of a walk: an arm's length is how far that claim was traced toward its
// origin. When a claim has more than one question, the arm FORKS — one sub-strand per question,
// fanned slightly apart at the root so the QA-pairs stay legible — then each sub-strand winds out on
// its own.
//
// Like the radial layout this is the source-of-truth geometry; springy motion lives in the force
// layer's transition. The four layers stay intact — encoded by circle size (depth), not by ring —
// so the spiral is a third *rendering* of the same graph, never a new topology.

export type SpiralDepth = RadialDepth;

export interface SpiralPosition {
  x: number; // centre-origin coordinates (Source at 0,0 — the galactic core)
  y: number;
  angle: number; // radians — direction of this node along its arm
  radius: number; // distance from the core — grows outward along the arm (hop distance)
  depth: SpiralDepth;
  diameter: number; // circle size — depth-only encoding (same as the radial view)
}

// Galaxy geometry. Claims sit on an inner ring (CLAIM_RADIUS), their questions a little further out
// (QUESTION_RADIUS) at the root of each evidence strand; every evidence hop steps HOP_PITCH further
// out and twists the arm by ARM_CURL, so the strand spirals. ARM_CURL shares one sign across all
// arms ⇒ a coherent pinwheel rather than straight spokes. QUESTION_FAN spreads a claim's question
// sub-arms apart at the root so a forked arm reads as distinct strands.
const CLAIM_RADIUS = 120;
const QUESTION_RADIUS = 210;
const HOP_PITCH = 72; // radial step per evidence hop along an arm
const ARM_CURL = 0.22; // radians a strand twists per hop (shared sign ⇒ pinwheel)
const QUESTION_FAN = 0.34; // angular spread between a claim's question sub-arms
const START_ANGLE = -Math.PI / 2; // the first claim's arm points up (12 o'clock)

const DEPTH_OF: Record<"source" | "claim" | "question" | "evidence", SpiralDepth> = {
  source: 0,
  claim: 1,
  question: 2,
  evidence: 3,
};

// Evidence along an arm reads in walk order: hop 0 nearest the core, then 1, 2, … toward the origin.
// Breadth-gathered evidence has no `depth`, so it keeps its retrieved order (stable sort) and trails
// after any hopped evidence.
function byHop(a: EvidenceItem, b: EvidenceItem): number {
  return (a.depth ?? Number.POSITIVE_INFINITY) - (b.depth ?? Number.POSITIVE_INFINITY);
}

/**
 * Lay the graph out as a spiral galaxy. Pure + deterministic; positions are centre-origin. The
 * Source is the core; each Claim roots an arm at an evenly-distributed angle; each Question forks the
 * arm; each Question's Evidence threads outward by hop, twisting as it goes. A claim's whole subtree
 * is therefore one coherent arm, and the further out a node sits the deeper the walk reached.
 */
export function spiralLayout(graph: FactGraph): Map<string, SpiralPosition> {
  const positions = new Map<string, SpiralPosition>();
  const place = (id: string, angle: number, radius: number, depth: SpiralDepth) => {
    positions.set(id, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      angle,
      radius,
      depth,
      diameter: CIRCLE_DIAMETER[depth],
    });
  };

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

  // The Source is the galactic core.
  place(graph.source.id, 0, 0, DEPTH_OF.source);

  // One arm per claim, evenly distributed around the core.
  const armCount = Math.max(graph.claims.length, 1);
  graph.claims.forEach((claim, ci) => {
    const armAngle = START_ANGLE + (ci * 2 * Math.PI) / armCount;
    place(claim.id, armAngle, CLAIM_RADIUS, DEPTH_OF.claim);

    const qs = questionsByClaim.get(claim.id) ?? [];
    qs.forEach((q, qi) => {
      // Fan the claim's questions symmetrically around its arm angle, so a multi-question claim
      // forks into distinct sub-strands instead of stacking them on one line.
      const qAngle = armAngle + (qi - (qs.length - 1) / 2) * QUESTION_FAN;
      place(q.id, qAngle, QUESTION_RADIUS, DEPTH_OF.question);

      // Thread the evidence outward along the sub-arm, twisting by ARM_CURL each hop so the strand
      // spirals. Spacing is by array index (even), order is by walk hop.
      const evs = [...(evidenceByQuestion.get(q.id) ?? [])].sort(byHop);
      evs.forEach((e, ei) => {
        place(
          e.id,
          qAngle + (ei + 1) * ARM_CURL,
          QUESTION_RADIUS + (ei + 1) * HOP_PITCH,
          DEPTH_OF.evidence,
        );
      });
    });
  });

  return positions;
}

/**
 * Edges for the spiral view. Reuses the radial edge set — verdict-coloured structural spokes plus
 * stance-labelled evidence spokes and conflict chords — so parentage and stance read the same way
 * they do in the Constellation; only the node placement (galaxy arms vs concentric rings) differs.
 */
export function buildSpiralEdges(graph: FactGraph): Edge[] {
  return buildRadialEdges(graph);
}
