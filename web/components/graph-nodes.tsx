import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import type {
  SourceNode,
  ClaimNode,
  QuestionNode,
  EvidenceNode,
} from "@/lib/graph-to-flow";
import { VERDICT_META, STANCE_META, RELIABILITY_META } from "@/lib/visuals";
import type { Verdict, Reliability, ClaimTally } from "@/lib/graph-types";

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
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      <span
        className="font-display text-[12.5px] italic leading-none"
        style={{ color: m.color }}
      >
        {m.label}
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
      <span
        className="font-mono text-[9px] uppercase tracking-wider"
        style={{ color: r.color }}
      >
        {r.label}
      </span>
    </span>
  );
}

const cardShadow = "0 16px 36px -20px rgba(0,0,0,0.85)";

/* The graded support ratio — "X of N supported", with the rest broken down (SAFE F1@K). */
function SupportRatio({ tally }: { tally: ClaimTally }) {
  if (tally.total === 0) return null;
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
          <span key={p.verdict} className="text-[var(--ink-3)]" style={{ color: VERDICT_META[p.verdict].color }}>
            · {p.n} {p.verdict === "nei" ? "NEI" : p.verdict}
          </span>
        ))}
    </div>
  );
}

/* The artifact under examination — the human-authored viral post, set in serif. */
function SourceNodeCard({ data }: NodeProps<SourceNode>) {
  const { item } = data;
  return (
    <div
      className="vt-node relative rounded-lg border border-[var(--line-2)] bg-[var(--panel)] px-4 py-3.5"
      style={{ width: 380, boxShadow: cardShadow }}
    >
      <Ticks />
      <div className="mb-2.5 flex items-center justify-between px-1">
        <Kicker>Source · Exhibit</Kicker>
        <VerdictBadge verdict={item.verdict} />
      </div>
      <p className="font-display px-1 text-[15px] leading-[1.5] text-[var(--ink-1)]">
        {item.text}
      </p>
      {item.tally && <SupportRatio tally={item.tally} />}
      {OUT}
    </div>
  );
}

/* A machine-extracted, decontextualized assertion — body sans; verdict in serif. */
function ClaimNodeCard({ data }: NodeProps<ClaimNode>) {
  const { item } = data;
  const m = item.verdict ? VERDICT_META[item.verdict] : null;
  const accent = m?.color ?? "var(--accent)";
  return (
    <div
      className="vt-node relative rounded-lg border bg-[var(--panel)] px-3.5 py-3"
      style={{
        width: 320,
        borderColor: m ? `${m.color}3d` : "var(--line)",
        boxShadow: m ? `0 0 0 1px ${m.color}14, ${cardShadow}` : cardShadow,
      }}
    >
      {IN}
      <div className="mb-2 flex items-center justify-between gap-2">
        <Kicker>Claim · {item.id.toUpperCase()}</Kicker>
        <VerdictBadge verdict={item.verdict} />
      </div>
      <p className="text-[12.5px] font-medium leading-[1.45] text-[var(--ink-1)]">
        {item.text}
      </p>
      {item.rationale && (
        <p
          className="mt-2 border-l-2 pl-2 font-mono text-[10px] leading-[1.5] text-[var(--ink-2)]"
          style={{ borderColor: `${accent}80` }}
        >
          {item.rationale}
        </p>
      )}
      {!item.checkable && (
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-3)]">
          ⚠ not text-verifiable
        </p>
      )}
      {item.checkworthy === false && (
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
      {OUT}
    </div>
  );
}

/* The machine's probe — mono, phosphor cyan; shimmer sweep while Exa runs. */
function QuestionNodeCard({ data }: NodeProps<QuestionNode>) {
  const { item } = data;
  const searching = item.status === "searching";
  return (
    <div
      className="vt-node relative overflow-hidden rounded-md border bg-[var(--panel-2)] px-3 py-2.5"
      style={{
        width: 280,
        borderColor: searching ? "rgba(58,214,230,0.45)" : "var(--line)",
      }}
    >
      {searching && <span className="vt-shimmer pointer-events-none absolute inset-0" />}
      {IN}
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
      {OUT}
    </div>
  );
}

/* A filed primary source — passage in serif (the quote), metadata in mono. */
function EvidenceNodeCard({ data }: NodeProps<EvidenceNode>) {
  const { item } = data;
  const stance = STANCE_META[item.stance];
  return (
    <div
      className="vt-node relative rounded-lg border bg-[var(--panel)] py-3 pl-4 pr-3"
      style={{
        width: 320,
        borderColor: `${stance.color}3d`,
        boxShadow: `0 0 0 1px ${stance.color}14, ${cardShadow}`,
      }}
    >
      <span
        aria-hidden
        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
        style={{ background: stance.color }}
      />
      {IN}
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
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[var(--ink-3)]">
          {item.sourceType}
        </span>
      </div>
    </div>
  );
}

export const nodeTypes: NodeTypes = {
  source: SourceNodeCard,
  claim: ClaimNodeCard,
  question: QuestionNodeCard,
  evidence: EvidenceNodeCard,
};
