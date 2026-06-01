import Link from "next/link";
import Workbench from "@/components/workbench";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* hairline accent at the very top edge */}
      <div
        className="h-[2px] w-full shrink-0"
        style={{
          background: "linear-gradient(90deg, transparent, var(--accent), transparent 70%)",
        }}
      />
      <header className="vt-reveal relative flex items-end justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg-2)]/70 px-6 py-3 backdrop-blur">
        <div className="flex items-end gap-3.5">
          <h1 className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-[var(--ink-1)]">
            Veri<span style={{ color: "var(--accent)" }}>trace</span>
          </h1>
          <span className="font-display mb-[3px] hidden text-[13.5px] italic leading-none text-[var(--ink-2)] md:inline">
            observable AI fact-checker
          </span>
          <a
            href="https://simulacro.tech"
            target="_blank"
            rel="noreferrer"
            className="mb-[3px] hidden font-mono text-[10px] uppercase tracking-[0.16em] leading-none text-[var(--ink-2)] transition-colors hover:text-[var(--accent)] md:inline"
          >
            by simulacro.tech
          </a>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-[var(--line-2)] bg-[var(--panel)] px-3 py-1.5 lg:flex">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              How to use
            </span>
            <span className="font-mono text-[10px] tracking-[0.04em] text-[var(--ink-2)]">
              <span style={{ color: "var(--accent)" }}>1.</span> Paste a claim
              <span className="mx-1.5 text-[var(--ink-4)]">·</span>
              <span style={{ color: "var(--accent)" }}>2.</span> Press Run check
            </span>
          </div>
          <Link
            href="/methodology"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]"
          >
            Methodology &amp; refs
          </Link>
        </div>
      </header>
      <Workbench />
    </div>
  );
}
