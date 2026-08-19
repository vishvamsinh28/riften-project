import { getStore } from "./store.js";
import { hasAnswer, sameContext, chainEnd, pairLine, contentKey } from "./export-helpers.js";

/**
 * Preference export: chosen/rejected pairs over an identical prompt context,
 * sourced from retrials, weak ratings, and continuation-rejected turns.
 * Each collector is a pure pass returning disposition records; the builder
 * owns all accumulator state and folds passes in order, so every candidate
 * gets exactly one disposition (pair or skip) and nothing is dropped silently.
 */

/** A chosen side must itself be an answer the user did not reject. */
function chosenEligible(c) {
  if (c.status !== 200 || c.derived?.truncated || !hasAnswer(c)) return false;
  return c.feedback?.rating !== "weak" && c.feedback?.continuation !== "rejected";
}

/** Disposition record: this candidate could not pair, with the reason why. */
const skipRecord = (trace, reason) => ({ kind: "skip", trace, reason });
/** Disposition record: a completed chosen/rejected pair from the given source. */
const pairRecord = (chosen, rejected, source) => ({ kind: "pair", chosen, rejected, source });

/**
 * Sources 1 + 2 — retrials: each retried-away answer pairs against the end
 * of its retry chain. Weak-rated originals are classified as their own
 * source since the explicit rating is the stronger signal. Pure.
 */
function collectRetrialDispositions(store) {
  const { all, retriedBy, byId } = store;
  const records = [];
  for (const t of all) {
    if (!t.derived?.wasRetried) continue;
    if (t.status !== 200 || !hasAnswer(t)) {
      records.push(skipRecord(t, "failed_original"));
      continue;
    }
    if (t.derived?.truncated) {
      records.push(skipRecord(t, "truncated_original"));
      continue;
    }
    const chosen = chainEnd(t, retriedBy, byId);
    if (chosen.id === t.id || !chosenEligible(chosen)) {
      records.push(skipRecord(t, "chosen_ineligible"));
      continue;
    }
    if (!sameContext(t, chosen)) {
      records.push(skipRecord(t, "context_mismatch"));
      continue;
    }
    records.push(pairRecord(chosen, t, t.feedback?.rating === "weak" ? "weak_rating" : "retrial"));
  }
  return records;
}

/**
 * Source 3 — continuation rejections: pair each rejected turn with the
 * accepted alternative generated over the same context, when one exists.
 * Pure; reads (never mutates) the handled-id set from earlier passes.
 */
function collectContinuationDispositions(store, handled) {
  const { all, sessions } = store;
  const records = [];
  for (const t of all) {
    if (t.feedback?.continuation !== "rejected" || handled.has(t.id)) continue;
    if (t.status !== 200 || !hasAnswer(t) || t.derived?.truncated) {
      records.push(skipRecord(t, "unpaired_rejection"));
      continue;
    }
    const alt = (sessions.get(t.session_id) ?? []).find(
      (o) =>
        o.id !== t.id &&
        o.ts >= t.ts &&
        !o.derived?.wasRetried && // a retried-away answer was itself rejected
        chosenEligible(o) &&
        sameContext(o, t)
    );
    records.push(alt ? pairRecord(alt, t, "continuation_rejected") : skipRecord(t, "unpaired_rejection"));
  }
  return records;
}

/** Weak ratings with no counterpart: surfaced as skips, never invented into pairs. Pure. */
function collectUnpairedWeak(store, handled, pairedChosenIds) {
  const records = [];
  for (const t of store.all) {
    if (t.feedback?.rating !== "weak") continue;
    if (handled.has(t.id) || pairedChosenIds.has(t.id)) continue;
    records.push(skipRecord(t, "unpaired_weak"));
  }
  return records;
}

/**
 * Run the three passes in order and tally results. Accumulators are locals
 * of this function — collectors never see or mutate shared state.
 */
export function buildPreferenceExport() {
  const store = getStore();
  const pairs = [];
  const skipped = [];
  const handled = new Set();
  const pairedChosenIds = new Set();
  const seenPairs = new Set(); // content identity — clones under new ids collapse

  const fold = (records) => {
    for (const r of records) {
      if (r.kind === "skip") {
        skipped.push({ trace: r.trace, reason: r.reason });
        handled.add(r.trace.id);
        continue;
      }
      const line = pairLine(r.chosen, r.rejected, r.source);
      const key = contentKey({ i: line.input.messages, p: line.preferred_output, n: line.non_preferred_output });
      if (seenPairs.has(key)) {
        skipped.push({ trace: r.rejected, reason: "duplicate_pair" });
        handled.add(r.rejected.id);
        continue;
      }
      seenPairs.add(key);
      pairs.push(line);
      handled.add(r.rejected.id);
      pairedChosenIds.add(r.chosen.id);
    }
  };

  fold(collectRetrialDispositions(store));
  fold(collectContinuationDispositions(store, handled));
  fold(collectUnpairedWeak(store, handled, pairedChosenIds));

  const sourceCounts = {};
  for (const p of pairs) {
    const source = p.metadata?.source ?? "unknown";
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }
  const skipCounts = {};
  for (const s of skipped) skipCounts[s.reason] = (skipCounts[s.reason] ?? 0) + 1;

  return { pairs, skipped, sourceCounts, skipCounts };
}
