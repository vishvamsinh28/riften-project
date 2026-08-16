/**
 * Per-line shape checks for the export validator, extracted so each check
 * reads flat (guard clauses, nesting ≤ 2). Every helper takes the suite's
 * `check(condition, message)` recorder as its first argument.
 */

export const ROLES = new Set(["system", "user", "assistant", "tool"]);

/**
 * Validate one chat message: known role, tool messages carry string content
 * and a tool_call_id, tool_calls entries are well-formed function calls.
 */
export function checkMessageShape(check, m) {
  check(ROLES.has(m?.role), `bad role ${m?.role}`);
  if (m?.role === "tool") {
    check(typeof m.tool_call_id === "string", "tool message missing tool_call_id");
    check(typeof m.content === "string", "tool message content is not a string");
  }
  for (const c of m?.tool_calls ?? []) {
    check(c?.type === "function" && typeof c?.function?.name === "string", "malformed tool_call");
    try {
      JSON.parse(c?.function?.arguments);
    } catch {
      check(false, "tool_call arguments not JSON");
    }
  }
}

/**
 * A non-final assistant message with tool_calls must have a matching tool
 * result later in the transcript — otherwise the conversation is broken.
 */
export function checkToolResultsFollow(check, line, m, i) {
  if (m?.role !== "assistant" || !m?.tool_calls || i >= line.messages.length - 1) return;
  for (const c of m.tool_calls) {
    check(
      line.messages.slice(i + 1).some((r) => r?.role === "tool" && r?.tool_call_id === c?.id),
      `tool_call ${c?.id} has no tool result in transcript`
    );
  }
}

/**
 * Validate one full SFT export line: message count, assistant-final ending,
 * unmasked final answer, per-message shape, tool-result pairing, metadata.
 */
export function checkLineShape(check, line) {
  check(Array.isArray(line?.messages) && line.messages.length >= 2, "line with <2 messages");
  const last = line.messages[line.messages.length - 1];
  check(last?.role === "assistant", "SFT line does not end with an assistant message");
  check(last?.weight !== 0, "SFT line's final answer is loss-masked — nothing to train on");
  for (const m of line.messages) checkMessageShape(check, m);
  line.messages.forEach((m, i) => checkToolResultsFollow(check, line, m, i));
  check(
    Boolean(line.metadata) && typeof line.metadata.model === "string" && typeof line.metadata.latency_ms === "number",
    "line missing metadata"
  );
}
