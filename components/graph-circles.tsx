import { memo } from "react";
import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import type {
  SourceNode,
  ClaimNode,
  QuestionNode,
  EvidenceNode,
  AppNode,
} from "@/lib/graph-to-flow";
import { CIRCLE_DIAMETER } from "@/lib/radial-layout";
import { VERDICT_META, STANCE_META, RELIABILITY_META, ACCENT } from "@/lib/visuals";
import { isDeciding } from "@/lib/pipeline/verdict";
import { isRelevanceDropped } from "@/lib/pipeline/claim-status";
import { SourceCard, ClaimCard, QuestionCard, EvidenceCard } from "./graph-nodes";

// The radial "Constellation" view (ADR 0003) renders each node as a coloured circle instead of a
// card. One channel per signal so a small dot stays legible:
//   fill   = the layer's semantic axis (Verdict for Source/Claim, Stance for Evidence; Questions
//            stay neutral/cyan process status — never red/green)
//   halo   = reliability ring (Evidence only; thicker/brighter == more reliable)
//   star   = "important": deciding Evidence, and refuted Claims
//   size   = depth only (Source largest → Evidence smallest), carries no data
// Detail is hidden until peek/open — see NodeDetail, driven by the canvas.

// Edges route centre-to-centre, so both handles sit (hidden) at the circle's middle.
const HUB = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 0,
  background: "transparent",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none" as const,
};

function Hub() {
  return (
    <>
      <Handle type="target" position={Position.Top} style={HUB} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={HUB} isConnectable={false} />
    </>
  );
}

function Star({ color, size }: { color: string; size: number }) {
  return (
    <span
      aria-hidden
      className="leading-none"
      style={{ fontSize: size, color, textShadow: "0 0 4px rgba(0,0,0,0.6)" }}
    >
      ★
    </span>
  );
}

/** The shared circle shell — fill, border, optional reliability halo, optional star, depth size. */
function Circle({
  diameter,
  border,
  fill,
  halo,
  star,
  dim,
  pulse,
}: {
  diameter: number;
  border: string;
  fill: string;
  halo?: string;
  star?: boolean;
  dim?: boolean;
  pulse?: boolean;
}) {
  return (
    <div className="vt-pop-circle relative" style={{ width: diameter, height: diameter }}>
      <div
        className={`flex items-center justify-center rounded-full ${pulse ? "vt-pulse" : ""}`}
        style={{
          width: diameter,
          height: diameter,
          background: fill,
          border: `2px solid ${border}`,
          // halo encodes reliability as an outer ring (kept off opacity — opacity means "dropped")
          boxShadow: halo,
          opacity: dim ? 0.5 : 1,
        }}
      >
        {star && <Star color={border} size={Math.round(diameter * 0.5)} />}
      </div>
      <Hub />
    </div>
  );
}

// Source/claim circles must read as OPAQUE — matching the question circles — so the background
// grid and connectors don't show through and muddy legibility (#30). The verdict `soft` tint is
// translucent, so we composite it over the opaque panel: two flat gradient stops of the tint
// layered on var(--panel-2) yield an opaque fill that still carries the verdict colour. (The
// verdict is also on the border; `dim` opacity for dropped claims is unaffected — that stays the
// one meaning of transparency here.)
function opaqueFill(tint: string): string {
  return `linear-gradient(0deg, ${tint}, ${tint}), var(--panel-2)`;
}

/* Source — aggregate Verdict, biggest circle, never starred. */
function SourceCircle({ data }: NodeProps<SourceNode>) {
  const m = data.item.verdict ? VERDICT_META[data.item.verdict] : null;
  return (
    <Circle
      diameter={CIRCLE_DIAMETER[0]}
      border={m?.color ?? ACCENT}
      fill={opaqueFill(m?.soft ?? "rgba(58,214,230,0.10)")}
      pulse={!data.item.verdict}
    />
  );
}

/* Claim — Verdict fill; star == refuted (the debunked payload); dim == relevance-dropped. */
function ClaimCircle({ data }: NodeProps<ClaimNode>) {
  const m = data.item.verdict ? VERDICT_META[data.item.verdict] : null;
  return (
    <Circle
      diameter={CIRCLE_DIAMETER[1]}
      border={m?.color ?? ACCENT}
      fill={opaqueFill(m?.soft ?? "rgba(58,214,230,0.08)")}
      star={data.item.verdict === "refuted"}
      dim={isRelevanceDropped(data.item)}
      pulse={!data.item.verdict && !isRelevanceDropped(data.item)}
    />
  );
}

/* Question — process status, never a veracity colour: cyan pulse while searching, else neutral. */
function QuestionCircle({ data }: NodeProps<QuestionNode>) {
  const searching = data.item.status === "searching";
  const pending = data.item.status === "pending";
  return (
    <Circle
      diameter={CIRCLE_DIAMETER[2]}
      border={searching ? ACCENT : "var(--ink-4)"}
      fill={searching ? "rgba(58,214,230,0.10)" : "var(--panel-2)"}
      dim={pending}
      pulse={searching}
    />
  );
}

const RELIABILITY_HALO: Record<keyof typeof RELIABILITY_META, (c: string) => string> = {
  high: (c) => `0 0 0 3px ${c}99, 0 0 10px ${c}55`,
  medium: (c) => `0 0 0 2px ${c}66`,
  low: (c) => `0 0 0 1px ${c}40`,
};

/* Evidence — Stance fill; reliability halo ring; star == deciding (it can move the Verdict). */
function EvidenceCircle({ data }: NodeProps<EvidenceNode>) {
  const stance = STANCE_META[data.item.stance];
  return (
    <Circle
      diameter={CIRCLE_DIAMETER[3]}
      border={stance.color}
      fill={`${stance.color}22`}
      halo={RELIABILITY_HALO[data.item.reliability](stance.color)}
      star={isDeciding(data.item)}
    />
  );
}

export const circleNodeTypes: NodeTypes = {
  source: memo(SourceCircle),
  claim: memo(ClaimCircle),
  question: memo(QuestionCircle),
  evidence: memo(EvidenceCircle),
};

// --- Detail panel ------------------------------------------------------------------------------
// The peek-then-open surface (ADR 0003). Hover/tap shows the compact head (identity + the colour
// spelled out in words, so it reads without seeing hue); opening adds the body. This is the
// non-colour path that keeps the circle view usable on touch and for colourblind users.

function detailHead(node: AppNode): {
  kicker: string;
  colourWord: string;
  colour: string;
  glyph: string;
} {
  switch (node.type) {
    case "source": {
      const m = node.data.item.verdict ? VERDICT_META[node.data.item.verdict] : null;
      return {
        kicker: "Source",
        colourWord: m?.label ?? "analyzing",
        colour: m?.color ?? ACCENT,
        glyph: m?.glyph ?? "•",
      };
    }
    case "claim": {
      const m = node.data.item.verdict ? VERDICT_META[node.data.item.verdict] : null;
      const dropped = isRelevanceDropped(node.data.item);
      return {
        kicker: `Claim · ${node.data.item.id.toUpperCase()}`,
        colourWord: dropped ? "dropped" : (m?.label ?? "analyzing"),
        colour: m?.color ?? ACCENT,
        glyph: dropped ? "▽" : (m?.glyph ?? "•"),
      };
    }
    case "question":
      return { kicker: "Question", colourWord: node.data.item.status, colour: ACCENT, glyph: "•" };
    case "evidence": {
      const s = STANCE_META[node.data.item.stance];
      return {
        kicker: `Evidence · ${node.data.item.domain}`,
        colourWord: `${s.label} · ${node.data.item.reliability} reliability`,
        colour: s.color,
        glyph: s.glyph,
      };
    }
  }
}

/* The opened panel renders the REAL card component (handle-free), for visual parity with the card
   view (#48). The cards read InternalsContext / WithholdVerdictContext themselves, so internals and
   the withheld-verdict state carry through. Handles are off — NodeDetail isn't a node context. */
function RealCard({ node }: { node: AppNode }) {
  switch (node.type) {
    case "source":
      return <SourceCard item={node.data.item} withHandles={false} />;
    case "claim":
      return <ClaimCard item={node.data.item} withHandles={false} />;
    case "question":
      return <QuestionCard item={node.data.item} withHandles={false} />;
    case "evidence":
      return <EvidenceCard item={node.data.item} withHandles={false} />;
  }
}

export function NodeDetail({
  node,
  full,
  onOpen,
  onClose,
}: {
  node: AppNode;
  full: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const head = detailHead(node);

  // Opened: show the actual card (#48) so the open state matches the card view exactly.
  if (full) {
    return (
      <div className="flex max-w-[88vw] flex-col items-end gap-1.5">
        <RealCard node={node} />
        <button
          onClick={onClose}
          className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-3)] hover:text-[var(--ink-1)]"
        >
          close ✕
        </button>
      </div>
    );
  }

  // Peek (hover / first tap): the compact identity head — the colour spelled out in words so it
  // reads without seeing hue. A second click ("open") swaps in the real card above.
  return (
    <div
      className="w-[300px] max-w-[84vw] rounded-lg border border-[var(--line-2)] bg-[var(--panel)] p-3 shadow-xl"
      style={{ boxShadow: `0 0 0 1px ${head.colour}22, 0 16px 36px -20px rgba(0,0,0,0.85)` }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          {head.kicker}
        </span>
        <span
          className="font-mono text-[9.5px] uppercase tracking-wider"
          style={{ color: head.colour }}
        >
          <span aria-hidden className="font-bold">
            {head.glyph}
          </span>{" "}
          {head.colourWord}
        </span>
      </div>

      {node.type === "source" && (
        <p className="font-display line-clamp-3 text-[13px] leading-[1.5] text-[var(--ink-1)]">
          {node.data.item.text}
        </p>
      )}
      {node.type === "claim" && (
        <p className="line-clamp-3 text-[12px] font-medium leading-[1.4] text-[var(--ink-1)]">
          {node.data.item.text}
        </p>
      )}
      {node.type === "question" && (
        <p className="line-clamp-3 font-mono text-[11px] leading-[1.5] text-[var(--ink-2)]">
          {node.data.item.text}
        </p>
      )}
      {node.type === "evidence" && (
        <span className="block truncate text-[12px] font-semibold leading-[1.35] text-[var(--ink-1)]">
          {node.data.item.title}
        </span>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onOpen}
          className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--accent)] hover:underline"
        >
          open ↗
        </button>
        <button
          onClick={onClose}
          className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-3)] hover:text-[var(--ink-1)]"
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
