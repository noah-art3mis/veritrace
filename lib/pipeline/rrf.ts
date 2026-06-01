// Reciprocal Rank Fusion (#56, ADR 0008) — the project's retrieval novelty. HyDE/HerO average the
// EMBEDDING vectors of N hypothetical passages before dense retrieval over a fixed corpus. We
// retrieve from a live search API (Exa), where we hand over TEXT, not vectors — so embedding-
// averaging has nowhere to live. Instead we issue one query per directional hypothetical (confirm
// / refute) and fuse the result RANKINGS with RRF: averaging over rankings instead of vectors,
// needing no embeddings. A document ranked well across multiple hypotheticals floats to the top; a
// fluke that only one query surfaced washes out.
//
//   score(d) = Σ_i 1 / (k + rank_i(d))            (rank is 0-based; k damps the top-rank weight)
//
// Pure and deterministic (fixed k, stable tie-break by first-seen order) so the streaming /
// pipeline tests stay reproducible, per ADR 0005's determinism constraint.

// The standard RRF constant from Cormack et al. 2009. Larger k flattens the contribution of a
// document's exact rank, so being present across queries matters more than topping any one.
export const RRF_K = 60;

/**
 * Fuse several ranked lists of the same item type into one ranking by Reciprocal Rank Fusion.
 * `key` identifies the same document across lists (e.g. its URL). Ties (equal fused score) keep
 * the order in which the document was first seen across the lists — deterministic.
 */
export function reciprocalRankFusion<T>(
  rankings: T[][],
  key: (item: T) => string,
  k: number = RRF_K,
): T[] {
  const score = new Map<string, number>();
  const firstSeen = new Map<string, { item: T; order: number }>();
  let order = 0;

  for (const list of rankings) {
    list.forEach((item, rank) => {
      const id = key(item);
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank));
      if (!firstSeen.has(id)) firstSeen.set(id, { item, order: order++ });
    });
  }

  return [...firstSeen.values()]
    .sort((a, b) => {
      const diff = (score.get(key(b.item)) ?? 0) - (score.get(key(a.item)) ?? 0);
      return diff !== 0 ? diff : a.order - b.order; // stable: first-seen wins ties
    })
    .map((entry) => entry.item);
}
