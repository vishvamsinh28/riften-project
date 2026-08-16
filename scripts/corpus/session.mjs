import { rand, rint, pick, chance, uid } from "./rng.mjs";
import { ROUTES, FALLBACKS } from "./models.mjs";
import { fn } from "./tools.mjs";
import { fill, fillArgs, makeTrace, truncateText } from "./assemble.mjs";

/**
 * Session builder: walks a scenario script under an event plan and emits
 * the router traces a real agent client would produce — replayed transcript
 * per turn, retries with identical context, rejected answers never re-fed.
 * RNG call order throughout is part of the deterministic-corpus contract.
 */

/** Occasional explicit rating; "positive"-hinted steps skew strong/ok. */
function ratingFor(step) {
  if (step.rating === "positive" && chance(0.5)) return { rating: chance(0.55) ? "strong" : "ok" };
  if (chance(0.12)) return { rating: pick(["ok", "ok", "strong", "weak", "weak"]) };
  return {};
}

/**
 * Build one session's traces from a scenario+variant and an event plan.
 * Returns the emitted trace list; the caller owns collection and output.
 */
export function buildSession(scenario, variant, plan, nextSessionStart) {
  const session = {
    id: uid("ses", 8),
    client: pick(["riften-sdk-js/2.4.1", "riften-sdk-py/1.9.0", "riften-sdk-js/2.3.0", "openclient/0.12"]),
    tags: [scenario.key.split("-")[0], scenario.key],
    maxTokens: pick([1024, 2048, 4096, 4096, 8192]),
  };
  let model = pick(ROUTES[scenario.route]);
  const system = fill(scenario.system, variant);
  const tools = scenario.tools ? scenario.tools.map(fn) : null;
  const temperature = scenario.temperature;

  const traces = [];
  let ts = nextSessionStart();
  let turn = 0;
  const history = []; // the replayed transcript, accepted content only
  let assistantStepIdx = -1;

  const stepDelay = () => rint(1_500, 18_000);
  const userDelay = () => rint(8_000, 160_000);

  /** Emit one router request; advances turn and the wall clock. */
  const emit = (opts) => {
    turn += 1;
    ts += opts.gap ?? stepDelay();
    const t = makeTrace({ session, turn, model, system, messages: history.slice(), tools, temperature, ts, ...opts });
    traces.push(t);
    ts += t.latency_ms;
    return t;
  };

  /** Provider-failure retry: original dies non-2xx, router may fall back. */
  const infraRetry = (good, step) => {
    const kind = pick(["rate_limit", "overloaded", "server"]);
    const status = kind === "rate_limit" ? 429 : kind === "overloaded" ? 529 : 500;
    const err = {
      rate_limit: { type: "rate_limit_error", message: `Rate limit exceeded for ${model}. Please retry after 12s.` },
      overloaded: { type: "overloaded_error", message: "Upstream provider is overloaded. The request was shed before inference." },
      server: { type: "api_error", message: "Internal server error while streaming the response (upstream 500)." },
    }[kind];
    const failed = emit({ status, error: err, responseMsg: null });
    if (chance(0.4)) model = FALLBACKS[model]; // router falls back
    emit({ retryOf: failed.id, gap: rint(800, 14_000), status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: ratingFor(step) });
    history.push({ role: "assistant", content: good });
  };

  /** Model-level answer step, dispatching on the session's event plan. */
  const answerStep = (step) => {
    assistantStepIdx += 1;
    const idx = assistantStepIdx;
    const good = fill(step.assistant, variant);
    const weak = step.alt ? fill(step.alt, variant) : null;

    /* 1. infra retry: provider fails, router retries (maybe fallback model) */
    if (plan.infraRetryAt === idx) {
      infraRetry(good, step);
      return;
    }

    /* 2. stream cut: 200 but stream died mid-answer; client retried */
    if (plan.streamCutAt === idx) {
      const cut = truncateText(good, 0.25 + rand() * 0.3);
      const failed = emit({ status: 200, responseMsg: { role: "assistant", content: cut }, finishReason: null, truncated: true, error: { type: "stream_interrupted", message: "Client disconnected before the stream completed; partial response persisted." } });
      emit({ retryOf: failed.id, gap: rint(1_000, 9_000), status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: ratingFor(step) });
      history.push({ role: "assistant", content: good });
      return;
    }

    /* 3. quality retry: weak answer shipped, user regenerated -> pref pair */
    if (plan.qualityRetryAt === idx && weak) {
      const bad = emit({ status: 200, responseMsg: { role: "assistant", content: weak }, finishReason: "stop", feedback: { rating: chance(0.7) ? "weak" : null } });
      if (chance(0.45)) model = pick(ROUTES[scenario.route].filter((m) => m !== model)) ?? model; // user rerolls model
      emit({ retryOf: bad.id, gap: rint(4_000, 40_000), status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: { rating: chance(0.5) ? (chance(0.6) ? "strong" : "ok") : null } });
      history.push({ role: "assistant", content: good });
      return;
    }

    /* 4. continuation rejected: proposal rejected, re-ask accepted -> pref pair */
    if (plan.contRejectAt === idx && step.continuation && weak) {
      emit({ status: 200, responseMsg: { role: "assistant", content: weak }, finishReason: "stop", feedback: { continuation: "rejected" } });
      emit({ gap: rint(3_000, 25_000), status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: { continuation: "accepted" } });
      history.push({ role: "assistant", content: good });
      return;
    }

    /* 5. truncation: response hits max_tokens; session ends here */
    if (plan.truncateAt === idx) {
      const cut = truncateText(good, 0.45 + rand() * 0.25);
      emit({ status: 200, responseMsg: { role: "assistant", content: cut }, finishReason: "length", truncated: true, feedback: { rating: chance(0.35) ? "weak" : null } });
      return "stop";
    }

    /* 6. hard abandon: failure and the user walks away */
    if (plan.abandonAt === idx) {
      const status = pick([500, 503]);
      emit({ status, error: { type: "api_error", message: status === 503 ? "Upstream provider unavailable (503). All configured fallbacks exhausted." : "Internal server error while streaming the response (upstream 500)." }, responseMsg: null });
      return "stop";
    }

    /* plain good answer */
    const fb = ratingFor(step);
    if (step.continuation && chance(0.55)) fb.continuation = "accepted";
    emit({ status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: fb });
    history.push({ role: "assistant", content: good });
  };

  /** Tool round-trip: assistant emits the call, client runs it, result joins history. */
  const toolStep = (step) => {
    const args = fillArgs(step.call.args, variant);
    const callId = uid("call", 12);
    const callMsg = { role: "assistant", content: null, tool_calls: [{ id: callId, type: "function", function: { name: step.call.name, arguments: JSON.stringify(args) } }] };

    emit({ status: 200, responseMsg: callMsg, finishReason: "tool_calls" });
    history.push(callMsg);

    /* An error branch only fires when the variant actually resolves it: a
       null variant value leaves the "{placeholder}" unreplaced, which we
       detect by the surviving brace. */
    const errText = step.error ? fill(step.error, variant) : null;
    const useError = Boolean(plan.useToolError && errText && !errText.includes("{") && step.recover);
    if (!useError) {
      history.push({ role: "tool", tool_call_id: callId, name: step.call.name, content: fill(step.result ?? "", variant) });
      return;
    }
    history.push({ role: "tool", tool_call_id: callId, name: step.call.name, content: JSON.stringify({ error: errText }) });

    /* model recovers with a corrected call */
    const rArgs = fillArgs(step.recover.args, variant);
    const rId = uid("call", 12);
    const rMsg = { role: "assistant", content: null, tool_calls: [{ id: rId, type: "function", function: { name: step.recover.name, arguments: JSON.stringify(rArgs) } }] };
    emit({ status: 200, responseMsg: rMsg, finishReason: "tool_calls" });
    history.push(rMsg);
    history.push({ role: "tool", tool_call_id: rId, name: step.recover.name, content: fill(step.recoverResult ?? step.result ?? "", variant) });
  };

  for (const step of scenario.steps) {
    if (step.user) {
      history.push({ role: "user", content: fill(step.user, variant) });
      ts += userDelay();
      continue;
    }
    if (step.call) {
      toolStep(step);
      continue;
    }
    if (step.assistant && answerStep(step) === "stop") break;
  }
  return traces;
}
