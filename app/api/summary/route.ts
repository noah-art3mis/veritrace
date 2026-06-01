import { createReasoner } from "@/lib/reasoner";
import { parseConfig } from "@/lib/run-config";
import { summarizeGraph } from "@/lib/pipeline/summarize";
import type { FactGraph } from "@/lib/graph-types";

// Post-run narrative summary. The client sends a *finished* graph (the same shape the live
// build produced) plus the run config, and gets back a short prose brief for the report panel.
// One non-streaming model call — kept off the /api/check hot path so the graph can finish
// rendering first.
export const runtime = "nodejs";
export const maxDuration = 30;

function isFinishedGraph(value: unknown): value is FactGraph {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  const source = g.source as Record<string, unknown> | undefined;
  return (
    typeof source?.text === "string" &&
    source.text.trim().length > 0 &&
    Array.isArray(g.claims) &&
    Array.isArray(g.evidence)
  );
}

export async function POST(request: Request) {
  let body: { graph?: unknown; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isFinishedGraph(body.graph)) {
    return Response.json(
      { error: "Body must include a finished 'graph' with source text and claims." },
      { status: 400 },
    );
  }

  let ask;
  try {
    ask = createReasoner(parseConfig(body.config));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid run configuration" },
      { status: 400 },
    );
  }

  try {
    const summary = await summarizeGraph(body.graph, ask);
    return Response.json({ summary });
  } catch (err) {
    console.error("[/api/summary]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Summary generation failed" },
      { status: 500 },
    );
  }
}
