/**
 * Derived-field computation over a set of normalized traces.
 * Pure: never mutates inputs; returns fresh trace copies carrying a
 * `derived` object plus the session/retry indexes the app queries.
 */

/**
 * Detect a tool-result message that reports an error payload.
 * The router convention is a JSON body whose first key is "error".
 */
export function isToolError(message) {
  if (message?.role !== "tool") return false;
  if (typeof message.content !== "string") return false;
  return /^\s*\{\s*"error"/.test(message.content);
}

/**
 * Index retries by the trace they replaced (feedback.retry_of back-links).
 * Returns Map<originalId, retryId[]>.
 */
function indexRetries(traces) {
  const retriedBy = new Map();
  for (const t of traces) {
    const originalId = t.feedback?.retry_of;
    if (!originalId) continue;
    const list = retriedBy.get(originalId) ?? [];
    retriedBy.set(originalId, [...list, t.id]);
  }
  return retriedBy;
}

/**
 * Group traces by session, each group sorted by turn then timestamp
 * so replayed-transcript prefixes appear in conversation order.
 */
function indexSessions(traces) {
  const sessions = new Map();
  for (const t of traces) {
    const list = sessions.get(t.session_id) ?? [];
    sessions.set(t.session_id, [...list, t]);
  }
  for (const [id, list] of sessions) {
    const sorted = [...list].sort(
      (a, b) => (a.turn ?? 0) - (b.turn ?? 0) || a.ts.localeCompare(b.ts)
    );
    sessions.set(id, sorted);
  }
  return sessions;
}

/**
 * Compute the derived block for one trace given the prebuilt indexes.
 * Everything the UI filters or badges on is precomputed here once.
 */
function deriveTrace(t, retriedBy, sessionSize) {
  const finish = t.response?.finish_reason ?? null;
  return {
    finish,
    truncated: t.truncated || finish === "length",
    wasRetried: retriedBy.has(t.id),
    isRetry: Boolean(t.feedback?.retry_of),
    hasToolError: (t.request?.messages ?? []).some(isToolError),
    convLength: (t.request?.messages?.length ?? 0) + (t.response?.message ? 1 : 0),
    statusClass: t.status >= 500 ? "5xx" : t.status >= 400 ? "4xx" : "2xx",
    sessionSize,
  };
}

/**
 * Build the full read index for a list of normalized traces: derived copies
 * sorted by time, plus byId / sessions / retriedBy lookups. The input array
 * and its traces are left untouched.
 */
export function buildIndex(bareTraces) {
  const sorted = [...bareTraces].sort((a, b) => a.ts.localeCompare(b.ts));
  const retriedBy = indexRetries(sorted);
  const preliminarySessions = indexSessions(sorted);

  const all = sorted.map((t) => ({
    ...t,
    derived: deriveTrace(t, retriedBy, preliminarySessions.get(t.session_id)?.length ?? 1),
  }));

  // Re-index over the derived copies so session lists hand out the same
  // object identities as `all` (pages compare traces by reference).
  const sessions = indexSessions(all);
  return { all, retriedBy, sessions, byId: new Map(all.map((t) => [t.id, t])) };
}
