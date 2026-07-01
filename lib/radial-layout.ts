import type { Edge } from "@xyflow/react";
import type { ClaimItem, EvidenceItem, FactGraph } from "./graph-types";
import { STANCE_META, VERDICT_META } from "./visuals";
import { aggregateStanceColor, conflictEdges } from "./graph-to-flow";

// The radial "Constellation" overview layout (ADR 0003). A deterministic radial tidy tree:
// Source at the centre, then Claims → Questions → Evidence on concentric rings. Each Claim owns
// an angular WEDGE sized by its leaf (Evidence) count, which subdivides into its Questions and
// their Evidence — so a claim's whole subtree is one readable pie-slice and depth == ring.
//
// Force is NOT used here: this is the source-of-truth geometry. Any springy motion lives in the
// renderer's transition, never in where a node lives (the four layers must stay intact).

export type RadialDepth = 0 | 1 | 2 | 3;

export interface RadialPosition {
  x: number; // centre-origin coordinates (Source at 0,0)
  y: number;
  angle: number; // radians — centroid of this node's wedge
  radius: number; // distance from centre (== ring for its depth)
  depth: RadialDepth;
  diameter: number; // circle size — depth-only encoding (no data on size)
}

// Depth-only size encoding (ADR 0003): Source largest → Evidence smallest.
export const CIRCLE_DIAMETER: Record<RadialDepth, number> = { 0: 64, 1: 44, 2: 30, 3: 20 };

// Arc each Evidence slot reserves (diameter + breathing gap). The outer radius grows with the slot
// count so a big investigation spreads its claims/questions outward instead of crowding — fitView
// then frames the whole constellation.
const EV_PITCH = CIRCLE_DIAMETER[3] + 16;
const MIN_OUTER_RADIUS = 240;

// Evidence no longer rides the rim on a long spoke (#107): each question's sources cluster as a
// tight halo just OUTSIDE the question circle. The gap clears the question circle (radius 15) and an
// evidence circle (radius 10) with breathing room, so the parent→child link reads as proximity, not
// a long radial line — while evidence still sits on a ring strictly outside its question (depth read
// intact). The halo is fanned around the question's own angle, never wider than its wedge so two
// questions' sources can't intermix.
const EV_CLUSTER_GAP = 52;

// A branch that hasn't produced children yet (mid-stream) still owns a slot, so circles don't
// jump rings when their first child lands — they just subdivide an already-reserved wedge.
const weightFloor = (n: number) => Math.max(n, 1);

/** Lay the graph out radially. Pure + deterministic; positions are centre-origin. */
export function radialLayout(graph: FactGraph): Map<string, RadialPosition> {
  const positions = new Map<string, RadialPosition>();

  const questionsByClaim = new Map<string, FactGraph["questions"]>();
  for (const q of graph.questions) {
    const bucket = questionsByClaim.get(q.claimId) ?? [];
    bucket.push(q);
    questionsByClaim.set(q.claimId, bucket);
  }
  const evidenceByQuestion = new Map<string, FactGraph["evidence"]>();
  for (const e of graph.evidence) {
    const bucket = evidenceByQuestion.get(e.questionId) ?? [];
    bucket.push(e);
    evidenceByQuestion.set(e.questionId, bucket);
  }

  const evWeight = (qId: string) => weightFloor(evidenceByQuestion.get(qId)?.length ?? 0);
  const claimWeight = (cId: string) => {
    const qs = questionsByClaim.get(cId) ?? [];
    if (qs.length === 0) return 1;
    return qs.reduce((sum, q) => sum + evWeight(q.id), 0);
  };

  const totalSlots = graph.claims.reduce((sum, c) => sum + claimWeight(c.id), 0) || 1;
  const outerRadius = Math.max(MIN_OUTER_RADIUS, (totalSlots * EV_PITCH) / (2 * Math.PI));
  const ring: Record<RadialDepth, number> = {
    0: 0,
    1: outerRadius * 0.34,
    2: outerRadius * 0.67,
    3: outerRadius * 0.67 + EV_CLUSTER_GAP, // a short hop beyond the question, not at the rim (#107)
  };

  const place = (id: string, angle: number, depth: RadialDepth) => {
    const radius = ring[depth];
    positions.set(id, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      angle,
      radius,
      depth,
      diameter: CIRCLE_DIAMETER[depth],
    });
  };

  place(graph.source.id, 0, 0);

  const FULL = 2 * Math.PI;
  let cursor = -Math.PI / 2; // begin at 12 o'clock so the first claim reads top-centre

  for (const claim of graph.claims) {
    const cStart = cursor;
    const cEnd = cStart + (claimWeight(claim.id) / totalSlots) * FULL;
    place(claim.id, (cStart + cEnd) / 2, 1);

    const qs = questionsByClaim.get(claim.id) ?? [];
    const qTotal = qs.reduce((sum, q) => sum + evWeight(q.id), 0) || 1;
    let qCursor = cStart;
    for (const q of qs) {
      const qStart = qCursor;
      const qEnd = qStart + (cEnd - cStart) * (evWeight(q.id) / qTotal);
      place(q.id, (qStart + qEnd) / 2, 2);

      const evs = evidenceByQuestion.get(q.id) ?? [];
      if (evs.length > 0) {
        // Fan the sources around the question's OWN angle as a tight cluster (#107). Pitch is just
        // enough to clear neighbouring circles at the cluster radius, but never wider than the
        // question's wedge — so a generous wedge yields a compact halo, a cramped one fills exactly.
        const qAngle = (qStart + qEnd) / 2;
        const pitch = Math.min(EV_PITCH / ring[3], (qEnd - qStart) / evs.length);
        const mid = (evs.length - 1) / 2;
        evs.forEach((e, i) => place(e.id, qAngle + (i - mid) * pitch, 3));
      }
      qCursor = qEnd;
    }
    cursor = cEnd;
  }

  return positions;
}

// --- Edges -------------------------------------------------------------------------------------
// Structural spokes are thin (parentage is mostly carried by position) but carry the claim's colour
// so the source support reading back-propagates along source → claim → question; they fall back to
// the faint slate when nothing decides. The question→evidence spoke keeps its stance colour + text
// label (a non-colour read of stance, kept on purpose). The conflict overlay rides in as interior
// chords — the one edge that encodes what position doesn't.

const FAINT_STROKE = "#2b3645";

// Structural spokes stay thin (parentage is carried by position in the radial view) but take the
// claim's colour, so the source support reading propagates back along source → claim → question
// just as it does in the card view (#24): verdict colour once resolved, else the aggregate deciding
// stance of the evidence below, else the faint slate. `evidence` is the subtree under the node the
// spoke points at — the claim's whole set for source→claim, one question's set for claim→question.
function structuralStroke(claim: ClaimItem | undefined, evidence: EvidenceItem[]): string {
  if (claim?.verdict) return VERDICT_META[claim.verdict].color;
  return aggregateStanceColor(evidence) ?? FAINT_STROKE;
}

function spoke(source: string, target: string, stroke: string): Edge {
  return {
    id: `r-${source}-${target}`,
    source,
    target,
    type: "straight",
    style: { stroke, strokeWidth: 1 },
  };
}

function stanceSpoke(source: string, evId: string, stance: keyof typeof STANCE_META): Edge {
  const stroke = STANCE_META[stance].color;
  // The RadialLabelEdge custom edge renders the label from `data`, zoom-gated (#47), instead of
  // React Flow's always-on edge label. Stance colour stays on the stroke so the spoke still reads.
  return {
    id: `r-${source}-${evId}`,
    source,
    target: evId,
    type: "radialLabel",
    style: { stroke, strokeWidth: 1.5 },
    data: { label: STANCE_META[stance].label, color: stroke },
  };
}

/** Structural spokes + stance-labelled evidence spokes + conflict chords for the radial view. */
export function buildRadialEdges(graph: FactGraph): Edge[] {
  const edges: Edge[] = [];
  const claimById = new Map(graph.claims.map((c) => [c.id, c]));
  const claimOfQuestion = new Map(graph.questions.map((q) => [q.id, q.claimId]));
  const evidenceByClaim = new Map<string, EvidenceItem[]>();
  const evidenceByQuestion = new Map<string, EvidenceItem[]>();
  const push = (map: Map<string, EvidenceItem[]>, key: string, ev: EvidenceItem) => {
    const bucket = map.get(key) ?? [];
    bucket.push(ev);
    map.set(key, bucket);
  };
  for (const ev of graph.evidence) {
    push(evidenceByQuestion, ev.questionId, ev);
    const claimId = claimOfQuestion.get(ev.questionId);
    if (claimId) push(evidenceByClaim, claimId, ev);
  }
  for (const claim of graph.claims)
    edges.push(
      spoke(
        graph.source.id,
        claim.id,
        structuralStroke(claim, evidenceByClaim.get(claim.id) ?? []),
      ),
    );
  for (const q of graph.questions)
    edges.push(
      spoke(
        q.claimId,
        q.id,
        structuralStroke(claimById.get(q.claimId), evidenceByQuestion.get(q.id) ?? []),
      ),
    );
  for (const ev of graph.evidence) edges.push(stanceSpoke(ev.questionId, ev.id, ev.stance));
  // Reuse the card view's conflict computation, but drop the card-specific handles (circles route
  // edges centre-to-centre) so the chord cuts straight across the interior. Route it through the
  // zoom-aware custom edge too, so the "conflicts" label fades with the spoke labels (#47).
  for (const ce of conflictEdges(graph)) {
    edges.push({
      ...ce,
      sourceHandle: undefined,
      targetHandle: undefined,
      type: "radialLabel",
      data: {
        label: typeof ce.label === "string" ? ce.label : "conflicts",
        color: (ce.style?.stroke as string) ?? undefined,
      },
    });
  }
  return edges;
}
