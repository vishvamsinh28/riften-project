/**
 * Token accounting for synthetic traces. Counts are estimated from content
 * length (chars/3.9) plus per-message and per-tool framing overhead, which
 * lands in a realistic range without a real tokenizer dependency.
 */

/** Rough token estimate for a string; never less than 1. */
export const tokEst = (s) => Math.max(1, Math.round(String(s ?? "").length / 3.9));

/** Token cost of one chat message, including role framing and tool calls. */
export function msgTokens(m) {
  let t = 4; // role + framing overhead
  if (typeof m?.content === "string") t += tokEst(m.content);
  for (const c of m?.tool_calls ?? []) {
    t += 8 + tokEst(c.function?.name) + tokEst(c.function?.arguments);
  }
  return t;
}

/** Prompt-side token total: system + transcript + tool schemas. */
export function promptTokens(system, messages, tools) {
  let t = 3 + (system ? tokEst(system) : 0);
  for (const m of messages) t += msgTokens(m);
  for (const tl of tools ?? []) {
    t += 12 + tokEst(JSON.stringify(tl.function?.parameters)) + tokEst(tl.function?.description ?? "");
  }
  return t;
}

/** Round a dollar amount to 6 decimal places (micro-dollar precision). */
export const round6 = (x) => Math.round(x * 1e6) / 1e6;
