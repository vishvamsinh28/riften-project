import { readFileSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trace store. Source of truth is data/traces.ndjson; rows ingested at runtime
 * are appended to the file when the filesystem allows it and kept in memory
 * otherwise (read-only deploys). Derived fields are computed once per load.
 */

const DATA_FILE = join(process.cwd(), "data", "traces.ndjson");

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

function inferProvider(model) {
  const key = Object.keys(KNOWN_PROVIDERS).find((k) => String(model).toLowerCase().startsWith(k));
  return key ? KNOWN_PROVIDERS[key] : "unknown";
}

/* ------------------------------- validation ------------------------------- */

const RATINGS = new Set(["weak", "ok", "strong"]);
const CONTINUATIONS = new Set(["accepted", "rejected"]);
const ROLES = new Set(["system", "user", "assistant", "tool"]);

/**
 * Validate + normalize one raw ingested row. Returns { trace } or { error }.
 * Strict on the fields the platform depends on, lenient elsewhere.
 */
export function normalizeTrace(raw, existingIds) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "row is not an object" };
  }
  const problems = [];
  if (typeof raw.id !== "string" || !raw.id.trim()) problems.push("missing string `id`");
  else if (existingIds?.has(raw.id)) problems.push(`duplicate id \`${raw.id}\``);
  if (typeof raw.session_id !== "string" || !raw.session_id.trim()) problems.push("missing string `session_id`");
  if (!raw.ts || Number.isNaN(Date.parse(raw.ts))) problems.push("`ts` is not a parseable timestamp");
  if (typeof raw.model !== "string" || !raw.model.trim()) problems.push("missing string `model`");
  if (!Number.isInteger(raw.status) || raw.status < 100 || raw.status > 599) problems.push("`status` is not an HTTP status code");
  if (!raw.request || !Array.isArray(raw.request.messages) || raw.request.messages.length === 0) {
    problems.push("`request.messages` must be a non-empty array");
  } else {
    const bad = raw.request.messages.findIndex((m) => !m || !ROLES.has(m.role));
    if (bad !== -1) problems.push(`request.messages[${bad}] has an invalid role`);
  }
  if (raw.status === 200 && raw.response) {
    const msg = raw.response.message;
    if (!msg || msg.role !== "assistant") problems.push("`response.message` must be an assistant message");
  }
  if (typeof raw.latency_ms !== "number" || raw.latency_ms < 0) problems.push("`latency_ms` must be a non-negative number");
  if (raw.feedback?.rating != null && !RATINGS.has(raw.feedback.rating)) problems.push(`unknown feedback.rating \`${raw.feedback.rating}\``);
  if (raw.feedback?.continuation != null && !CONTINUATIONS.has(raw.feedback.continuation)) problems.push(`unknown feedback.continuation \`${raw.feedback.continuation}\``);

  if (problems.length) return { error: problems.join("; ") };

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
        system: typeof raw.request.system === "string" ? raw.request.system : null,
        messages: raw.request.messages,
        tools: Array.isArray(raw.request.tools) ? raw.request.tools : null,
        temperature: typeof raw.request.temperature === "number" ? raw.request.temperature : null,
        max_tokens: Number.isInteger(raw.request.max_tokens) ? raw.request.max_tokens : null,
      },
      response: raw.response ?? null,
      usage: raw.usage ?? null,
      cost_usd: typeof raw.cost_usd === "number" ? raw.cost_usd : null,
      latency_ms: raw.latency_ms,
      truncated: !!raw.truncated,
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

/* -------------------------------- derived --------------------------------- */

function isToolError(m) {
  return m.role === "tool" && typeof m.content === "string" && /^\s*\{\s*"error"/.test(m.content);
}

function deriveAll(traces) {
  const retriedBy = new Map(); // original id -> [retry ids], any order
  for (const t of traces) {
    const orig = t.feedback.retry_of;
    if (orig) {
      if (!retriedBy.has(orig)) retriedBy.set(orig, []);
      retriedBy.get(orig).push(t.id);
    }
  }
  const sessions = new Map();
  for (const t of traces) {
    if (!sessions.has(t.session_id)) sessions.set(t.session_id, []);
    sessions.get(t.session_id).push(t);
  }
  for (const list of sessions.values()) list.sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0) || a.ts.localeCompare(b.ts));

  for (const t of traces) {
    const finish = t.response?.finish_reason ?? null;
    t.derived = {
      finish,
      truncated: t.truncated || finish === "length",
      wasRetried: retriedBy.has(t.id),
      isRetry: !!t.feedback.retry_of,
      hasToolError: t.request.messages.some(isToolError),
      convLength: t.request.messages.length + (t.response?.message ? 1 : 0),
      statusClass: t.status >= 500 ? "5xx" : t.status >= 400 ? "4xx" : "2xx",
      sessionSize: sessions.get(t.session_id).length,
    };
  }
  return { retriedBy, sessions };
}

/* --------------------------------- store ---------------------------------- */

function freshState() {
  return { mtimeMs: -1, traces: [], extras: [], index: null };
}

// Survives HMR module re-evaluation in dev.
const state = (globalThis.__riftenStore ??= freshState());

function rebuild() {
  const all = [...state.traces, ...state.extras];
  all.sort((a, b) => a.ts.localeCompare(b.ts));
  const { retriedBy, sessions } = deriveAll(all);
  state.index = { all, retriedBy, sessions, byId: new Map(all.map((t) => [t.id, t])) };
}

function ensureLoaded() {
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(DATA_FILE).mtimeMs;
  } catch {
    mtimeMs = -1; // no corpus file; store may still hold ingested extras
  }
  if (state.mtimeMs === mtimeMs && state.index) return;
  state.mtimeMs = mtimeMs;
  state.traces = [];
  if (mtimeMs !== -1) {
    const text = readFileSync(DATA_FILE, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        const { trace } = normalizeTrace(raw);
        if (trace) state.traces.push(trace);
      } catch {
        // corrupt line in the seed file: skip
      }
    }
  }
  rebuild();
}

export function getStore() {
  ensureLoaded();
  return state.index;
}

export function getTrace(id) {
  return getStore().byId.get(id) ?? null;
}

export function getSession(sessionId) {
  return getStore().sessions.get(sessionId) ?? null;
}

/**
 * Ingest raw rows (already parsed objects). Returns per-row results.
 * Accepted rows are appended to the NDJSON file when writable, otherwise
 * kept in memory for the life of the process.
 */
export function ingestRows(rows) {
  ensureLoaded();
  const existingIds = new Set(getStore().byId.keys());
  const accepted = [];
  const rejected = [];
  rows.forEach((raw, i) => {
    const { trace, error } = normalizeTrace(raw, existingIds);
    if (error) {
      rejected.push({ row: i + 1, id: typeof raw?.id === "string" ? raw.id : null, error });
    } else {
      existingIds.add(trace.id);
      accepted.push(trace);
    }
  });

  if (accepted.length) {
    const payload = accepted.map((t) => {
      const { derived, ...bare } = t;
      return JSON.stringify(bare);
    }).join("\n") + "\n";
    try {
      appendFileSync(DATA_FILE, payload);
      state.mtimeMs = -2; // force reload from file on next read
    } catch {
      state.extras.push(...accepted); // read-only filesystem: memory only
      rebuild();
    }
  }
  return { accepted: accepted.length, rejected, total: rows.length };
}

/* ------------------------------- aggregates -------------------------------- */

export function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function corpusStats() {
  const { all, sessions } = getStore();
  const ok = all.filter((t) => t.status === 200);
  const latencies = ok.map((t) => t.latency_ms).sort((a, b) => a - b);
  const byModel = new Map();
  for (const t of all) {
    if (!byModel.has(t.model)) byModel.set(t.model, { model: t.model, provider: t.provider, count: 0, cost: 0, tokens: 0, errors: 0, latencies: [] });
    const m = byModel.get(t.model);
    m.count += 1;
    m.cost += t.cost_usd ?? 0;
    m.tokens += t.usage?.total_tokens ?? 0;
    if (t.status !== 200) m.errors += 1;
    else m.latencies.push(t.latency_ms);
  }
  for (const m of byModel.values()) {
    m.latencies.sort((a, b) => a - b);
    m.p50 = Math.round(quantile(m.latencies, 0.5));
    m.p95 = Math.round(quantile(m.latencies, 0.95));
    delete m.latencies;
  }
  return {
    traces: all.length,
    sessions: sessions.size,
    cost: all.reduce((s, t) => s + (t.cost_usd ?? 0), 0),
    tokens: all.reduce((s, t) => s + (t.usage?.total_tokens ?? 0), 0),
    errors: all.filter((t) => t.status !== 200).length,
    truncated: all.filter((t) => t.derived.truncated).length,
    toolErrors: all.filter((t) => t.derived.hasToolError).length,
    retries: all.filter((t) => t.derived.isRetry).length,
    p50: Math.round(quantile(latencies, 0.5)),
    p95: Math.round(quantile(latencies, 0.95)),
    ratings: {
      strong: all.filter((t) => t.feedback.rating === "strong").length,
      ok: all.filter((t) => t.feedback.rating === "ok").length,
      weak: all.filter((t) => t.feedback.rating === "weak").length,
    },
    continuation: {
      accepted: all.filter((t) => t.feedback.continuation === "accepted").length,
      rejected: all.filter((t) => t.feedback.continuation === "rejected").length,
    },
    models: [...byModel.values()].sort((a, b) => b.count - a.count),
    firstTs: all[0]?.ts ?? null,
    lastTs: all[all.length - 1]?.ts ?? null,
  };
}

/* --------------------------------- filters --------------------------------- */

const FEEDBACK_PREDICATES = {
  strong: (t) => t.feedback.rating === "strong",
  ok: (t) => t.feedback.rating === "ok",
  weak: (t) => t.feedback.rating === "weak",
  unrated: (t) => t.feedback.rating === null,
  cont_accepted: (t) => t.feedback.continuation === "accepted",
  cont_rejected: (t) => t.feedback.continuation === "rejected",
  retried: (t) => t.derived.wasRetried,
  retry: (t) => t.derived.isRetry,
};

export function parseFilters(searchParams) {
  const sp = searchParams;
  const list = (key) => (sp[key] ? String(sp[key]).split(",").filter(Boolean) : []);
  const num = (key) => {
    const v = parseFloat(sp[key]);
    return Number.isFinite(v) ? v : null;
  };
  return {
    model: list("model"),
    status: list("status"), // "2xx" | "4xx" | "5xx"
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
  };
}

function traceText(t) {
  const parts = [t.request.system ?? ""];
  for (const m of t.request.messages) {
    if (typeof m.content === "string") parts.push(m.content);
    if (m.tool_calls) for (const c of m.tool_calls) parts.push(c.function.name, c.function.arguments);
  }
  if (t.response?.message) {
    if (typeof t.response.message.content === "string") parts.push(t.response.message.content);
    if (t.response.message.tool_calls) for (const c of t.response.message.tool_calls) parts.push(c.function.name, c.function.arguments);
  }
  return parts.join("\n").toLowerCase();
}

const SORTS = {
  ts: (t) => t.ts,
  cost: (t) => t.cost_usd ?? -1,
  latency: (t) => t.latency_ms,
  tokens: (t) => t.usage?.total_tokens ?? -1,
  turns: (t) => t.derived.convLength,
};

export function filterTraces(filters) {
  const { all } = getStore();
  let out = all;
  if (filters.session) out = out.filter((t) => t.session_id === filters.session);
  if (filters.model.length) out = out.filter((t) => filters.model.includes(t.model));
  if (filters.status.length) out = out.filter((t) => filters.status.includes(t.derived.statusClass));
  if (filters.feedback.length) out = out.filter((t) => filters.feedback.some((f) => FEEDBACK_PREDICATES[f](t)));
  if (filters.truncated) out = out.filter((t) => t.derived.truncated);
  if (filters.toolErrors) out = out.filter((t) => t.derived.hasToolError);
  if (filters.costMin != null) out = out.filter((t) => (t.cost_usd ?? 0) >= filters.costMin);
  if (filters.costMax != null) out = out.filter((t) => (t.cost_usd ?? 0) <= filters.costMax);
  if (filters.latMin != null) out = out.filter((t) => t.latency_ms >= filters.latMin);
  if (filters.latMax != null) out = out.filter((t) => t.latency_ms <= filters.latMax);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    out = out.filter((t) => t.id.includes(q) || t.session_id.includes(q) || traceText(t).includes(q));
  }
  const key = SORTS[filters.sort] ?? SORTS.ts;
  const dir = filters.dir === "asc" ? 1 : -1;
  out = [...out].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
  });
  return out;
}
