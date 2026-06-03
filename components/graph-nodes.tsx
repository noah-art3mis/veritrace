import { createContext, memo, useContext } from "react";
import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import type { SourceNode, ClaimNode, QuestionNode, EvidenceNode } from "@/lib/graph-to-flow";
import { VERDICT_META, STANCE_META, RELIABILITY_META } from "@/lib/visuals";
import type {
  Verdict,
  Reliability,
  ClaimTally,
  QuestionTrace,
  SourceTextItem,
  ClaimItem,
  QuestionItem,
  EvidenceItem,
} from "@/lib/graph-types";
import { isRelevanceDropped } from "@/lib/pipeline/claim-status";

/**
 * Whether to reveal normally-hidden pipeline internals (HyDE seed, the agent's queries +
 * summary, stance confidence, the raw source fragment, the event date) in the node cards.
 * Driven by the "show pipeline internals" setting; provided by FactGraphCanvas. Default off.
 */
export const InternalsContext = createContext(false);

/**
 * Whether to withhold the machine's aggregate Verdict (the Source card's badge + support
 * ratio) so the Fact-checker reaches their own conclusion. Driven by the "withhold verdict"
 * setting; provided by FactGraphCanvas. Per-claim verdict badges and evidence stance colours
 * are intentionally NOT gated by this — they're observations, not the headline verdict. Default off.
 */
export const WithholdVerdictContext = createContext(false);

/**
 * Optional callback to re-include a relevance-dropped claim (#33): the user overrides the filter
 * and the claim is re-resolved (questions → search → verdict) in place. Provided by
 * FactGraphCanvas from the workbench; null when re-include isn't wired (e.g. the static mock).
 */
export const ReincludeContext = createContext<((claim: ClaimItem) => void) | null>(null);

const handleStyle = { width: 7, height: 7, border: 0, background: "var(--ink-4)" };
const IN = <Handle type="target" position={Position.Left} style={handleStyle} />;
const OUT = <Handle type="source" position={Position.Right} style={handleStyle} />;

/* Forensic registration marks — corner ticks on the "exhibit" cards. */
function Ticks() {
  const c = "absolute h-2 w-2 border-[var(--ink-4)]";
  return (
    <>
      <span className={`${c} left-1.5 top-1.5 border-l border-t`} />
      <span className={`${c} right-1.5 top-1.5 border-r border-t`} />
      <span className={`${c} bottom-1.5 left-1.5 border-b border-l`} />
      <span className={`${c} bottom-1.5 right-1.5 border-b border-r`} />
    </>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
      {children}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="vt-pulse h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent)" }}
        />
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          analyzing
        </span>
      </span>
    );
  }
  const m = VERDICT_META[verdict];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-[3px]"
      style={{ borderColor: `${m.color}55`, background: m.soft, boxShadow: `0 0 14px ${m.glow}` }}
    >
      {/* glyph + word are both non-colour cues, so the verdict reads without seeing hue (#8) */}
      <span
        aria-hidden
        className="font-mono text-[10px] font-bold leading-none"
        style={{ color: m.color }}
      >
        {m.glyph}
      </span>
      <span className="font-display text-[12.5px] italic leading-none" style={{ color: m.color }}>
        {m.label}
      </span>
    </span>
  );
}

/* A claim the relevance filter segmented out — shown for legibility, never searched. */
function DroppedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-[3px]"
      style={{ borderColor: "var(--line-2)", background: "transparent" }}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        ▽ dropped
      </span>
    </span>
  );
}

function ReliabilityMeter({ reliability }: { reliability: Reliability }) {
  const r = RELIABILITY_META[reliability];
  return (
    <span className="inline-flex items-center gap-1.5" title={`${r.label} reliability`}>
      <span className="flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[3px] rounded-[1px]"
            style={{
              height: `${3 + i * 2}px`,
              background: i <= r.level ? r.color : "var(--line-2)",
            }}
          />
        ))}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: r.color }}>
        {r.label}
      </span>
    </span>
  );
}

const cardShadow = "0 16px 36px -20px rgba(0,0,0,0.85)";

// Card width by context. In a graph node (`withHandles`) the width is fixed — the dagre/force
// layout measures it, so it must stay exact. In the radial detail panel (`withHandles={false}`)
// the card sits in a bottom-center overlay above the canvas; on a phone its fixed width is wider
// than the screen and gets clipped, so cap it to the viewport and let the text wrap to fit (#27).
function cardWidth(intrinsic: number, withHandles: boolean): number | string {
  return withHandles ? intrinsic : `min(${intrinsic}px, 88vw)`;
}

/* The graded support ratio — "X of N supported", with the rest broken down (SAFE F1@K). */
function SupportRatio({ tally }: { tally: ClaimTally }) {
  if (tally.total === 0 && !tally.dropped) return null;
  const parts: { n: number; verdict: Verdict }[] = [
    { n: tally.refuted, verdict: "refuted" },
    { n: tally.conflicting, verdict: "conflicting" },
    { n: tally.nei, verdict: "nei" },
  ];
  return (
    <div className="mt-2.5 flex items-center gap-2 px-1 font-mono text-[9.5px] uppercase tracking-wider">
      <span style={{ color: VERDICT_META.supported.color }}>
        {tally.supported} / {tally.total} supported
      </span>
      {parts
        .filter((p) => p.n > 0)
        .map((p) => (
          <span
            key={p.verdict}
            className="text-[var(--ink-3)]"
            style={{ color: VERDICT_META[p.verdict].color }}
          >
            · {p.n} {p.verdict === "nei" ? "NEI" : p.verdict}
          </span>
        ))}
      {tally.dropped ? (
        <span className="text-[var(--ink-3)]">· {tally.dropped} dropped</span>
      ) : null}
    </div>
  );
}

function TraceLabel({ children }: { children: React.ReactNode }) {
  return <span className="uppercase tracking-wider text-[var(--ink-4)]">{children}</span>;
}

/* The retrieval internals behind a question — HyDE seed, the agent's queries, its summary. */
function QuestionTraceBlock({ trace }: { trace: QuestionTrace }) {
  return (
    <div className="relative mt-2 flex flex-col gap-1.5 border-t border-[var(--line)] pt-2 font-mono text-[9.5px] leading-[1.5] text-[var(--ink-3)]">
      {trace.hydePassage && (
        <div>
          <TraceLabel>HyDE seed</TraceLabel>
          <p className="mt-0.5 italic text-[var(--ink-2)]">“{trace.hydePassage}”</p>
        </div>
      )}
      {trace.searchQueries.length > 0 && (
        <div>
          <TraceLabel>queries</TraceLabel>
          <ul className="mt-0.5">
            {trace.searchQueries.map((q, i) => (
              <li key={i} className="text-[var(--ink-2)]">
                › {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      {trace.walk && trace.walk.length > 0 && (
        <div>
          <TraceLabel>walk → origin</TraceLabel>
          <ol className="mt-0.5">
            {trace.walk.map((step) => (
              <li key={step.depth} className="text-[var(--ink-2)]">
                <span className="text-[var(--ink-4)]">{step.depth === 0 ? "●" : "↳"}</span>{" "}
                {step.domain}{" "}
                <span className="text-[var(--ink-4)]">
                  ({step.via === "link" ? "followed link" : "searched lead"})
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {trace.gatherSummary && (
        <div>
          <TraceLabel>summary</TraceLabel>
          <p className="mt-0.5 text-[var(--ink-2)]">{trace.gatherSummary}</p>
        </div>
      )}
    </div>
  );
}

/* The artifact under examination — the human-authored viral post, set in serif. `withHandles`
   is false when the card is rendered outside a React Flow node (the radial detail panel, #48),
   where <Handle>s have no node context and would misbehave. */
export function SourceCard({
  item,
  withHandles = true,
}: {
  item: SourceTextItem;
  withHandles?: boolean;
}) {
  const withhold = useContext(WithholdVerdictContext);
  // While analyzing (verdict still null) the badge is just a progress pulse, not a verdict, so
  // keep showing it even when withholding — only a resolved verdict is the "pre-chewed" answer.
  const hideVerdict = withhold && item.verdict !== null;
  return (
    <div
      className="vt-node relative rounded-lg border border-[var(--line-2)] bg-[var(--panel)] px-4 py-3.5"
      style={{ width: cardWidth(380, withHandles), boxShadow: cardShadow }}
    >
      <Ticks />
      <div className="mb-2.5 flex items-center justify-between px-1">
        <Kicker>Source · Exhibit</Kicker>
        {hideVerdict ? (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
            title="Verdict withheld — read the evidence and reach your own conclusion"
          >
            verdict withheld
          </span>
        ) : (
          <VerdictBadge verdict={item.verdict} />
        )}
      </div>
      <p className="font-display px-1 text-[15px] leading-[1.5] text-[var(--ink-1)]">{item.text}</p>
      {!hideVerdict && item.tally && <SupportRatio tally={item.tally} />}
      {withHandles && OUT}
    </div>
  );
}

function SourceNodeCard({ data }: NodeProps<SourceNode>) {
  return <SourceCard item={data.item} />;
}

/* A machine-extracted, decontextualized assertion — body sans; verdict in serif. */
export function ClaimCard({
  item,
  withHandles = true,
}: {
  item: ClaimItem;
  withHandles?: boolean;
}) {
  const internals = useContext(InternalsContext);
  const reinclude = useContext(ReincludeContext);
  const dropped = isRelevanceDropped(item);
  const m = item.verdict ? VERDICT_META[item.verdict] : null;
  const accent = m?.color ?? "var(--accent)";
  return (
    <div
      className="vt-node relative rounded-lg border bg-[var(--panel)] py-3 pl-4 pr-3.5"
      style={{
        width: cardWidth(320, withHandles),
        opacity: dropped ? 0.5 : 1,
        borderStyle: dropped ? "dashed" : "solid",
        borderColor: dropped ? "var(--line-2)" : m ? `${m.color}3d` : "var(--line)",
        boxShadow: dropped ? "none" : m ? `0 0 0 1px ${m.color}14, ${cardShadow}` : cardShadow,
      }}
    >
      {/* Verdict-colored left bar — the scannable signal (#23), and the same anatomy the evidence
          card uses (#26): a colored rail down the left edge. Neutral while analyzing or dropped. */}
      {!dropped && (
        <span
          aria-hidden
          className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
          style={{ background: accent }}
        />
      )}
      {withHandles && IN}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Kicker>Claim · {item.id.toUpperCase()}</Kicker>
          {internals && item.date && (
            <span
              className="font-mono text-[9px] tabular-nums text-[var(--ink-3)]"
              title="Event date parsed from the source — bounds the retrieval window"
            >
              {item.date}
            </span>
          )}
        </span>
        {dropped ? <DroppedBadge /> : <VerdictBadge verdict={item.verdict} />}
      </div>
      <p
        className="text-[12.5px] font-medium leading-[1.45]"
        style={{ color: dropped ? "var(--ink-2)" : "var(--ink-1)" }}
      >
        {item.text}
      </p>
      {internals && item.original && item.original.trim() !== item.text.trim() && (
        <p
          className="mt-1.5 font-mono text-[10px] leading-[1.5] text-[var(--ink-3)]"
          title="Verbatim fragment from the source, before decontextualization"
        >
          verbatim: “{item.original}”
        </p>
      )}
      {dropped && (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-3)]">
            ▽ background · not the contested claim — segmented out, not checked
          </p>
          {/* Override the relevance filter and search this claim after all (#33). The handler
              re-resolves it in place; null when re-include isn't wired (e.g. the static mock). */}
          {reinclude && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                reinclude(item);
              }}
              className="self-start rounded-md border border-[var(--line-2)] px-2 py-1 font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
            >
              ↑ re-include &amp; search
            </button>
          )}
        </div>
      )}
      {!dropped && item.rationale && (
        <p
          className="mt-2 border-l-2 pl-2 font-mono text-[10px] leading-[1.5] text-[var(--ink-2)]"
          style={{ borderColor: `${accent}80` }}
        >
          {item.rationale}
        </p>
      )}
      {!dropped && !item.checkable && (
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-3)]">
          ⚠ not text-verifiable
        </p>
      )}
      {!dropped && item.checkworthy === false && (
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-3)]">
          ⚠ opinion · not check-worthy
        </p>
      )}
      {item.injected && item.injected.length > 0 && (
        <p
          className="mt-2 font-mono text-[9.5px] uppercase tracking-wider"
          style={{ color: VERDICT_META.conflicting.color }}
          title="Specifics in the decontextualized claim not found in the source — verify they aren't over-specified."
        >
          ⚠ added detail: {item.injected.join(", ")}
        </p>
      )}
      {withHandles && OUT}
    </div>
  );
}

function ClaimNodeCard({ data }: NodeProps<ClaimNode>) {
  return <ClaimCard item={data.item} />;
}

/* The machine's probe — mono, phosphor cyan; shimmer sweep while Exa runs. */
export function QuestionCard({
  item,
  withHandles = true,
}: {
  item: QuestionItem;
  withHandles?: boolean;
}) {
  const internals = useContext(InternalsContext);
  const searching = item.status === "searching";
  return (
    <div
      className="vt-node relative overflow-hidden rounded-md border bg-[var(--panel-2)] py-2.5 pl-4 pr-3"
      style={{
        width: cardWidth(280, withHandles),
        borderColor: searching ? "rgba(58,214,230,0.45)" : "var(--line)",
      }}
    >
      {searching && <span className="vt-shimmer pointer-events-none absolute inset-0" />}
      {/* Left rail for anatomical parity with the claim/evidence cards (#26). Question color is
          process status, never veracity (ADR): cyan while searching, neutral otherwise. */}
      <span
        aria-hidden
        className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-full"
        style={{ background: searching ? "var(--accent)" : "var(--ink-4)" }}
      />
      {withHandles && IN}
      <div className="relative mb-1.5 flex items-center gap-2">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.2em]"
          style={{ color: "var(--accent)" }}
        >
          ?_ Question
        </span>
        {searching && (
          <span
            className="ml-auto inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider"
            style={{ color: "var(--accent)" }}
          >
            <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
            searching
          </span>
        )}
      </div>
      <p className="relative font-mono text-[11px] leading-[1.5] text-[var(--ink-2)]">
        {item.text}
      </p>
      {internals && item.trace && <QuestionTraceBlock trace={item.trace} />}
      {withHandles && OUT}
    </div>
  );
}

function QuestionNodeCard({ data }: NodeProps<QuestionNode>) {
  return <QuestionCard item={data.item} />;
}

/* A filed primary source — passage in serif (the quote), metadata in mono. */
export function EvidenceCard({
  item,
  withHandles = true,
}: {
  item: EvidenceItem;
  withHandles?: boolean;
}) {
  const internals = useContext(InternalsContext);
  const stance = STANCE_META[item.stance];
  return (
    <div
      className="vt-node relative rounded-lg border bg-[var(--panel)] py-3 pl-4 pr-3"
      style={{
        width: cardWidth(320, withHandles),
        borderColor: `${stance.color}3d`,
        boxShadow: `0 0 0 1px ${stance.color}14, ${cardShadow}`,
      }}
    >
      <span
        aria-hidden
        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
        style={{ background: stance.color }}
      />
      {withHandles && (
        <>
          {IN}
          {/* When a question's evidence wraps into a grid, each card feeds its right neighbour
              (the "comb" layout in graph-to-flow), so the right handle is a flow source. */}
          <Handle type="source" id="flow-out" position={Position.Right} style={handleStyle} />
          {/* Same-rank conflict overlay attaches here, not to the left/right flow handles. */}
          <Handle type="source" id="conflict-out" position={Position.Top} style={handleStyle} />
          <Handle type="target" id="conflict-in" position={Position.Bottom} style={handleStyle} />
        </>
      )}
      <div className="mb-1.5 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.faviconUrl}
          alt=""
          className="h-4 w-4 rounded-sm ring-1 ring-[var(--line-2)]"
        />
        <span className="truncate font-mono text-[10px] text-[var(--ink-2)]">{item.domain}</span>
        {item.publishedDate && (
          <span className="ml-auto font-mono text-[9.5px] tabular-nums text-[var(--ink-3)]">
            {item.publishedDate}
          </span>
        )}
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[12px] font-semibold leading-[1.35] text-[var(--ink-1)] transition-colors hover:text-white hover:underline"
      >
        {item.title}
      </a>
      <p
        className="font-display mt-1.5 line-clamp-3 border-l pl-2 text-[11.5px] italic leading-[1.45] text-[var(--ink-2)]"
        style={{ borderColor: stance.color }}
      >
        “{item.passage}”
      </p>
      <div className="mt-2.5 flex items-center gap-2.5">
        <span
          className="font-mono text-[9.5px] uppercase tracking-wider"
          style={{ color: stance.color }}
        >
          ▸ {stance.label}
        </span>
        <ReliabilityMeter reliability={item.reliability} />
        {internals && item.stanceConfidence != null && (
          <span
            className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-3)]"
            title="Classifier stance confidence — half the gate that lets evidence move a verdict"
          >
            conf {Math.round(item.stanceConfidence * 100)}%
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[var(--ink-3)]">
          {item.sourceType}
        </span>
      </div>
    </div>
  );
}

function EvidenceNodeCard({ data }: NodeProps<EvidenceNode>) {
  return <EvidenceCard item={data.item} />;
}

// Memoized so a stable node object (see useGraphFlow) skips re-rendering entirely. Cards still
// re-render on a real data change or when the InternalsContext toggle flips (context bypasses memo).
export const nodeTypes: NodeTypes = {
  source: memo(SourceNodeCard),
  claim: memo(ClaimNodeCard),
  question: memo(QuestionNodeCard),
  evidence: memo(EvidenceNodeCard),
};
