// Pure, deterministic math behind the force-directed graph layout (components/use-force-layout.ts).
// Kept free of React/DOM so it is unit-testable and so the layout stays REPRODUCIBLE: a graph lays
// out the same way on every reload (and matches SSR). That rules out Math.random — asymmetry comes
// from a hash of each node's id instead, so it's stable yet not mirror-perfect.
//
// The simulation works in CENTRE coordinates (natural for d3's collide/charge); React Flow positions
// by top-left, so the hook converts (centre → top-left) when it writes node.position. Anchors and
// seeds returned here are therefore node CENTRES.
import type { Edge } from "@xyflow/react";
import { SIZES, type AppNode, type NodePosition } from "./graph-to-flow";
import { CIRCLE_DIAMETER, type RadialPosition, type RadialDepth } from "./radial-layout";
import type { SpiralPosition } from "./spiral-layout";
import type { QuestionItem, EvidenceItem } from "./graph-types";

/**
 * What the anchor hooks (useGraphAnchors / useRadialAnchors) hand the simulation: the per-node
 * anchors, the edges to render, the structural edges to use as springs, the raw nodes (carrying
 * stable data.item refs for streaming updates), and the topology key the sim reheats on.
 */
export interface AnchorFlow {
  anchors: ForceNodeMeta[];
  edges: Edge[];
  linkEdges: Edge[];
  dataNodes: AppNode[];
  topology: string;
}

/** The per-node input to the simulation: geometry + where it wants to sit + who birthed it. */
export interface ForceNodeMeta {
  id: string;
  type: AppNode["type"];
  /** Card/circle box size — used to convert centre↔top-left and to size the collision radius. */
  w: number;
  h: number;
  /** Collision radius (max half-extent). */
  radius: number;
  /** Where the node is pulled toward (centre coords): its dagre column / radial slot. */
  anchorX: number;
  anchorY: number;
  /** Edge-source node id, so a fresh node can spawn from its parent and spring outward. */
  parentId: string | null;
}

/** FNV-1a 32-bit hash → unsigned int. Deterministic; the seed for all jitter. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts (stays in 32-bit range without BigInt).
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic offset in [-amp, amp] for a node id, decorrelated per `salt` ("x" vs "y"). */
export function jitter(id: string, salt: string, amp: number): number {
  const unit = hashId(`${id}:${salt}`) / 0xffffffff; // [0, 1]
  return (unit * 2 - 1) * amp;
}

/** The edge-source (parent) of a node: claim→source, question→claim, evidence→question. */
export function parentOf(node: AppNode, sourceId: string): string | null {
  switch (node.type) {
    case "source":
      return null;
    case "claim":
      return sourceId;
    case "question":
      return (node.data.item as QuestionItem).claimId;
    case "evidence":
      return (node.data.item as EvidenceItem).questionId;
  }
}

const CARD_Y_JITTER = 12; // vertical break-symmetry for cards (x stays column-locked for #25)
const RADIAL_JITTER = 8; // small slot perturbation for the radial constellation

function cardRadius(type: AppNode["type"]): number {
  const s = SIZES[type];
  return Math.max(s.w, s.h) / 2;
}

/**
 * Card anchors: x is the node's own dagre column centre (so lanes AND the evidence grid survive a
 * strong forceX), y is its dagre centre nudged by a deterministic jitter so vertical physics has
 * something asymmetric to settle from. Positions in is top-left (dagre); we return centres.
 */
export function buildCardAnchors(
  nodes: AppNode[],
  positions: Map<string, NodePosition>,
  sourceId: string,
): ForceNodeMeta[] {
  return nodes.map((n) => {
    const s = SIZES[n.type];
    const p = positions.get(n.id);
    const cx = (p?.x ?? 0) + s.w / 2;
    const cy = (p?.y ?? 0) + s.h / 2;
    return {
      id: n.id,
      type: n.type,
      w: s.w,
      h: s.h,
      radius: cardRadius(n.type),
      anchorX: cx,
      anchorY: cy + jitter(n.id, "y", CARD_Y_JITTER),
      parentId: parentOf(n, sourceId),
    };
  });
}

/**
 * Radial anchors: the computed radial slot (already centre-origin) plus a small 2-D jitter, so the
 * rings/wedges stay legible while charge+collide perturb the circles organically around them.
 */
export function buildRadialAnchors(
  nodes: AppNode[],
  positions: Map<string, RadialPosition>,
  sourceId: string,
): ForceNodeMeta[] {
  return nodes.map((n) => {
    const p = positions.get(n.id);
    const d = p?.diameter ?? CIRCLE_DIAMETER[depthOf(n.type)];
    return {
      id: n.id,
      type: n.type,
      w: d,
      h: d,
      radius: d / 2,
      anchorX: (p?.x ?? 0) + jitter(n.id, "x", RADIAL_JITTER),
      anchorY: (p?.y ?? 0) + jitter(n.id, "y", RADIAL_JITTER),
      parentId: parentOf(n, sourceId),
    };
  });
}

function depthOf(type: AppNode["type"]): RadialDepth {
  return ({ source: 0, claim: 1, question: 2, evidence: 3 } as const)[type];
}

/**
 * Spiral anchors: the computed coil slot (centre-origin) plus the same small 2-D jitter as the
 * radial view, so charge+collide perturb the circles organically while the spiral shape holds. The
 * geometry is a SpiralPosition (vs RadialPosition) but the anchor shape is identical, so the force
 * layer treats the spiral exactly like the constellation.
 */
export function buildSpiralAnchors(
  nodes: AppNode[],
  positions: Map<string, SpiralPosition>,
  sourceId: string,
): ForceNodeMeta[] {
  return nodes.map((n) => {
    const p = positions.get(n.id);
    const d = p?.diameter ?? CIRCLE_DIAMETER[depthOf(n.type)];
    return {
      id: n.id,
      type: n.type,
      w: d,
      h: d,
      radius: d / 2,
      anchorX: (p?.x ?? 0) + jitter(n.id, "x", RADIAL_JITTER),
      anchorY: (p?.y ?? 0) + jitter(n.id, "y", RADIAL_JITTER),
      parentId: parentOf(n, sourceId),
    };
  });
}

const SEED_SPREAD = 24; // how far a new node spawns from its parent before springing out

/** Centre position for a freshly-added node: its parent's live centre + jitter, else its anchor. */
export function seedPosition(
  meta: ForceNodeMeta,
  parentCentre: { x: number; y: number } | null,
): { x: number; y: number } {
  if (!parentCentre) return { x: meta.anchorX, y: meta.anchorY };
  return {
    x: parentCentre.x + jitter(meta.id, "x", SEED_SPREAD),
    y: parentCentre.y + jitter(meta.id, "y", SEED_SPREAD),
  };
}
