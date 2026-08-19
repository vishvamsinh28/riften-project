import { getStore } from "./store.js";

/**
 * Corpus-level aggregates for the overview and ingest pages.
 * All functions are pure readers over the store index.
 */

/**
 * Linear-interpolated quantile over an ascending-sorted numeric array.
 * Returns 0 for an empty input rather than NaN.
 */
export function quantile(sorted, q) {
  if (!Array.isArray(sorted) || sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Per-model rollup: request count, spend, tokens, errors, latency quantiles. */
function modelRollup(all) {
  const byModel = new Map();
  for (const t of all) {
    const m = byModel.get(t.model) ?? {
      model: t.model,
      provider: t.provider,
      count: 0,
      cost: 0,
      tokens: 0,
      errors: 0,
      latencies: [],
    };
    m.count += 1;
    m.cost += t.cost_usd ?? 0;
    m.tokens += t.usage?.total_tokens ?? 0;
    if (t.status === 200) m.latencies.push(t.latency_ms);
    else m.errors += 1;
    byModel.set(t.model, m);
  }
  return [...byModel.values()]
    .map(({ latencies, ...m }) => {
      const sorted = [...latencies].sort((a, b) => a - b);
      return { ...m, p50: Math.round(quantile(sorted, 0.5)), p95: Math.round(quantile(sorted, 0.95)) };
    })
    .sort((a, b) => b.count - a.count);
}

/** Count traces matching a predicate — small helper to keep corpusStats flat. */
const countWhere = (all, pred) => all.filter(pred).length;

/**
 * Traces in the trailing window of `sinceDays` days ending at the corpus's
 * own latest timestamp — anchored to the data, not Date.now(), so the range
 * control works on synthetic corpora. Undefined returns the input untouched.
 */
export function recentTraces(all, sinceDays) {
  if (sinceDays == null || all.length === 0) return all;
  // `all` is sorted ascending by ts, so the last entry anchors the window.
  const cutoff = new Date(all[all.length - 1].ts).getTime() - sinceDays * 86_400_000;
  return all.filter((t) => new Date(t.ts).getTime() >= cutoff);
}

/**
 * Full corpus summary: volumes, spend, latency quantiles, quality-signal
 * counts, and the per-model rollup. Computed on demand from the live store.
 * Optional `sinceDays` restricts every figure to the trailing window (see
 * recentTraces); the default covers the whole corpus.
 */
export function corpusStats({ sinceDays } = {}) {
  const { all: whole, sessions } = getStore();
  const all = recentTraces(whole, sinceDays);
  const okLatencies = all
    .filter((t) => t.status === 200)
    .map((t) => t.latency_ms)
    .sort((a, b) => a - b);

  return {
    traces: all.length,
    // Unfiltered reads keep the store's session count; windows recount.
    sessions: all === whole ? sessions.size : new Set(all.map((t) => t.session_id)).size,
    cost: all.reduce((s, t) => s + (t.cost_usd ?? 0), 0),
    tokens: all.reduce((s, t) => s + (t.usage?.total_tokens ?? 0), 0),
    errors: countWhere(all, (t) => t.status !== 200),
    truncated: countWhere(all, (t) => t.derived?.truncated === true),
    toolErrors: countWhere(all, (t) => t.derived?.hasToolError === true),
    retries: countWhere(all, (t) => t.derived?.isRetry === true),
    retriedAway: countWhere(all, (t) => t.derived?.wasRetried === true),
    p50: Math.round(quantile(okLatencies, 0.5)),
    p95: Math.round(quantile(okLatencies, 0.95)),
    ratings: {
      strong: countWhere(all, (t) => t.feedback?.rating === "strong"),
      ok: countWhere(all, (t) => t.feedback?.rating === "ok"),
      weak: countWhere(all, (t) => t.feedback?.rating === "weak"),
    },
    continuation: {
      accepted: countWhere(all, (t) => t.feedback?.continuation === "accepted"),
      rejected: countWhere(all, (t) => t.feedback?.continuation === "rejected"),
    },
    models: modelRollup(all),
    firstTs: all[0]?.ts ?? null,
    lastTs: all[all.length - 1]?.ts ?? null,
  };
}
