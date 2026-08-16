/**
 * Shared building blocks for the SFT and preference exporters: message
 * shaping, context identity, retry-chain walking, and JSONL serialization.
 * All helpers are pure — they read traces, never modify them.
 */

/** Two traces share a training context iff system prompt and transcript match exactly. */
export function sameContext(a, b) {
  if ((a.request?.system ?? null) !== (b.request?.system ?? null)) return false;
  return JSON.stringify(a.request?.messages ?? []) === JSON.stringify(b.request?.messages ?? []);
}

/** A trace "has an answer" when its response carries text or tool calls. */
export function hasAnswer(t) {
  const msg = t.response?.message;
  if (!msg) return false;
  const hasText = typeof msg.content === "string" && msg.content.trim().length > 0;
  const hasCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
  return hasText || hasCalls;
}

/**
 * Shield exports from malformed ingested data: OpenAI requires tool-result
 * content to be a string, so coerce anything else without touching the input.
 */
export function asExportMessage(m) {
  if (m?.role !== "tool" || typeof m.content === "string") return m;
  return { ...m, content: m.content == null ? "" : JSON.stringify(m.content) };
}

/**
 * A trace's complete conversation in OpenAI chat order:
 * system (when present) + replayed transcript + this trace's answer.
 */
export function conversationMessages(t) {
  const msgs = [];
  if (t.request?.system) msgs.push({ role: "system", content: t.request.system });
  msgs.push(...(t.request?.messages ?? []).map(asExportMessage));
  msgs.push(t.response.message);
  return msgs;
}

/** Per-line metadata contract: model, tokens, cost, latency, feedback, timing. */
export function lineMetadata(t) {
  return {
    trace_id: t.id,
    session_id: t.session_id,
    model: t.model,
    provider: t.provider,
    prompt_tokens: t.usage?.prompt_tokens ?? null,
    completion_tokens: t.usage?.completion_tokens ?? null,
    total_tokens: t.usage?.total_tokens ?? null,
    cost_usd: t.cost_usd ?? null,
    latency_ms: t.latency_ms,
    finish_reason: t.response?.finish_reason ?? null,
    feedback: {
      rating: t.feedback?.rating ?? null,
      continuation: t.feedback?.continuation ?? null,
      was_retried: t.derived?.wasRetried ?? false,
      is_retry: t.derived?.isRetry ?? false,
    },
    ts: t.ts,
  };
}

/**
 * Follow retry links forward to the final answer the user ended up keeping.
 * Guards against cycles in ingested data; ties break toward the latest retry.
 */
export function chainEnd(trace, retriedBy, byId) {
  let cur = trace;
  const seen = new Set();
  while (retriedBy.has(cur.id) && !seen.has(cur.id)) {
    seen.add(cur.id);
    const retries = (retriedBy.get(cur.id) ?? [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    if (retries.length === 0) break;
    cur = retries[retries.length - 1];
  }
  return cur;
}

/**
 * One DPO-format preference line: shared input context, single-message
 * preferred/non-preferred outputs, and full per-side metadata.
 */
export function pairLine(chosen, rejected, source) {
  const input = { messages: [] };
  if (rejected.request?.system) input.messages.push({ role: "system", content: rejected.request.system });
  input.messages.push(...(rejected.request?.messages ?? []).map(asExportMessage));
  if (rejected.request?.tools) input.tools = rejected.request.tools;
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

/** Serialize export lines as JSONL — one JSON document per line, trailing newline. */
export function toJsonl(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}
