import { T } from "../tools.mjs";

/**
 * Coding-agent scenario: a small feature lands (backoff, request ids) with a
 * grep→read→plan→write→verify loop, a continuation-eligible plan step, and a
 * follow-up question turn after the work completes.
 */
export const codingFeature = {
  key: "coding-feature",
  route: "coding",
  system:
    "You are a coding agent operating on the {repo} repository. You have file and shell tools. Make focused changes, run the test suite to verify, and explain what you changed. Never invent file contents — read before you write.",
  tools: [T.read_file, T.write_file, T.run_command, T.grep_repo],
  temperature: 0.2,
  steps: [
    { user: "{feature_ask}" },
    { call: { name: "grep_repo", args: { pattern: "{grep_pattern}" } }, result: "{grep_result}" },
    { call: { name: "read_file", args: { path: "{main_file}" } }, result: "{main_snippet}" },
    {
      assistant: "{plan_answer}",
      alt: "{plan_alt}",
      continuation: true,
    },
    { call: { name: "write_file", args: { path: "{main_file}", content: "{new_file}" } }, result: "Wrote {main_file} ({bytes} bytes)." },
    { call: { name: "run_command", args: { command: "{verify_cmd}" } }, result: "{verify_out}" },
    { assistant: "{done_answer}", rating: "positive" },
    { user: "{followup_ask}" },
    { assistant: "{followup_answer}" },
  ],
  variants: [
    {
      repo: "notify-worker",
      feature_ask: "Add exponential backoff with jitter to the webhook dispatcher. Right now a flapping endpoint gets hammered every 5s and we trip their rate limits.",
      grep_pattern: "setInterval|retry", grep_result: "src/dispatch.js:44:    setTimeout(() => this.deliver(evt, attempt + 1), 5000);\nsrc/dispatch.js:12:  // retry forever, fixed 5s",
      main_file: "src/dispatch.js",
      main_snippet: "async deliver(evt, attempt = 0) {\n  try {\n    await post(evt.url, evt.payload);\n  } catch (err) {\n    metrics.inc('webhook_retry');\n    setTimeout(() => this.deliver(evt, attempt + 1), 5000);\n  }\n}",
      plan_answer: "The dispatcher retries on a fixed 5s timer with no cap, so a dead endpoint gets a request every 5 seconds forever. I'll switch to capped exponential backoff with full jitter:\n\n```js\nconst delay = Math.min(30 * 60_000, 5_000 * 2 ** attempt);\nconst jittered = Math.random() * delay;\n```\n\nand drop the event to a dead-letter queue after 8 attempts (~21 minutes worst case). Writing the change now.",
      plan_alt: "You could just raise the interval from 5s to 60s — one-line change:\n\n```js\nsetTimeout(() => this.deliver(evt, attempt + 1), 60000);\n```\n\nThat reduces pressure 12x and is the least invasive option.",
      new_file: "const MAX_ATTEMPTS = 8;\nconst BASE_MS = 5_000;\nconst CAP_MS = 30 * 60_000;\n\nasync deliver(evt, attempt = 0) {\n  try {\n    await post(evt.url, evt.payload);\n  } catch (err) {\n    if (attempt + 1 >= MAX_ATTEMPTS) return this.deadLetter(evt, err);\n    metrics.inc('webhook_retry');\n    const delay = Math.min(CAP_MS, BASE_MS * 2 ** attempt);\n    setTimeout(() => this.deliver(evt, attempt + 1), Math.random() * delay);\n  }\n}",
      bytes: 468, verify_cmd: "npm test -- dispatch.test.js",
      verify_out: "PASS src/dispatch.test.js\nTests: 12 passed, 12 total",
      done_answer: "Done. `deliver` now backs off exponentially (5s base, 30min cap, full jitter) and dead-letters after 8 attempts instead of retrying forever. Dispatch tests pass.\n\nWorth watching `webhook_dead_letter` volume for the first day — anything landing there was previously retrying invisibly.",
      followup_ask: "Nice. Does the dead-letter queue alert anyone, or do those just rot?",
      followup_answer: "Right now they rot — `deadLetter` writes to the `webhook_dlq` table and increments a metric, but nothing consumes it. Two cheap options:\n\n1. **Alert**: a threshold alert on `webhook_dead_letter` > 0 in 15m — five minutes of work in your Grafana config.\n2. **Replay**: a small admin endpoint that re-enqueues DLQ rows after the endpoint recovers.\n\nI'd do the alert now and the replay endpoint when someone actually needs it.",
    },
    {
      repo: "api-gateway",
      feature_ask: "We need request IDs on every log line. Incident review last night was painful — we couldn't correlate gateway logs with upstream service logs.",
      grep_pattern: "logger|correlation", grep_result: "src/middleware/log.js:8:  logger.info(`${req.method} ${req.path}`);\nsrc/upstream.js:31:    headers: buildHeaders(req),",
      main_file: "src/middleware/log.js",
      main_snippet: "export function requestLog(req, res, next) {\n  logger.info(`${req.method} ${req.path}`);\n  next();\n}",
      plan_answer: "Plan: generate a `request_id` (or honor an incoming `x-request-id`) in the logging middleware, stash it on `req`, bind it into a child logger, and forward the header upstream in `buildHeaders`. That gives you end-to-end correlation without touching every call site:\n\n```js\nreq.id = req.get('x-request-id') ?? crypto.randomUUID();\nreq.log = logger.child({ request_id: req.id });\n```\n\nApplying it to the middleware and the upstream header builder.",
      plan_alt: "Simplest thing: add a timestamp to each log line so you can line them up by time during incidents. No code structure changes needed.",
      new_file: "import crypto from 'node:crypto';\n\nexport function requestLog(req, res, next) {\n  req.id = req.get('x-request-id') ?? crypto.randomUUID();\n  req.log = logger.child({ request_id: req.id });\n  res.set('x-request-id', req.id);\n  req.log.info(`${req.method} ${req.path}`);\n  next();\n}",
      bytes: 341, verify_cmd: "npm test",
      verify_out: "PASS src/middleware/log.test.js\nPASS src/upstream.test.js\nTests: 31 passed, 31 total",
      done_answer: "Done. Every request now gets a `request_id` (incoming `x-request-id` honored, UUID otherwise), it's bound into a child logger so all lines carry it, echoed on the response, and forwarded upstream. All 31 tests pass.\n\nUpstream services that log the incoming header will now correlate for free.",
      followup_ask: "Will the id survive across our internal retries to upstreams?",
      followup_answer: "Yes — `buildHeaders` reads `req.id`, and retries reuse the same `req`, so every attempt carries the same `x-request-id`. If you want per-attempt granularity too, add an `x-attempt: n` header in the retry loop; the pair (request_id, attempt) then uniquely names each try.",
    },
  ],
};
