/**
 * Trace validation and normalization.
 * Every row entering the store passes through normalizeTrace, which either
 * returns a fully-shaped trace or a human-readable rejection reason.
 */

const KNOWN_PROVIDERS = {
  claude: "anthropic",
  gpt: "openai",
  o1: "openai",
  o3: "openai",
  gemini: "google",
  deepseek: "deepseek",
  llama: "meta",
  qwen: "alibaba",
  mistral: "mistral",
};

export const RATINGS = new Set(["weak", "ok", "strong"]);
export const CONTINUATIONS = new Set(["accepted", "rejected"]);
export const ROLES = new Set(["system", "user", "assistant", "tool"]);

/**
 * Infer the provider from a model id prefix (e.g. "gpt-5" -> "openai").
 * Falls back to "unknown" rather than guessing.
 */
export function inferProvider(model) {
  const name = String(model ?? "").toLowerCase();
  const key = Object.keys(KNOWN_PROVIDERS).find((k) => name.startsWith(k));
  return key ? KNOWN_PROVIDERS[key] : "unknown";
}

/**
 * Collect structural problems with a raw row's required fields.
 * Returns an array of messages; empty means the row is acceptable.
 */
function requiredFieldProblems(raw, existingIds) {
  const problems = [];
  if (typeof raw.id !== "string" || !raw.id.trim()) problems.push("missing string `id`");
  else if (existingIds?.has(raw.id)) problems.push(`duplicate id \`${raw.id}\``);
  if (typeof raw.session_id !== "string" || !raw.session_id.trim()) problems.push("missing string `session_id`");
  // strict ISO-8601 — a lenient Date.parse would shift bare dates through the
  // server's local timezone and silently change the calendar day
  if (
    typeof raw.ts !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(raw.ts) ||
    Number.isNaN(Date.parse(raw.ts))
  ) {
    problems.push("`ts` is not an ISO-8601 timestamp");
  }
  if (typeof raw.model !== "string" || !raw.model.trim()) problems.push("missing string `model`");
  if (!Number.isInteger(raw.status) || raw.status < 100 || raw.status > 599) {
    problems.push("`status` is not an HTTP status code");
  }
  // Number.isFinite: Infinity survives typeof but JSON.stringify turns it into
  // null, so an "accepted" row would silently vanish on the next corpus load
  if (!Number.isFinite(raw.latency_ms) || raw.latency_ms < 0) {
    problems.push("`latency_ms` must be a finite non-negative number");
  }
  return problems;
}

/**
 * Collect problems with the request/response/feedback sub-objects.
 * Only shape rules the platform depends on are enforced.
 */
function payloadProblems(raw) {
  const problems = [];
  const messages = raw.request?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    problems.push("`request.messages` must be a non-empty array");
  } else {
    const bad = messages.findIndex((m) => !m || !ROLES.has(m.role));
    if (bad !== -1) problems.push(`request.messages[${bad}] has an invalid role`);
  }
  const responseRole = raw.response?.message?.role;
  if (raw.status === 200 && raw.response && responseRole !== "assistant") {
    problems.push("`response.message` must be an assistant message");
  }
  if (raw.error != null && (typeof raw.error !== "object" || Array.isArray(raw.error))) {
    problems.push("`error` must be null or an object like { type, message }");
  }
  if (raw.turn != null && (!Number.isInteger(raw.turn) || raw.turn < 1)) {
    problems.push("`turn` must be a positive integer");
  }
  if (raw.cost_usd != null && !Number.isFinite(raw.cost_usd)) problems.push("`cost_usd` must be a finite number");
  if (raw.request?.temperature != null && !Number.isFinite(raw.request.temperature)) {
    problems.push("`request.temperature` must be a finite number");
  }
  const usage = raw.usage;
  if (usage != null && (typeof usage !== "object" || Array.isArray(usage))) {
    problems.push("`usage` must be an object");
  } else if (usage) {
    const badKey = ["prompt_tokens", "completion_tokens", "total_tokens"].find(
      (k) => usage[k] != null && !Number.isFinite(usage[k])
    );
    if (badKey) problems.push(`\`usage.${badKey}\` must be a finite number`);
  }
  const rating = raw.feedback?.rating;
  if (rating != null && !RATINGS.has(rating)) problems.push(`unknown feedback.rating \`${rating}\``);
  const continuation = raw.feedback?.continuation;
  if (continuation != null && !CONTINUATIONS.has(continuation)) {
    problems.push(`unknown feedback.continuation \`${continuation}\``);
  }
  return problems;
}

/**
 * Validate and normalize one raw ingested row into the canonical trace shape.
 * Strict on fields the platform depends on, lenient elsewhere; never mutates
 * the input. Returns { trace } on success or { error } with every problem found.
 */
export function normalizeTrace(raw, existingIds) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "row is not an object" };
  }
  const problems = [...requiredFieldProblems(raw, existingIds), ...payloadProblems(raw)];
  if (problems.length > 0) return { error: problems.join("; ") };

  return {
    trace: {
      id: raw.id,
      session_id: raw.session_id,
      turn: Number.isInteger(raw.turn) ? raw.turn : null,
      ts: new Date(raw.ts).toISOString(),
      model: raw.model,
      provider: typeof raw.provider === "string" ? raw.provider : inferProvider(raw.model),
      status: raw.status,
      error: raw.error ?? null,
      request: {
        system: typeof raw.request?.system === "string" ? raw.request.system : null,
        messages: raw.request.messages,
        tools: Array.isArray(raw.request?.tools) ? raw.request.tools : null,
        temperature: typeof raw.request?.temperature === "number" ? raw.request.temperature : null,
        max_tokens: Number.isInteger(raw.request?.max_tokens) ? raw.request.max_tokens : null,
      },
      response: raw.response ?? null,
      usage: raw.usage ?? null,
      cost_usd: typeof raw.cost_usd === "number" ? raw.cost_usd : null,
      latency_ms: raw.latency_ms,
      truncated: Boolean(raw.truncated),
      feedback: {
        rating: raw.feedback?.rating ?? null,
        retry_of: raw.feedback?.retry_of ?? null,
        continuation: raw.feedback?.continuation ?? null,
      },
      client: typeof raw.client === "string" ? raw.client : null,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
    },
  };
}
