/**
 * Human-readable dictionaries for everything the export engine drops or
 * skips. The UI renders these verbatim — every exclusion the engine can
 * produce must have an entry here, so nothing is dropped without a story.
 */

export const SFT_REASONS = {
  non_2xx: {
    label: "Non-2xx status",
    detail: "The provider returned an error — there is no completed answer to train on.",
  },
  empty_response: {
    label: "Empty response",
    detail: "A 200 with no assistant content or tool calls; nothing to learn from.",
  },
  truncated: {
    label: "Truncated",
    detail: "The response hit max_tokens or the stream was cut — training on partial answers teaches the model to stop mid-thought.",
  },
  content_filter: {
    label: "Content filtered",
    detail: "The provider ended the response with a content filter; the text is not a valid completion.",
  },
  retried_away: {
    label: "Retried away",
    detail: "The user regenerated this answer — the retry superseded it, which is an implicit rejection.",
  },
  continuation_rejected: {
    label: "Continuation rejected",
    detail: "The user explicitly rejected this turn. Rejected answers are preference data, not SFT data.",
  },
  weak_rating: {
    label: "Rated weak",
    detail: "Explicit negative feedback. Never a training target: dropped as its own line, and loss-masked (weight 0) where the session replayed it inside a kept transcript.",
  },
  superseded: {
    label: "Superseded by longer transcript",
    detail: "Agent clients replay the whole conversation every turn, so this trace is a prefix of the session's longest kept transcript — exporting both would duplicate the same turns.",
  },
  duplicate_content: {
    label: "Duplicate conversation",
    detail: "Byte-identical to an earlier kept conversation (ignoring volatile call ids) — traffic repeats itself, and training on repeats over-weights them.",
  },
};

export const PREF_SOURCES = {
  retrial: {
    label: "Retrial",
    detail: "The user regenerated a completed answer. The retry they kept is chosen; the answer they regenerated away is rejected.",
  },
  weak_rating: {
    label: "Weak rating",
    detail: "The original was explicitly rated weak before being regenerated — the strongest rejection signal in the corpus.",
  },
  continuation_rejected: {
    label: "Continuation rejected",
    detail: "The user rejected a proposed turn and accepted an alternative generated over the same context.",
  },
};

export const PREF_SKIP_REASONS = {
  failed_original: {
    label: "Retry of a failed request",
    detail: "The original never produced an answer (non-2xx), so there is no rejected side — infra retries are not preference signal.",
  },
  truncated_original: {
    label: "Retry of a truncated answer",
    detail: "The rejected side would be a cut-off stream artifact, not an answer the model chose to give.",
  },
  context_mismatch: {
    label: "Context mismatch",
    detail: "Chosen and rejected must share an identical prompt context; these differ, so the comparison is invalid.",
  },
  chosen_ineligible: {
    label: "No usable chosen side",
    detail: "Every retry in the chain failed, was truncated, was empty, or was itself rejected — nothing accepted to pair against.",
  },
  unpaired_weak: {
    label: "Weak rating, no counterpart",
    detail: "Rated weak but never regenerated — there is no accepted answer over the same context to prefer.",
  },
  unpaired_rejection: {
    label: "Rejected continuation, no counterpart",
    detail: "The turn was rejected but no accepted alternative with the same context exists in the session.",
  },
  duplicate_pair: {
    label: "Duplicate pair",
    detail: "Identical context and outputs to an earlier pair under different ids — kept once so the preference isn't over-weighted.",
  },
};
