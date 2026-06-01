"use client";

import { useEffect, useState } from "react";

// Run-fatal errors (a stream `error` event, or a parse failure the repair path gave up on)
// deserve a real surface, not the old 11px line under the Run button (#96). Per-question
// degradations stay inline/traced (#70) — this modal is only for errors that killed the run.

// Parse failures dominate on weaker/cheaper models, so lead with a plain-language cause when
// we can recognise one; otherwise fall back to a generic line. The raw message still shows
// verbatim below for debugging.
function plainCause(message: string): string {
  if (/could not parse json|parse json from model output/i.test(message)) {
    return "The model returned output we couldn't parse.";
  }
  if (/request failed/i.test(message)) {
    return "The request to the analysis service failed.";
  }
  return "The run couldn't complete.";
}

export function RunErrorModal({
  error,
  modelLabel,
  onDismiss,
  onRetry,
}: {
  error: string | null;
  modelLabel: string;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const open = error !== null;
  // Track which message was copied so the affordance resets for free when a new error opens.
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const copied = copiedFor === error;

  // Escape dismisses while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  const copy = () => {
    void navigator.clipboard?.writeText(error).then(() => setCopiedFor(error));
  };

  return (
    <>
      {/* Scrim — dims the workbench and dismisses on click. */}
      <div
        onClick={onDismiss}
        aria-hidden
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Run failed"
        className="fixed left-1/2 top-1/2 z-[71] flex w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] p-6 shadow-[0_0_80px_rgba(0,0,0,0.7)]"
      >
        <div className="flex flex-col gap-1.5">
          <div
            className="font-mono text-[9.5px] uppercase tracking-[0.22em]"
            style={{ color: "var(--refutes)" }}
          >
            ⚠ Run failed
          </div>
          <p className="text-[14px] leading-snug text-[var(--ink-1)]">{plainCause(error)}</p>
          <p className="font-mono text-[10px] text-[var(--ink-3)]">model · {modelLabel}</p>
        </div>

        {/* Copyable raw message for debugging. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-4)]">
              details
            </span>
            <button
              type="button"
              onClick={copy}
              className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--line)] bg-[var(--bg)] p-3 font-mono text-[10.5px] leading-relaxed text-[var(--ink-2)]">
            {error}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
          >
            ▸ Retry
          </button>
        </div>
      </div>
    </>
  );
}
