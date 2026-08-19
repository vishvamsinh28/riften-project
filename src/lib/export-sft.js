import { getStore } from "./store.js";
import { hasAnswer, conversationMessages, lineMetadata, canonicalJson, contentKey } from "./export-helpers.js";

/**
 * SFT export: OpenAI chat-jsonl, one conversation per line. Drops rejected
 * answers, non-2xx, and truncated rows; keeps one line per session (the
 * longest clean transcript) since agent clients replay full history each
 * turn. Every dropped trace is returned with its reason.
 */

/**
 * True when any feedback signal marks this trace's answer as user-rejected.
 * Read from the signals themselves, not the exclusion reason — precedence
 * (e.g. "truncated") must never hide a rejection from the masking pass.
 */
function isRejectedAnswer(t) {
  return t.derived?.wasRetried === true || t.feedback?.continuation === "rejected" || t.feedback?.rating === "weak";
}

/**
 * First matching hard-exclusion reason for a trace, or null when the trace
 * is eligible to be a kept SFT line. Order encodes precedence.
 */
function sftExclusionReason(t) {
  if (t.status !== 200) return "non_2xx";
  if (!hasAnswer(t)) return "empty_response";
  if (t.derived?.truncated) return "truncated";
  if (t.response?.finish_reason === "content_filter") return "content_filter";
  if (t.derived?.wasRetried) return "retried_away";
  if (t.feedback?.continuation === "rejected") return "continuation_rejected";
  if (t.feedback?.rating === "weak") return "weak_rating";
  return null;
}

/**
 * Index the rejected answers of each session by payload, so answers the
 * user rejected but continued from can be loss-masked inside kept lines.
 */
function rejectedAnswersBySession(excluded) {
  const bySession = new Map();
  for (const e of excluded) {
    if (!isRejectedAnswer(e.trace)) continue;
    const answer = e.trace.response?.message;
    if (!answer) continue;
    const set = bySession.get(e.trace.session_id) ?? new Set();
    set.add(canonicalJson(answer)); // key-order-proof identity
    bySession.set(e.trace.session_id, set);
  }
  return bySession;
}

/**
 * Build one export line for a kept trace. Historical assistant messages that
 * match a rejected answer get weight 0 — context, never a training target.
 * Returns { line, masked } with the number of masked messages.
 */
function buildLine(t, rejectedSet) {
  let masked = 0;
  const source = conversationMessages(t);
  const messages = source.map((m, i) => {
    const isFinal = i === source.length - 1;
    if (!rejectedSet || m.role !== "assistant" || isFinal) return m;
    if (!rejectedSet.has(canonicalJson(m))) return m;
    masked += 1;
    return { ...m, weight: 0 };
  });

  const line = { messages };
  if (t.request?.tools) line.tools = t.request.tools;
  line.metadata = lineMetadata(t);
  return { line, masked };
}

/**
 * Run the full SFT pipeline over the store: per-trace screening, per-session
 * dedup to the longest clean transcript, loss-masking of embedded rejected
 * answers, and complete exclusion accounting.
 */
export function buildSftExport() {
  const { all, sessions } = getStore();
  const excluded = [];
  const eligibleBySession = new Map();

  // Pass 1: screen each trace on its own merits.
  for (const t of all) {
    const reason = sftExclusionReason(t);
    if (reason) {
      excluded.push({ trace: t, reason });
      continue;
    }
    const list = eligibleBySession.get(t.session_id) ?? [];
    eligibleBySession.set(t.session_id, [...list, t]);
  }

  // Pass 2: one conversation per session — longest transcript wins; ties
  // break toward recency (a retry replays identical context but is the
  // answer the user actually kept).
  const included = [];
  for (const list of eligibleBySession.values()) {
    const ranked = [...list].sort(
      (a, b) => (b.derived?.convLength ?? 0) - (a.derived?.convLength ?? 0) || b.ts.localeCompare(a.ts)
    );
    included.push(ranked[0]);
    for (const t of ranked.slice(1)) excluded.push({ trace: t, reason: "superseded" });
  }
  included.sort((a, b) => a.ts.localeCompare(b.ts));

  // Pass 2.5: collapse exact content repeats across sessions — production
  // traffic (and this corpus) contains identical conversations under
  // different ids. The earliest keeps; every collapse is accounted for.
  const seenContent = new Set();
  const kept = [];
  for (const t of included) {
    const key = contentKey(conversationMessages(t));
    if (seenContent.has(key)) {
      excluded.push({ trace: t, reason: "duplicate_content" });
      continue;
    }
    seenContent.add(key);
    kept.push(t);
  }

  // Pass 3: serialize, loss-masking rejected answers embedded in history.
  const rejectedBySession = rejectedAnswersBySession(excluded);
  let maskedCount = 0;
  const lines = kept.map((t) => {
    const { line, masked } = buildLine(t, rejectedBySession.get(t.session_id));
    maskedCount += masked;
    return line;
  });

  const reasonCounts = {};
  for (const e of excluded) reasonCounts[e.reason] = (reasonCounts[e.reason] ?? 0) + 1;

  return {
    lines,
    included: kept,
    excluded,
    reasonCounts,
    maskedCount,
    sessionsCovered: eligibleBySession.size,
    sessionsTotal: sessions.size,
  };
}
