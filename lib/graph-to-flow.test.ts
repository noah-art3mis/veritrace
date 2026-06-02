import { describe, it, expect } from "vitest";
import { graphToFlow, conflictEdges } from "./graph-to-flow";
import type { FactGraph, EvidenceItem } from "./graph-types";
import { STANCE_META, VERDICT_META } from "./visuals";

function graph(): FactGraph {
  return {
    source: { id: "src", text: "post", verdict: "conflicting" },
    claims: [
      { id: "c1", text: "c1", checkable: true, verdict: "supported" },
      { id: "c2", text: "c2", checkable: true, verdict: "refuted" },
    ],
    questions: [
      { id: "c1-q1", claimId: "c1", text: "q?", status: "answered" },
      { id: "c2-q1", claimId: "c2", text: "q?", status: "answered" },
    ],
    evidence: [
      {
        id: "c1-q1-e1",
        questionId: "c1-q1",
        title: "t",
        url: "https://bbc.com/x",
        domain: "bbc.com",
        passage: "p",
        stance: "supports",
        reliability: "high",
        sourceType: "primary",
        stanceConfidence: 0.9,
      },
      {
        id: "c2-q1-e1",
        questionId: "c2-q1",
        title: "t",
        url: "https://proceso.com.mx/x",
        domain: "proceso.com.mx",
        passage: "p",
        stance: "refutes",
        reliability: "high",
        sourceType: "primary",
        stanceConfidence: 0.9,
      },
    ],
  };
}

describe("graphToFlow nodes", () => {
  it("produces one node per graph item across all four layers", () => {
    const { nodes } = graphToFlow(graph());
    // 1 source + 2 claims + 2 questions + 2 evidence
    expect(nodes).toHaveLength(7);
  });

  it("tags each node with the layer type matching its id", () => {
    const { nodes } = graphToFlow(graph());
    const typeById = Object.fromEntries(nodes.map((n) => [n.id, n.type]));
    expect(typeById["src"]).toBe("source");
    expect(typeById["c1"]).toBe("claim");
    expect(typeById["c1-q1"]).toBe("question");
    expect(typeById["c1-q1-e1"]).toBe("evidence");
  });

  it("assigns each node a layout width and a finite position", () => {
    const { nodes } = graphToFlow(graph());
    for (const n of nodes) {
      expect(n.width).toBeGreaterThan(0);
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("lays claims out to the right of the source (rankdir LR)", () => {
    const { nodes } = graphToFlow(graph());
    const src = nodes.find((n) => n.id === "src")!;
    const c1 = nodes.find((n) => n.id === "c1")!;
    expect(c1.position.x).toBeGreaterThan(src.position.x);
  });
});

describe("graphToFlow edges", () => {
  it("wires source→claim, claim→question, and question→evidence", () => {
    const { edges } = graphToFlow(graph());
    const pairs = edges.map((e) => `${e.source}->${e.target}`);
    expect(pairs).toContain("src->c1");
    expect(pairs).toContain("c1->c1-q1");
    expect(pairs).toContain("c1-q1->c1-q1-e1");
  });

  it("creates exactly one edge per non-root node", () => {
    const { nodes, edges } = graphToFlow(graph());
    // every node except the root source has exactly one incoming edge
    expect(edges).toHaveLength(nodes.length - 1);
  });

  it("gives each edge a unique id", () => {
    const { edges } = graphToFlow(graph());
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });

  it("colors and labels evidence edges by stance", () => {
    const { edges } = graphToFlow(graph());
    const supportEdge = edges.find((e) => e.target === "c1-q1-e1")!;
    const refuteEdge = edges.find((e) => e.target === "c2-q1-e1")!;
    expect(supportEdge.label).toBe(STANCE_META.supports.label);
    expect(supportEdge.style?.stroke).toBe(STANCE_META.supports.color);
    expect(refuteEdge.label).toBe(STANCE_META.refutes.label);
    expect(refuteEdge.style?.stroke).toBe(STANCE_META.refutes.color);
  });

  it("animates evidence edges but not structural source→claim edges", () => {
    const { edges } = graphToFlow(graph());
    expect(edges.find((e) => e.target === "c1-q1-e1")!.animated).toBe(true);
    expect(edges.find((e) => e.target === "c1")!.animated).toBe(false);
  });
});

describe("support colour propagates back to the claim", () => {
  // An unresolved claim (no verdict yet) whose only question carries one deciding source with
  // the given stance. Structural source→claim and claim→question edges should take that source's
  // support colour even before a verdict lands, instead of staying neutral.
  function unresolvedGraph(stance: EvidenceItem["stance"]): FactGraph {
    return {
      source: { id: "src", text: "post", verdict: null },
      claims: [{ id: "c1", text: "c1", checkable: true, verdict: null }],
      questions: [{ id: "c1-q1", claimId: "c1", text: "q?", status: "answered" }],
      evidence: [
        {
          id: "c1-q1-e1",
          questionId: "c1-q1",
          title: "t",
          url: "https://bbc.com/x",
          domain: "bbc.com",
          passage: "p",
          stance,
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.9,
        },
      ],
    };
  }

  it("colours source→claim and claim→question by the deciding support stance", () => {
    const { edges } = graphToFlow(unresolvedGraph("supports"));
    const srcToClaim = edges.find((e) => e.source === "src" && e.target === "c1")!;
    const claimToQ = edges.find((e) => e.source === "c1" && e.target === "c1-q1")!;
    expect(srcToClaim.style?.stroke).toBe(STANCE_META.supports.color);
    expect(claimToQ.style?.stroke).toBe(STANCE_META.supports.color);
  });

  it("colours the upstream edges conflicting when a claim's deciding sources disagree", () => {
    const g = unresolvedGraph("supports");
    g.questions.push({ id: "c1-q2", claimId: "c1", text: "q2?", status: "answered" });
    g.evidence.push({
      id: "c1-q2-e1",
      questionId: "c1-q2",
      title: "t",
      url: "https://reuters.com/x",
      domain: "reuters.com",
      passage: "p",
      stance: "refutes",
      reliability: "high",
      sourceType: "primary",
      stanceConfidence: 0.9,
    });
    const { edges } = graphToFlow(g);
    expect(edges.find((e) => e.source === "src" && e.target === "c1")!.style?.stroke).toBe(
      VERDICT_META.conflicting.color,
    );
  });

  it("leaves the upstream edges neutral when no source can decide", () => {
    // A single low-reliability source can't decide, so nothing veracity-coloured propagates.
    const g = unresolvedGraph("supports");
    g.evidence[0].reliability = "low";
    const { edges } = graphToFlow(g);
    const srcToClaim = edges.find((e) => e.source === "src" && e.target === "c1")!;
    expect(srcToClaim.style?.stroke).not.toBe(STANCE_META.supports.color);
  });
});

describe("conflictEdges", () => {
  // A single claim whose two questions returned opposing DECIDING evidence — the case where
  // "Conflicting" should mean "these two specific sources disagree" (CLUE).
  function conflictingClaimGraph(): FactGraph {
    const ev = (
      id: string,
      qid: string,
      stance: EvidenceItem["stance"],
      conf: number,
    ): EvidenceItem => ({
      id,
      questionId: qid,
      title: "t",
      url: `https://${id}.com/x`,
      domain: `${id}.com`,
      passage: "p",
      stance,
      reliability: "high",
      sourceType: "primary",
      stanceConfidence: conf,
    });
    return {
      source: { id: "src", text: "post", verdict: "conflicting" },
      claims: [{ id: "c1", text: "c1", checkable: true, verdict: "conflicting" }],
      questions: [
        { id: "c1-q1", claimId: "c1", text: "q?", status: "answered" },
        { id: "c1-q2", claimId: "c1", text: "q?", status: "answered" },
      ],
      evidence: [ev("sup", "c1-q1", "supports", 0.9), ev("ref", "c1-q2", "refutes", 0.95)],
    };
  }

  it("links the opposing deciding sources within a conflicting claim", () => {
    const [edge] = conflictEdges(conflictingClaimGraph());
    expect(edge.source).toBe("sup");
    expect(edge.target).toBe("ref");
    expect(edge.label).toBe("conflicts");
  });

  it("attaches to the evidence card's dedicated conflict handles, not the flow handles", () => {
    // Evidence cards are leaves in the structural tree, so their left/right handles are
    // target-only. A conflict edge starts FROM an evidence node, so it must reference the
    // card's extra source/target handle ids — otherwise React Flow drops it (error #008).
    const [edge] = conflictEdges(conflictingClaimGraph());
    expect(edge.sourceHandle).toBe("conflict-out");
    expect(edge.targetHandle).toBe("conflict-in");
  });

  it("emits no conflict edge when a claim has only one-sided deciding evidence", () => {
    const g = conflictingClaimGraph();
    g.evidence = g.evidence.filter((e) => e.stance === "supports"); // drop the refutation
    expect(conflictEdges(g)).toEqual([]);
  });

  it("ignores low-reliability sources that cannot decide a verdict", () => {
    const g = conflictingClaimGraph();
    g.evidence = g.evidence.map((e) => (e.stance === "refutes" ? { ...e, reliability: "low" } : e));
    // The refutation can no longer decide, so there is no genuine source-level conflict.
    expect(conflictEdges(g)).toEqual([]);
  });

  it("is included in graphToFlow's edge set for a conflicting claim", () => {
    const { edges } = graphToFlow(conflictingClaimGraph());
    expect(edges.some((e) => e.id === "conflict-c1")).toBe(true);
  });
});

describe("graphToFlow evidence wrapping", () => {
  // Many sources under one question used to pile into a single tall column, forcing fitView
  // to zoom the whole graph down. They should wrap into two columns to bound the height.
  function manyEvidenceGraph(n: number): FactGraph {
    const g = graph();
    g.claims = [{ id: "c1", text: "c1", checkable: true, verdict: "supported" }];
    g.questions = [{ id: "c1-q1", claimId: "c1", text: "q?", status: "answered" }];
    g.evidence = Array.from({ length: n }, (_, i) => ({
      id: `c1-q1-e${i}`,
      questionId: "c1-q1",
      title: "t",
      url: `https://ex${i}.com/x`,
      domain: `ex${i}.com`,
      passage: "p",
      stance: "supports" as const,
      reliability: "high" as const,
      sourceType: "primary" as const,
      stanceConfidence: 0.9,
    }));
    return g;
  }

  it("wraps a question's evidence into four columns instead of one tall stack", () => {
    const { nodes } = graphToFlow(manyEvidenceGraph(4));
    const cols = new Set(
      nodes.filter((n) => n.type === "evidence").map((n) => Math.round(n.position.x)),
    );
    expect(cols.size).toBe(4);
  });

  it("groups evidence side by side on shared rows to keep the column short", () => {
    const ev = graphToFlow(manyEvidenceGraph(8)).nodes.filter((n) => n.type === "evidence");
    const rows = new Set(ev.map((n) => Math.round(n.position.y)));
    // 8 evidence in 4 columns => 2 rows, not 8.
    expect(rows.size).toBe(2);
  });

  it("wires each wrapped row as a comb so edges never cross sibling cards", () => {
    // 5 evidence, 4 columns => row0 = [e0..e3], row1 = [e4]. The question feeds each row's
    // leftmost card; the rest of a row hang off their left neighbour's right (flow-out) handle,
    // so every edge joins adjacent cards instead of fanning across the grid into a buried handle.
    const { edges } = graphToFlow(manyEvidenceGraph(5));
    const evEdges = edges.filter((e) => e.target.startsWith("c1-q1-e"));
    // Every source still gets exactly one incoming stance edge — coverage is unchanged.
    expect(evEdges).toHaveLength(5);
    expect(new Set(evEdges.map((e) => e.target)).size).toBe(5);

    const fromQuestion = evEdges.filter((e) => e.source === "c1-q1");
    expect(fromQuestion.map((e) => e.target).sort()).toEqual(["c1-q1-e0", "c1-q1-e4"]);
    for (const e of fromQuestion) expect(e.sourceHandle).toBeUndefined();

    // Inner cards of row0 chain off the previous card via its right-side flow handle.
    const chained = evEdges.filter((e) => e.source !== "c1-q1");
    expect(chained.map((e) => e.source).sort()).toEqual(["c1-q1-e0", "c1-q1-e1", "c1-q1-e2"]);
    for (const e of chained) expect(e.sourceHandle).toBe("flow-out");
  });

  it("labels every comb edge with the target card's stance", () => {
    const g = manyEvidenceGraph(5);
    g.evidence[2].stance = "refutes"; // a mixed row must still label each card by its own stance
    const { edges } = graphToFlow(g);
    const e2 = edges.find((e) => e.target === "c1-q1-e2")!;
    expect(e2.label).toBe(STANCE_META.refutes.label);
    expect(e2.style?.stroke).toBe(STANCE_META.refutes.color);
  });
});

describe("graphToFlow degenerate inputs", () => {
  it("handles a source-only graph (no claims yet) — the start of a live build", () => {
    const { nodes, edges } = graphToFlow({
      source: { id: "src", text: "post", verdict: null },
      claims: [],
      questions: [],
      evidence: [],
    });
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });
});
