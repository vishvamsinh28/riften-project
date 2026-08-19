import { getStore } from "./store.js";

/**
 * URL-driven trace filtering. parseFilters turns a flat searchParams object
 * into a typed filter description; filterTraces applies it against the store.
 * Both are pure with respect to their inputs.
 */

const FEEDBACK_PREDICATES = {
  strong: (t) => t.feedback?.rating === "strong",
  ok: (t) => t.feedback?.rating === "ok",
  weak: (t) => t.feedback?.rating === "weak",
  unrated: (t) => (t.feedback?.rating ?? null) === null,
  cont_accepted: (t) => t.feedback?.continuation === "accepted",
  cont_rejected: (t) => t.feedback?.continuation === "rejected",
  retried: (t) => t.derived?.wasRetried === true,
  retry: (t) => t.derived?.isRetry === true,
};

/** Allowed rows-per-page values; anything else in the URL snaps to the default. */
export const PER_PAGE_OPTIONS = [25, 50, 100];
export const PER_PAGE_DEFAULT = 50;

const SORT_KEYS = {
  ts: (t) => t.ts,
  cost: (t) => t.cost_usd ?? -1,
  latency: (t) => t.latency_ms,
  tokens: (t) => t.usage?.total_tokens ?? -1,
  turns: (t) => t.derived?.convLength ?? 0,
};

/**
 * Parse a flat searchParams object (string values) into a filter description.
 * Unknown feedback tokens and non-numeric ranges are dropped, not errored —
 * a hand-edited URL should degrade, never crash.
 */
export function parseFilters(searchParams) {
  const sp = searchParams ?? {};
  const list = (key) => (sp[key] ? String(sp[key]).split(",").filter(Boolean) : []);
  const num = (key) => {
    const v = parseFloat(sp[key]);
    return Number.isFinite(v) ? v : null;
  };
  const perPage = parseInt(sp.per_page, 10);
  return {
    model: list("model"),
    status: list("status"), // status classes: "2xx" | "4xx" | "5xx"
    feedback: list("feedback").filter((f) => f in FEEDBACK_PREDICATES),
    truncated: sp.truncated === "1",
    toolErrors: sp.tool_errors === "1",
    costMin: num("cost_min"),
    costMax: num("cost_max"),
    latMin: num("lat_min"),
    latMax: num("lat_max"),
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    session: typeof sp.session === "string" ? sp.session : "",
    sort: typeof sp.sort === "string" ? sp.sort : "ts",
    dir: sp.dir === "asc" ? "asc" : "desc",
    page: Math.max(1, parseInt(sp.page, 10) || 1),
    per_page: PER_PAGE_OPTIONS.includes(perPage) ? perPage : PER_PAGE_DEFAULT,
  };
}

/**
 * Flatten a trace's textual surface (system, messages, tool calls, response)
 * for substring search. Lowercased once so the caller compares cheaply.
 */
function traceText(t) {
  const parts = [t.request?.system ?? ""];
  const collect = (m) => {
    if (typeof m?.content === "string") parts.push(m.content);
    for (const c of m?.tool_calls ?? []) {
      parts.push(c.function?.name ?? "", c.function?.arguments ?? "");
    }
  };
  (t.request?.messages ?? []).forEach(collect);
  if (t.response?.message) collect(t.response.message);
  return parts.join("\n").toLowerCase();
}

/** Build the predicate list for a filter description; one entry per active facet. */
function activePredicates(f) {
  const preds = [];
  if (f.session) preds.push((t) => t.session_id === f.session);
  if (f.model.length > 0) preds.push((t) => f.model.includes(t.model));
  if (f.status.length > 0) preds.push((t) => f.status.includes(t.derived?.statusClass));
  if (f.feedback.length > 0) preds.push((t) => f.feedback.some((k) => FEEDBACK_PREDICATES[k](t)));
  if (f.truncated) preds.push((t) => t.derived?.truncated === true);
  if (f.toolErrors) preds.push((t) => t.derived?.hasToolError === true);
  // an active cost bound excludes traces with no recorded cost (failed
  // requests) — "cheaper than X" must not mean "cost unknown"
  if (f.costMin != null) preds.push((t) => t.cost_usd != null && t.cost_usd >= f.costMin);
  if (f.costMax != null) preds.push((t) => t.cost_usd != null && t.cost_usd <= f.costMax);
  if (f.latMin != null) preds.push((t) => t.latency_ms >= f.latMin);
  if (f.latMax != null) preds.push((t) => t.latency_ms <= f.latMax);
  if (f.q) {
    const q = f.q.toLowerCase();
    preds.push((t) => t.id.includes(q) || t.session_id.includes(q) || traceText(t).includes(q));
  }
  return preds;
}

/**
 * Apply a parsed filter description against the whole store and return a
 * newly sorted array. The store's own arrays are never reordered.
 */
export function filterTraces(filters) {
  const preds = activePredicates(filters);
  const matched = getStore().all.filter((t) => preds.every((p) => p(t)));

  const key = SORT_KEYS[filters.sort] ?? SORT_KEYS.ts;
  const dir = filters.dir === "asc" ? 1 : -1;
  return matched.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
  });
}
