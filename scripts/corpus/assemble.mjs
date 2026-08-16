import { rand, rint, chance, uid } from "./rng.mjs";
import { MODELS } from "./models.mjs";
import { promptTokens, msgTokens, round6 } from "./tokens.mjs";

/**
 * Trace assembly: template filling, latency simulation, and the makeTrace
 * factory that turns a step outcome into a full router-trace record.
 * RNG call order inside these functions is part of the corpus contract.
 */

/** Substitute {placeholders} from a variant; unknown keys stay literal. */
export function fill(str, vars) {
  if (typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

/** fill() across a tool-call argument object, preserving non-string values. */
export function fillArgs(args, vars) {
  const out = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === "string" ? fill(v, vars) : v;
  return out;
}

/**
 * Simulated wall-clock latency: model base + per-token cost with jitter and
 * a long tail; failures either fail fast (429) or hang then die (5xx).
 */
export function computeLatency(model, completionTokens, opts = {}) {
  const m = MODELS[model];
  const mult = 0.82 + rand() * 0.5 + (chance(0.06) ? rand() * 1.6 : 0); // long tail
  let ms = m.base + completionTokens * m.perTok * mult;
  if (opts.failFast) ms = rint(120, 900);
  if (opts.slowFail) ms = rint(8_000, 30_000);
  return Math.round(ms);
}

/** Cut a string mid-thought at roughly `frac` of its length (stream cut / max_tokens). */
export function truncateText(s, frac) {
  const cut = Math.max(40, Math.floor(s.length * frac));
  return s.slice(0, cut).replace(/\s+\S*$/, "") + " —";
}

/**
 * Build one complete trace record. Usage and cost only exist for completed
 * 200s; failures get an error object and a failure-shaped latency instead.
 */
export function makeTrace({ session, turn, model, system, messages, tools, temperature, status, error, responseMsg, finishReason, truncated, feedback, retryOf, ts, tags }) {
  const m = MODELS[model];
  const pt = promptTokens(system, messages, tools);

  let usage = null;
  let cost = null;
  let latency;
  if (status === 200 && responseMsg) {
    const ct = msgTokens(responseMsg);
    usage = { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct };
    cost = round6((pt * m.in + ct * m.out) / 1e6);
    latency = computeLatency(model, ct);
  } else {
    latency = computeLatency(model, 0, {
      failFast: status === 429 || status === 401,
      slowFail: status === 500 || status === 503 || status === 529,
    });
  }

  return {
    id: uid("tr"),
    session_id: session.id,
    turn,
    ts: new Date(ts).toISOString(),
    model,
    provider: m.provider,
    status,
    error: error ?? null,
    request: {
      system,
      messages,
      tools: tools ?? null,
      temperature,
      max_tokens: session.maxTokens,
    },
    // An explicit null finishReason (stream cut) must survive; only an
    // omitted value defaults to "stop".
    response: responseMsg ? { message: responseMsg, finish_reason: finishReason === undefined ? "stop" : finishReason } : null,
    usage,
    cost_usd: cost,
    latency_ms: latency,
    truncated: Boolean(truncated),
    feedback: {
      rating: feedback?.rating ?? null,
      retry_of: retryOf ?? null,
      continuation: feedback?.continuation ?? null,
    },
    client: session.client,
    tags: tags ?? session.tags,
  };
}
