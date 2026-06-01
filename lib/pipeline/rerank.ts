import type { RawEvidence } from "../exa";

// Embedding re-rank of gathered candidates (#57, ADR 0010) — the literal HerO path, OPT-IN. HerO
// embeds the hypothetical passage(s) and the candidate docs and cosine-ranks. We keep no embeddings
// in the de-novo critical path (ADR 0005); this reverses that DELIBERATELY and only when switched
// on (config.rerank + a Cohere key). It's the heavier alternative to RRF-over-rankings (#56, ADR
// 0008): when on, it embeds the gathered candidates + the directional hypotheticals, averages the
// hypothetical vectors (HerO's move), and keeps the top-N candidates by cosine before classify.

/** Cosine similarity of two equal-length vectors; 0 if either is degenerate. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Element-wise mean of vectors (HerO averages the N hypothetical embeddings). */
export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const mean = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i];
  for (let i = 0; i < dim; i++) mean[i] /= vectors.length;
  return mean;
}

/** Embed a batch of texts into vectors. The seam we mock in tests; the default hits Cohere. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface Reranker {
  /**
   * Keep the top-`limit` candidates by cosine similarity to the averaged hypothetical embedding.
   * Returns the input unchanged when there's nothing to gain (≤ limit) or on any embed failure —
   * re-rank is an optional booster, never a gate.
   */
  rerank(anchors: string[], docs: RawEvidence[], limit: number): Promise<RawEvidence[]>;
}

const COHERE_EMBED_URL = "https://api.cohere.com/v2/embed";
const COHERE_MODEL = "embed-v4.0";

/** Real Cohere embed call (search_document / search_query input types collapsed to one batch). */
function cohereEmbed(apiKey: string): EmbedFn {
  return async (texts: string[]) => {
    const resp = await fetch(COHERE_EMBED_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: COHERE_MODEL,
        texts,
        input_type: "search_document",
        embedding_types: ["float"],
      }),
    });
    if (!resp.ok) throw new Error(`Cohere embed failed (${resp.status})`);
    const json = (await resp.json()) as { embeddings: { float: number[][] } };
    return json.embeddings.float;
  };
}

/**
 * Build the re-ranker, or return null when it's OFF — which is the default. ABSENT (null) means
 * the pipeline keeps its no-embeddings de-novo path; present means the opt-in embedding re-rank
 * runs. Routes only build it when `config.rerank` is set AND a Cohere key resolves. `embed` is
 * injectable for tests.
 */
export function createReranker(opts: { cohereKey?: string; embed?: EmbedFn }): Reranker | null {
  const key = opts.cohereKey || process.env.COHERE_API_KEY;
  if (!opts.embed && !key) return null; // no key, no real backend → stay off
  const embed = opts.embed ?? cohereEmbed(key as string);

  return {
    async rerank(anchors, docs, limit) {
      if (docs.length <= limit || anchors.length === 0) return docs;
      try {
        const docTexts = docs.map((d) => d.text || d.passage);
        const vectors = await embed([...anchors, ...docTexts]);
        const anchorVecs = vectors.slice(0, anchors.length);
        const docVecs = vectors.slice(anchors.length);
        const query = averageVectors(anchorVecs);
        return docs
          .map((d, i) => ({ d, score: cosineSimilarity(query, docVecs[i] ?? []) }))
          .sort((x, y) => y.score - x.score)
          .slice(0, limit)
          .map((x) => x.d);
      } catch {
        // Re-rank is a booster, not a gate: on any embed failure, fall back to the input order.
        return docs;
      }
    },
  };
}
