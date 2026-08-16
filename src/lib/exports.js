import { getStore } from "./store.js";

/**
 * Turn router traffic into training data.
 *
 * SFT export — OpenAI chat-jsonl, one conversation per line:
 *   drop non-2xx, truncated, and rejected answers (retried-away, continuation-
 *   rejected, weak-rated), then keep ONE conversation per session — the longest
 *   eligible transcript — because agent clients replay the full history every
 *   turn, so shorter traces in a session are prefixes of the longest one.
 *
 * Preference export — chosen/rejected pairs over an identical context, from:
 *   retrials (regenerated answers), weak ratings with an accepted counterpart,
 *   and continuation-rejected turns followed by an accepted alternative.
 *
 * Every builder returns full exclusion accounting: nothing is dropped silently.
 */

/* -------------------------------- helpers --------------------------------- */

const sameContext = (a, b) =>
  a.request.system === b.request.system &&
  JSON.stringify(a.request.messages) === JSON.stringify(b.request.messages);

const hasAnswer = (t) => {
  const msg = t.response?.message;
  if (!msg) return false;
  const hasText = typeof msg.content === "string" && msg.content.trim().length > 0;
  const hasCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
  return hasText || hasCalls;
};

/** Ingested data may violate shape invariants; exports must not. */
function asExportMessage(m) {
  if (m.role === "tool" && typeof m.content !== "string") {
    return { ...m, content: m.content == null ? "" : JSON.stringify(m.content) };
  }
  return m;
}

function conversationMessages(t) {
  const msgs = [];
  if (t.request.system) msgs.push({ role: "system", content: t.request.system });
  msgs.push(...t.request.messages.map(asExportMessage));
  msgs.push(t.response.message);
  return msgs;
}

function lineMetadata(t) {
  return {
    trace_id: t.id,
    session_id: t.session_id,
    model: t.model,
    provider: t.provider,
    prompt_tokens: t.usage?.prompt_tokens ?? null,
    completion_tokens: t.usage?.completion_tokens ?? null,
    total_tokens: t.usage?.total_tokens ?? null,
    cost_usd: t.cost_usd,
    latency_ms: t.latency_ms,
    finish_reason: t.response?.finish_reason ?? null,
    feedback: {
      rating: t.feedback.rating,
      continuation: t.feedback.continuation,
      was_retried: t.derived.wasRetried,
      is_retry: t.derived.isRetry,
    },
    ts: t.ts,
  };
}

/* ------------------------------- SFT export -------------------------------- */

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
};

/** First matching hard-exclusion reason for a trace, or null if eligible. */
function sftExclusionReason(t) {
  if (t.status !== 200) return "non_2xx";
  if (!hasAnswer(t)) return "empty_response";
  if (t.derived.truncated) return "truncated";
  if (t.response?.finish_reason === "content_filter") return "content_filter";
  if (t.derived.wasRetried) return "retried_away";
  if (t.feedback.continuation === "rejected") return "continuation_rejected";
  if (t.feedback.rating === "weak") return "weak_rating";
  return null;
}

export function buildSftExport() {
  const { all, sessions } = getStore();
  const excluded = [];
  const eligibleBySession = new Map();

  for (const t of all) {
    const reason = sftExclusionReason(t);
    if (reason) {
      excluded.push({ trace: t, reason });
      continue;
    }
    if (!eligibleBySession.has(t.session_id)) eligibleBySession.set(t.session_id, []);
    eligibleBySession.get(t.session_id).push(t);
  }

  const included = [];
  for (const list of eligibleBySession.values()) {
    // Longest transcript wins; tie broken by recency (a retry replays identical
    // context but is the answer the user actually kept).
    list.sort((a, b) => b.derived.convLength - a.derived.convLength || b.ts.localeCompare(a.ts));
    included.push(list[0]);
    for (const t of list.slice(1)) excluded.push({ trace: t, reason: "superseded" });
  }
  included.sort((a, b) => a.ts.localeCompare(b.ts));

  // A rejected answer (retried away, continuation-rejected, rated weak) can
  // still sit inside the kept transcript's replayed history when the user
  // continued the session from it. Chat-jsonl trains on every assistant
  // message, so those get loss-masked with weight 0 rather than trained on.
  const REJECTED_REASONS = new Set(["retried_away", "continuation_rejected", "weak_rating"]);
  const rejectedBySession = new Map();
  for (const e of excluded) {
    if (!REJECTED_REASONS.has(e.reason) || !e.trace.response?.message) continue;
    if (!rejectedBySession.has(e.trace.session_id)) rejectedBySession.set(e.trace.session_id, new Set());
    rejectedBySession.get(e.trace.session_id).add(JSON.stringify(e.trace.response.message));
  }

  let maskedCount = 0;
  const lines = included.map((t) => {
    const rejectedSet = rejectedBySession.get(t.session_id);
    const messages = conversationMessages(t).map((m, i, arr) => {
      if (
        rejectedSet &&
        m.role === "assistant" &&
        i < arr.length - 1 &&
        rejectedSet.has(JSON.stringify(m))
      ) {
        maskedCount += 1;
        return { ...m, weight: 0 };
      }
      return m;
    });
    const line = { messages };
    if (t.request.tools) line.tools = t.request.tools;
    line.metadata = lineMetadata(t);
    return line;
  });

  const reasonCounts = {};
  for (const key of Object.keys(SFT_REASONS)) reasonCounts[key] = 0;
  for (const e of excluded) reasonCounts[e.reason] += 1;

  return {
    lines,
    included,
    excluded,
    reasonCounts,
    maskedCount,
    sessionsCovered: eligibleBySession.size,
    sessionsTotal: sessions.size,
  };
}

/* --------------------------- preference export ----------------------------- */

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
    detail: "Every retry in the chain failed, was truncated, or was empty — nothing accepted to pair against.",
  },
  unpaired_weak: {
    label: "Weak rating, no counterpart",
    detail: "Rated weak but never regenerated — there is no accepted answer over the same context to prefer.",
  },
  unpaired_rejection: {
    label: "Rejected continuation, no counterpart",
    detail: "The turn was rejected but no accepted alternative with the same context exists in the session.",
  },
};

/** Follow retry links forward to the final answer the user ended up keeping. */
function chainEnd(trace, retriedBy, byId) {
  let cur = trace;
  const seen = new Set();
  while (retriedBy.has(cur.id) && !seen.has(cur.id)) {
    seen.add(cur.id);
    const retries = retriedBy
      .get(cur.id)
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    if (!retries.length) break;
    cur = retries[retries.length - 1];
  }
  return cur;
}

function pairLine(chosen, rejected, source) {
  const input = { messages: [] };
  if (rejected.request.system) input.messages.push({ role: "system", content: rejected.request.system });
  input.messages.push(...rejected.request.messages.map(asExportMessage));
  if (rejected.request.tools) input.tools = rejected.request.tools;
  return {
    input,
    preferred_output: [chosen.response.message],
    non_preferred_output: [rejected.response.message],
    metadata: {
      source,
      session_id: rejected.session_id,
      chosen: lineMetadata(chosen),
      rejected: lineMetadata(rejected),
    },
  };
}

export function buildPreferenceExport() {
  const { all, retriedBy, byId, sessions } = getStore();
  const pairs = [];
  const skipped = [];
  const handled = new Set(); // every trace gets at most one disposition
  const pairedChosenIds = new Set();

  const skip = (t, reason) => {
    skipped.push({ trace: t, reason });
    handled.add(t.id);
  };
  const pair = (chosen, rejected, source) => {
    pairs.push(pairLine(chosen, rejected, source));
    handled.add(rejected.id);
    pairedChosenIds.add(chosen.id);
  };

  /** A chosen side must itself be an answer the user did not reject. */
  const chosenEligible = (c) =>
    c.status === 200 &&
    !c.derived.truncated &&
    hasAnswer(c) &&
    c.feedback.rating !== "weak" &&
    c.feedback.continuation !== "rejected";

  /* Source 1 + 2: retrials (weak-rated originals become their own source). */
  for (const t of all) {
    if (!t.derived.wasRetried) continue;
    if (t.status !== 200 || !hasAnswer(t)) {
      skip(t, "failed_original");
      continue;
    }
    if (t.derived.truncated) {
      skip(t, "truncated_original");
      continue;
    }
    const chosen = chainEnd(t, retriedBy, byId);
    if (chosen.id === t.id || !chosenEligible(chosen)) {
      skip(t, "chosen_ineligible");
      continue;
    }
    if (!sameContext(t, chosen)) {
      skip(t, "context_mismatch");
      continue;
    }
    const source = t.feedback.rating === "weak" ? "weak_rating" : "retrial";
    pair(chosen, t, source);
  }

  /* Source 3: continuation-rejected turns paired with the accepted re-ask. */
  for (const t of all) {
    if (t.feedback.continuation !== "rejected" || handled.has(t.id)) continue;
    if (t.status !== 200 || !hasAnswer(t) || t.derived.truncated) {
      skip(t, "unpaired_rejection");
      continue;
    }
    const session = sessions.get(t.session_id) ?? [];
    const alt = session.find(
      (o) =>
        o.id !== t.id &&
        o.ts >= t.ts &&
        !o.derived.wasRetried && // a retried-away answer was itself rejected
        chosenEligible(o) &&
        sameContext(o, t)
    );
    if (!alt) {
      skip(t, "unpaired_rejection");
      continue;
    }
    pair(alt, t, "continuation_rejected");
  }

  /* Weak ratings that never got a counterpart: surface them, don't invent pairs. */
  for (const t of all) {
    if (t.feedback.rating !== "weak" || handled.has(t.id) || pairedChosenIds.has(t.id)) continue;
    skip(t, "unpaired_weak");
  }

  const sourceCounts = {};
  for (const key of Object.keys(PREF_SOURCES)) sourceCounts[key] = 0;
  for (const p of pairs) sourceCounts[p.metadata.source] += 1;
  const skipCounts = {};
  for (const key of Object.keys(PREF_SKIP_REASONS)) skipCounts[key] = 0;
  for (const s of skipped) skipCounts[s.reason] += 1;

  return { pairs, skipped, sourceCounts, skipCounts };
}

/* ------------------------------ serialization ------------------------------ */

export const toJsonl = (lines) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
