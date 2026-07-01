import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClaimItem, QuestionItem, EvidenceItem, Stance } from "../graph-types";
import type { PipelineEvent } from "./events";

// Mock the leaf stages (LLM/search) but keep the deterministic verdict + rationale
// logic real — we are testing the ORCHESTRATION: event order, parallel fan-out, and
// per-claim verdict resolution as the last question lands.
const { extractClaims, generateQuestions, resolveQuestion } = vi.hoisted(() => ({
  extractClaims: vi.fn(),
  generateQuestions: vi.fn(),
  resolveQuestion: vi.fn(),
}));

vi.mock("./extract", () => ({ extractClaims }));
vi.mock("./questions", () => ({ generateQuestions }));
vi.mock("./resolve", async () => {
  const actual = await vi.importActual<typeof import("./resolve")>("./resolve");
  return { ...actual, resolveQuestion };
});

import { streamPipeline, collectGraph } from "./stream";
import type { PipelineDeps } from "./deps";

// The leaf stages are mocked, so deps is inert here — a placeholder satisfies the type.
const deps = {
  ask: { askJSON: vi.fn(), askText: vi.fn(), askWithTools: vi.fn() },
  search: vi.fn(),
  maxClaims: 5,
  maxQuestions: 2,
} as PipelineDeps;

let evCounter = 0;
function evidence(questionId: string, stance: Stance): EvidenceItem {
  return {
    id: `${questionId}-e${evCounter++}`,
    questionId,
    title: "t",
    url: "https://bbc.com/x",
    domain: "bbc.com",
    passage: "p",
    stance,
    reliability: "high",
    sourceType: "primary",
    stanceConfidence: 0.9,
  };
}

// resolveQuestion returns { evidence, trace, retrieval }; wrap evidence arrays for the mocks.
// `retrieval` defaults to one clean (non-failing) search — override it to model an outage (#100).
function resolved(
  evidence: EvidenceItem[],
  retrieval: { searches: number; failures: number; lastError?: string } = {
    searches: 1,
    failures: 0,
  },
) {
  return {
    evidence,
    trace: { hydePassage: "h", searchQueries: ["q"], gatherSummary: "s" },
    retrieval,
  };
}

function claim(id: string, checkable = true): ClaimItem {
  return { id, text: `claim ${id}`, checkable, verdict: null };
}

function question(claimId: string, n: number): QuestionItem {
  return { id: `${claimId}-q${n}`, claimId, text: "q?", status: "pending" };
}

beforeEach(() => {
  extractClaims.mockReset();
  generateQuestions.mockReset();
  resolveQuestion.mockReset();
  evCounter = 0;
});

async function drain(text: string): Promise<PipelineEvent[]> {
  const out: PipelineEvent[] = [];
  for await (const ev of streamPipeline(text, deps)) out.push(ev);
  return out;
}

describe("streamPipeline event protocol", () => {
  beforeEach(() => {
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockImplementation(async (c: ClaimItem) => [question(c.id, 1)]);
    resolveQuestion.mockResolvedValue(resolved([evidence("c1-q1", "supports")]));
  });

  it("emits source first and done last", async () => {
    const events = await drain("post");
    expect(events[0].type).toBe("source");
    expect(events[events.length - 1].type).toBe("done");
  });

  it("emits the source verdict exactly once, just before done", async () => {
    const events = await drain("post");
    const verdicts = events.filter((e) => e.type === "source_verdict");
    expect(verdicts).toHaveLength(1);
    expect(events[events.length - 2].type).toBe("source_verdict");
  });

  it("emits each claim before any question, and questions before evidence", async () => {
    const events = await drain("post");
    const t = events.map((e) => e.type);
    expect(t.indexOf("claim")).toBeLessThan(t.indexOf("question"));
    expect(t.indexOf("question")).toBeLessThan(t.indexOf("evidence"));
  });

  it("moves each question through searching then answered", async () => {
    const events = await drain("post");
    const statuses = events
      .filter(
        (e): e is Extract<PipelineEvent, { type: "question_status" }> =>
          e.type === "question_status",
      )
      .map((e) => e.status);
    expect(statuses).toEqual(["searching", "answered"]);
  });

  it("emits a question_trace carrying the retrieval internals for each resolved question", async () => {
    const events = await drain("post");
    const trace = events.find(
      (e): e is Extract<PipelineEvent, { type: "question_trace" }> => e.type === "question_trace",
    );
    expect(trace).toMatchObject({
      id: "c1-q1",
      trace: { searchQueries: ["q"], gatherSummary: "s" },
    });
  });
});

describe("streamPipeline verdict resolution", () => {
  it("resolves a claim verdict only after its last question is answered", async () => {
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockResolvedValue([question("c1", 1), question("c1", 2)]);
    resolveQuestion.mockImplementation(async (_c: ClaimItem, q: QuestionItem) =>
      resolved([evidence(q.id, "supports")]),
    );

    const events = await drain("post");
    const answeredCount = events.filter(
      (e) => e.type === "question_status" && e.status === "answered",
    ).length;
    const verdictIdx = events.findIndex((e) => e.type === "claim_verdict");
    const secondAnsweredIdx = events.reduce(
      (acc, e, i) => (e.type === "question_status" && e.status === "answered" ? i : acc),
      -1,
    );
    expect(answeredCount).toBe(2);
    expect(verdictIdx).toBeGreaterThan(secondAnsweredIdx);
  });

  it("immediately resolves an unckeckable (question-less) claim to nei without retrieval", async () => {
    extractClaims.mockResolvedValue([claim("c1", false)]);
    generateQuestions.mockResolvedValue([]); // mirrors the real short-circuit
    const events = await drain("post");

    expect(resolveQuestion).not.toHaveBeenCalled();
    const verdict = events.find((e) => e.type === "claim_verdict");
    expect(verdict).toMatchObject({ id: "c1", verdict: "nei" });
  });

  it("isolates a question whose retrieval throws: the run completes instead of crashing", async () => {
    // A single resolveQuestion rejection (e.g. an Exa outage that survived its own retries) must
    // not propagate out of the parallel fan-out and abort every other question (issue #70). The
    // failed question degrades to no evidence — and a trace that SAYS why — so the claim still
    // resolves and the stream reaches `done`.
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockResolvedValue([question("c1", 1), question("c1", 2)]);
    resolveQuestion
      .mockResolvedValueOnce(resolved([evidence("c1-q1", "supports")]))
      .mockRejectedValueOnce(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));

    const events = await drain("post");

    expect(events[events.length - 1].type).toBe("done"); // run completed, did not throw
    expect(events.some((e) => e.type === "claim_verdict" && e.id === "c1")).toBe(true);
    // The failed question still answered (degraded) and its trace explains the failure.
    const trace = events.find(
      (e): e is Extract<PipelineEvent, { type: "question_trace" }> =>
        e.type === "question_trace" && e.id === "c1-q2",
    );
    expect(trace?.trace.gatherSummary).toMatch(/failed|timedout/i);
  });
});

describe("streamPipeline wholesale-retrieval-failure warning (#100)", () => {
  it("emits a warning when EVERY search in the run errored (and still completes)", async () => {
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockResolvedValue([question("c1", 1), question("c1", 2)]);
    // Both questions resolve with no evidence because all their searches errored (e.g. Exa credits
    // exhausted) — the failures are swallowed per-question (#70), so the run still finishes.
    resolveQuestion.mockResolvedValue(
      resolved([], { searches: 3, failures: 3, lastError: "exceeded your credits limit" }),
    );

    const events = await drain("post");
    const warning = events.find(
      (e): e is Extract<PipelineEvent, { type: "warning" }> => e.type === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toMatch(/retrieval is failing/i);
    expect(warning?.message).toContain("exceeded your credits limit");
    // Non-fatal: the run still reaches its finale.
    expect(events.some((e) => e.type === "source_verdict")).toBe(true);
    expect(events[events.length - 1].type).toBe("done");
    // The warning precedes the finale so the banner is up before the verdict lands.
    const warnIdx = events.findIndex((e) => e.type === "warning");
    const verdictIdx = events.findIndex((e) => e.type === "source_verdict");
    expect(warnIdx).toBeLessThan(verdictIdx);
  });

  it("stays silent when at least one search succeeded (a genuine NEI, not an outage)", async () => {
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockResolvedValue([question("c1", 1), question("c1", 2)]);
    resolveQuestion
      .mockResolvedValueOnce(resolved([], { searches: 2, failures: 2, lastError: "boom" }))
      .mockResolvedValueOnce(
        resolved([evidence("c1-q2", "supports")], { searches: 2, failures: 0 }),
      );

    const events = await drain("post");
    expect(events.some((e) => e.type === "warning")).toBe(false);
  });
});

describe("streamPipeline fact-check short-circuit", () => {
  const fcDeps = (factCheck: PipelineDeps["factCheck"]): PipelineDeps =>
    ({ ...deps, factCheck }) as PipelineDeps;

  beforeEach(() => {
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockImplementation(async (c: ClaimItem) => [question(c.id, 1)]);
    resolveQuestion.mockResolvedValue(resolved([evidence("c1-q1", "supports")]));
  });

  async function drainWith(d: PipelineDeps): Promise<PipelineEvent[]> {
    const out: PipelineEvent[] = [];
    for await (const ev of streamPipeline("post", d)) out.push(ev);
    return out;
  }

  it("resolves a claim from an existing fact-check and skips question generation + retrieval", async () => {
    const factCheck = vi.fn().mockResolvedValue([
      {
        claimText: "x",
        publisher: "Snopes",
        site: "snopes.com",
        url: "https://snopes.com/x",
        title: "t",
        reviewDate: "2024-01-01",
        textualRating: "False",
        stance: "refutes",
        trusted: true,
      },
    ]);
    const events = await drainWith(fcDeps(factCheck));

    expect(factCheck).toHaveBeenCalledWith("claim c1");
    expect(generateQuestions).not.toHaveBeenCalled();
    expect(resolveQuestion).not.toHaveBeenCalled();

    const verdict = events.find((e) => e.type === "claim_verdict");
    expect(verdict).toMatchObject({ id: "c1", verdict: "refuted" });
    // The fact-check is emitted as evidence under a synthetic question node.
    const q = events.find((e) => e.type === "question");
    expect(q).toMatchObject({ question: { id: "c1-fc", claimId: "c1", status: "answered" } });
    const ev = events.find((e) => e.type === "evidence");
    expect(ev).toMatchObject({ evidence: { questionId: "c1-fc", domain: "snopes.com" } });
  });

  it("falls through to de-novo retrieval when no confident fact-check exists", async () => {
    const factCheck = vi.fn().mockResolvedValue([]); // no existing fact-check
    const events = await drainWith(fcDeps(factCheck));

    expect(generateQuestions).toHaveBeenCalled();
    expect(resolveQuestion).toHaveBeenCalled();
    const verdict = events.find((e) => e.type === "claim_verdict");
    expect(verdict).toMatchObject({ id: "c1", verdict: "supported" });
  });

  it("falls through when the fact-check rating is only contextualizing (non-deciding)", async () => {
    const factCheck = vi.fn().mockResolvedValue([
      {
        claimText: "x",
        publisher: "Snopes",
        site: "snopes.com",
        url: "https://snopes.com/x",
        title: "t",
        textualRating: "Mixture",
        stance: "contextualizes",
        trusted: true,
      },
    ]);
    const events = await drainWith(fcDeps(factCheck));

    expect(resolveQuestion).toHaveBeenCalled(); // not short-circuited
    expect(events.find((e) => e.type === "claim_verdict")).toMatchObject({
      id: "c1",
      verdict: "supported",
    });
  });

  it("falls through when the lookup throws (a fact-check hiccup never sinks the run)", async () => {
    const factCheck = vi.fn().mockRejectedValue(new Error("api down"));
    const events = await drainWith(fcDeps(factCheck));

    expect(resolveQuestion).toHaveBeenCalled();
    expect(events.find((e) => e.type === "claim_verdict")).toMatchObject({
      id: "c1",
      verdict: "supported",
    });
  });
});

describe("collectGraph", () => {
  it("drains the stream into a finished graph with a supported claim and verdict", async () => {
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockResolvedValue([question("c1", 1)]);
    resolveQuestion.mockResolvedValue(resolved([evidence("c1-q1", "supports")]));

    const graph = await collectGraph("post", deps);
    expect(graph.source.text).toBe("post");
    expect(graph.claims[0].verdict).toBe("supported");
    expect(graph.claims[0].rationale).toMatch(/Supported by/);
    expect(graph.questions.every((q) => q.status === "answered")).toBe(true);
    expect(graph.source.verdict).toBe("supported");
  });

  it("aggregates a cherrypicking document (one supported + one refuted claim) to conflicting (ADR 0007)", async () => {
    // Cherrypicking is a DOCUMENT property: two equally load-bearing claims pulling opposite ways.
    extractClaims.mockResolvedValue([claim("c1"), claim("c2")]);
    generateQuestions.mockImplementation(async (c: ClaimItem) => [question(c.id, 1)]);
    resolveQuestion.mockImplementation(async (_c: ClaimItem, q: QuestionItem) =>
      resolved([evidence(q.id, q.claimId === "c1" ? "supports" : "refutes")]),
    );

    const graph = await collectGraph("post", deps);
    expect(graph.claims.find((c) => c.id === "c1")!.verdict).toBe("supported");
    expect(graph.claims.find((c) => c.id === "c2")!.verdict).toBe("refuted");
    expect(graph.source.verdict).toBe("conflicting");
  });

  it("resolves a single claim with opposing evidence to nei, not conflicting, end-to-end (ADR 0007)", async () => {
    // One atomic claim whose two questions return opposing evidence is inconclusive — the
    // ivermectin / border-barriers case — never claim-level conflicting.
    extractClaims.mockResolvedValue([claim("c1")]);
    generateQuestions.mockResolvedValue([question("c1", 1), question("c1", 2)]);
    resolveQuestion.mockImplementation(async (_c: ClaimItem, q: QuestionItem) =>
      resolved([evidence(q.id, q.id.endsWith("q1") ? "supports" : "refutes")]),
    );

    const graph = await collectGraph("post", deps);
    expect(graph.claims[0].verdict).toBe("nei");
    expect(graph.source.verdict).toBe("nei");
  });

  it("leaves a relevance-dropped claim unverdicted and counts it as dropped, not NEI", async () => {
    extractClaims.mockResolvedValue([claim("c1"), { ...claim("c2"), relevant: false }]);
    generateQuestions.mockImplementation(async (c: ClaimItem) =>
      c.relevant === false ? [] : [question(c.id, 1)],
    );
    resolveQuestion.mockResolvedValue(resolved([evidence("c1-q1", "supports")]));

    const graph = await collectGraph("post", deps);
    const c1 = graph.claims.find((c) => c.id === "c1")!;
    const c2 = graph.claims.find((c) => c.id === "c2")!;
    expect(c1.verdict).toBe("supported");
    expect(c2.verdict).toBeNull(); // dropped claims carry no verdict at all
    expect(graph.source.verdict).toBe("supported");
    expect(graph.source.tally).toMatchObject({ supported: 1, total: 1, dropped: 1 });
  });

  it("keeps an unverifiable claim as nei while the document resolves on its checkable claims", async () => {
    extractClaims.mockResolvedValue([claim("c1", true), claim("c2", false)]);
    generateQuestions.mockImplementation(async (c: ClaimItem) =>
      c.checkable ? [question(c.id, 1)] : [],
    );
    resolveQuestion.mockResolvedValue(resolved([evidence("c1-q1", "refutes")]));

    const graph = await collectGraph("post", deps);
    const c1 = graph.claims.find((c) => c.id === "c1")!;
    const c2 = graph.claims.find((c) => c.id === "c2")!;
    expect(c1.verdict).toBe("refuted");
    expect(c2.verdict).toBe("nei");
    expect(graph.source.verdict).toBe("refuted"); // nei excluded from the aggregate
  });
});
