#!/usr/bin/env node
/**
 * Synthetic Riften Router trace corpus.
 *
 * Emits data/traces.ndjson — one router request per line, in the exact shape
 * the platform ingests. Deterministic: same seed, same corpus.
 *
 * Invariants the generator guarantees (the export engine depends on them):
 *  - Agent clients replay the full transcript: trace N's request.messages is
 *    trace N-1's messages + accepted assistant msg + tool results (+ next user msg).
 *  - A retry replays the *identical* request context as its original (retry_of),
 *    which is what makes chosen/rejected preference pairs well-formed.
 *  - Rejected answers (retried-away, continuation-rejected) never appear in
 *    later transcript history — only accepted content is replayed.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = 20260816;

/* ---------------------------------- rng ---------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const rint = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const uid = (prefix, len = 10) =>
  prefix + "_" + Array.from({ length: len }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");

/* --------------------------------- models --------------------------------- */
/* $/1M tokens. Latency: per-token ms + base overhead, provider-flavored. */

const MODELS = {
  "claude-sonnet-4-5":  { provider: "anthropic", in: 3.0,  out: 15.0, base: 620, perTok: 11.0 },
  "claude-haiku-4-5":   { provider: "anthropic", in: 1.0,  out: 5.0,  base: 380, perTok: 4.4 },
  "claude-opus-4-1":    { provider: "anthropic", in: 15.0, out: 75.0, base: 900, perTok: 16.5 },
  "gpt-5":              { provider: "openai",    in: 1.25, out: 10.0, base: 780, perTok: 12.2 },
  "gpt-5-mini":         { provider: "openai",    in: 0.25, out: 2.0,  base: 420, perTok: 5.1 },
  "gemini-2.5-pro":     { provider: "google",    in: 1.25, out: 10.0, base: 850, perTok: 10.4 },
  "gemini-2.5-flash":   { provider: "google",    in: 0.30, out: 2.5,  base: 360, perTok: 3.8 },
  "deepseek-v3-1":      { provider: "deepseek",  in: 0.27, out: 1.1,  base: 1100, perTok: 9.2 },
};
const MODEL_IDS = Object.keys(MODELS);
/* Router route preferences by workload class. */
const ROUTES = {
  coding:   ["claude-sonnet-4-5", "gpt-5", "claude-sonnet-4-5", "claude-opus-4-1", "deepseek-v3-1"],
  support:  ["gpt-5-mini", "claude-haiku-4-5", "gemini-2.5-flash", "gpt-5-mini"],
  analytics:["gpt-5", "gemini-2.5-pro", "claude-sonnet-4-5"],
  chat:     ["claude-haiku-4-5", "gpt-5-mini", "gemini-2.5-flash", "claude-sonnet-4-5"],
  docs:     ["gemini-2.5-flash", "claude-haiku-4-5", "gpt-5-mini"],
  travel:   ["gpt-5", "claude-sonnet-4-5", "gemini-2.5-pro"],
};
const FALLBACKS = {
  "claude-sonnet-4-5": "gpt-5",
  "claude-haiku-4-5": "gemini-2.5-flash",
  "claude-opus-4-1": "claude-sonnet-4-5",
  "gpt-5": "claude-sonnet-4-5",
  "gpt-5-mini": "claude-haiku-4-5",
  "gemini-2.5-pro": "gpt-5",
  "gemini-2.5-flash": "gpt-5-mini",
  "deepseek-v3-1": "gpt-5-mini",
};

/* ------------------------------ token machinery ---------------------------- */

const tokEst = (s) => Math.max(1, Math.round(s.length / 3.9));
function msgTokens(m) {
  let t = 4; // role + framing overhead
  if (typeof m.content === "string") t += tokEst(m.content);
  if (m.tool_calls) for (const c of m.tool_calls) t += 8 + tokEst(c.function.name) + tokEst(c.function.arguments);
  return t;
}
function promptTokens(system, messages, tools) {
  let t = 3 + (system ? tokEst(system) : 0);
  for (const m of messages) t += msgTokens(m);
  if (tools) for (const tl of tools) t += 12 + tokEst(JSON.stringify(tl.function.parameters)) + tokEst(tl.function.description || "");
  return t;
}
const round6 = (x) => Math.round(x * 1e6) / 1e6;

/* ------------------------------- tool defs -------------------------------- */

const T = {
  read_file: { name: "read_file", description: "Read a file from the repository.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  write_file: { name: "write_file", description: "Create or overwrite a file with the given content.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  run_command: { name: "run_command", description: "Run a shell command in the project root and return stdout/stderr.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  grep_repo: { name: "grep_repo", description: "Search the repository for a pattern.", parameters: { type: "object", properties: { pattern: { type: "string" }, glob: { type: "string" } }, required: ["pattern"] } },
  lookup_order: { name: "lookup_order", description: "Fetch an order by id from the commerce backend.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
  issue_refund: { name: "issue_refund", description: "Issue a full or partial refund for an order.", parameters: { type: "object", properties: { order_id: { type: "string" }, amount_usd: { type: "number" }, reason: { type: "string" } }, required: ["order_id", "amount_usd", "reason"] } },
  send_email: { name: "send_email", description: "Send a transactional email to the customer on file.", parameters: { type: "object", properties: { order_id: { type: "string" }, template: { type: "string" } }, required: ["order_id", "template"] } },
  run_sql: { name: "run_sql", description: "Execute a read-only SQL query against the analytics warehouse.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  search_docs: { name: "search_docs", description: "Semantic search over the product documentation corpus.", parameters: { type: "object", properties: { query: { type: "string" }, top_k: { type: "number" } }, required: ["query"] } },
  search_flights: { name: "search_flights", description: "Search airline inventory for one-way or round-trip flights.", parameters: { type: "object", properties: { origin: { type: "string" }, destination: { type: "string" }, depart: { type: "string" }, return: { type: "string" } }, required: ["origin", "destination", "depart"] } },
  search_hotels: { name: "search_hotels", description: "Search hotel availability for a city and date range.", parameters: { type: "object", properties: { city: { type: "string" }, checkin: { type: "string" }, checkout: { type: "string" }, max_usd: { type: "number" } }, required: ["city", "checkin", "checkout"] } },
};
const fn = (t) => ({ type: "function", function: t });

/* ------------------------------ scenario library --------------------------- */
/*
 * A scenario is a session script: system prompt, tools, and a list of steps.
 * Steps:
 *   { user: "..." }                              -> new user turn
 *   { assistant: "..." , alt?: "...",            -> model answers (alt = weak
 *     rating?: hint }                               variant used by retrials)
 *   { call: {name, args}, result: "...",         -> model emits tool call, tool
 *     error?: "...", recover?: "..." }              returns result (or error;
 *                                                    recover = follow-up call args)
 * Variants substitute {placeholders} in all strings.
 */

const SCENARIOS = [
  /* ---- coding agent: failing test fix ---- */
  {
    key: "coding-test-fix",
    route: "coding",
    system:
      "You are a coding agent operating on the {repo} repository. You have file and shell tools. Make focused changes, run the test suite to verify, and explain what you changed. Never invent file contents — read before you write.",
    tools: [T.read_file, T.write_file, T.run_command, T.grep_repo],
    temperature: 0.2,
    steps: [
      { user: "CI is red on main. `{test_cmd}` fails with:\n\n```\nFAIL {test_file}\n  ● {suite} › {case}\n  expected {expected}, received {received}\n```\n\nCan you fix it?" },
      { call: { name: "read_file", args: { path: "{src_file}" } }, result: "{src_snippet}" },
      { call: { name: "run_command", args: { command: "{test_cmd}" } }, result: "Command failed with exit code 1:\n{test_error}", error: "Command failed with exit code 1:\n{test_error}", recover: { name: "read_file", args: { path: "{test_file}" } }, recoverResult: "{test_snippet}" },
      {
        assistant:
          "Found it. `{fn_name}` in `{src_file}` {bug_desc}. The test is right — the implementation regressed in the last refactor.\n\nI'll make the minimal fix:\n\n```{lang}\n{fix_snippet}\n```\n\nApplying it now and re-running the suite.",
        alt: "The test seems flaky. I'd suggest adding a retry around the assertion or marking it `.skip` until the team can look at it:\n\n```{lang}\n{skip_snippet}\n```",
        continuation: true,
      },
      { call: { name: "write_file", args: { path: "{src_file}", content: "{fixed_file}" } }, result: "Wrote {src_file} ({bytes} bytes)." },
      { call: { name: "run_command", args: { command: "{test_cmd}" } }, result: "PASS {test_file}\nTests: {n_tests} passed, {n_tests} total\nTime: {test_time}s" },
      {
        assistant:
          "Fixed. `{fn_name}` {fix_desc}. The full suite passes ({n_tests}/{n_tests}).\n\nOne-line summary for the changelog: \"{changelog}\"",
        rating: "positive",
      },
    ],
    variants: [
      {
        repo: "checkout-service", test_cmd: "npm test -- cart.test.js", test_file: "src/cart/cart.test.js",
        suite: "applyDiscount", case: "stacks percentage after fixed coupons", expected: "84.15", received: "83.30",
        src_file: "src/cart/discounts.js", lang: "js",
        src_snippet: "export function applyDiscount(subtotal, coupons) {\n  let total = subtotal;\n  for (const c of coupons.sort(byPriority)) {\n    if (c.kind === 'fixed') total -= c.amount;\n    if (c.kind === 'percent') total = subtotal * (1 - c.rate); // <- uses subtotal\n  }\n  return round2(total);\n}",
        test_error: "expected 84.15, received 83.30\n  at Object.<anonymous> (src/cart/cart.test.js:41:29)",
        test_snippet: "it('stacks percentage after fixed coupons', () => {\n  const coupons = [fixed(1), percent(0.15)];\n  expect(applyDiscount(100, coupons)).toBe(84.15);\n});",
        fn_name: "applyDiscount", bug_desc: "applies percentage coupons to the original subtotal instead of the running total, so fixed coupons applied earlier are ignored",
        fix_snippet: "-    if (c.kind === 'percent') total = subtotal * (1 - c.rate);\n+    if (c.kind === 'percent') total = total * (1 - c.rate);",
        skip_snippet: "it.skip('stacks percentage after fixed coupons', () => { /* flaky? */ });",
        fixed_file: "export function applyDiscount(subtotal, coupons) {\n  let total = subtotal;\n  for (const c of coupons.sort(byPriority)) {\n    if (c.kind === 'fixed') total -= c.amount;\n    if (c.kind === 'percent') total = total * (1 - c.rate);\n  }\n  return round2(total);\n}",
        bytes: 312, n_tests: 47, test_time: "3.8",
        fix_desc: "now applies percentage discounts to the running total, so stacking with fixed coupons is order-correct",
        changelog: "fix(cart): percentage coupons now stack on the discounted total",
      },
      {
        repo: "ingest-pipeline", test_cmd: "pytest tests/test_dedupe.py -q", test_file: "tests/test_dedupe.py",
        suite: "test_dedupe", case: "keeps_latest_by_updated_at", expected: "3 rows", received: "4 rows",
        src_file: "pipeline/dedupe.py", lang: "python",
        src_snippet: "def dedupe(rows):\n    seen = {}\n    for r in rows:\n        key = r[\"id\"]\n        if key not in seen:\n            seen[key] = r  # first wins — wrong for late updates\n    return list(seen.values())",
        test_error: "assert len(result) == 3\nE   assert 4 == 3",
        test_snippet: "def test_keeps_latest_by_updated_at():\n    rows = load_fixture(\"updates.json\")\n    assert len(dedupe(rows)) == 3\n    assert dedupe(rows)[0][\"updated_at\"] == \"2026-07-02\"",
        fn_name: "dedupe", bug_desc: "keeps the *first* row per id, but the contract is last-write-wins by `updated_at`",
        fix_snippet: "-        if key not in seen:\n-            seen[key] = r\n+        prev = seen.get(key)\n+        if prev is None or r[\"updated_at\"] > prev[\"updated_at\"]:\n+            seen[key] = r",
        skip_snippet: "@pytest.mark.skip(reason=\"flaky fixture ordering\")\ndef test_keeps_latest_by_updated_at(): ...",
        fixed_file: "def dedupe(rows):\n    seen = {}\n    for r in rows:\n        key = r[\"id\"]\n        prev = seen.get(key)\n        if prev is None or r[\"updated_at\"] > prev[\"updated_at\"]:\n            seen[key] = r\n    return list(seen.values())",
        bytes: 289, n_tests: 23, test_time: "1.2",
        fix_desc: "now keeps the row with the greatest `updated_at` per id (last-write-wins)",
        changelog: "fix(dedupe): last-write-wins by updated_at instead of first-seen",
      },
    ],
  },

  /* ---- coding agent: small feature ---- */
  {
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
  },

  /* ---- customer support with tools ---- */
  {
    key: "support-refund",
    route: "support",
    system:
      "You are the support agent for Lumen Audio's online store. Use tools to look up real order state before promising anything. Policy: full refund within 30 days of delivery; partial (80%) refund for opened items 31-60 days; nothing after 60 days without a manager escalation. Be warm and concise; confirm irreversible actions before running them.",
    tools: [T.lookup_order, T.issue_refund, T.send_email],
    temperature: 0.6,
    steps: [
      { user: "{opening}" },
      { call: { name: "lookup_order", args: { order_id: "{order_id}" } }, result: "{order_json}", error: "{lookup_error}", recover: { name: "lookup_order", args: { order_id: "{order_id_fixed}" } }, recoverResult: "{order_json}" },
      { assistant: "{eligibility_answer}", alt: "{eligibility_alt}" },
      { user: "{confirm_msg}" },
      { call: { name: "issue_refund", args: { order_id: "{order_id_fixed}", amount_usd: "{refund_amount}", reason: "{refund_reason}" } }, result: "{refund_result}" },
      { call: { name: "send_email", args: { order_id: "{order_id_fixed}", template: "refund_confirmation" } }, result: "{email_result}" },
      { assistant: "{closing_answer}", rating: "positive" },
    ],
    variants: [
      {
        opening: "Hi — I bought the Arc 2 headphones about three weeks ago and the right driver started crackling at low volume. Order LU-88412. Can I get my money back?",
        order_id: "LU-88412", order_id_fixed: "LU-88412",
        lookup_error: null,
        order_json: "{\"order_id\":\"LU-88412\",\"item\":\"Arc 2 Wireless Headphones\",\"price_usd\":249.00,\"delivered\":\"2026-07-26\",\"status\":\"delivered\",\"customer\":\"m.okafor@gmail.com\"}",
        eligibility_answer: "Thanks for the order number — I can see your Arc 2s were delivered on July 26th, so you're at 21 days, comfortably inside our 30-day full-refund window. A crackling driver is a defect on us.\n\nI can refund the full **$249.00** to your original payment method (3-5 business days), and you'll get a prepaid return label by email. Want me to go ahead?",
        eligibility_alt: "You're within the window so a refund should be possible. Do you have the receipt? I may also need the serial number from the box before I can process anything.",
        confirm_msg: "Yes please, full refund. The label by email works.",
        refund_amount: 249.0, refund_reason: "defective unit - right driver crackling, within 30-day window",
        refund_result: "{\"refund_id\":\"rf_9k2m4\",\"status\":\"processed\",\"amount_usd\":249.00,\"eta_days\":\"3-5\"}",
        email_result: "{\"sent\":true,\"to\":\"m.okafor@gmail.com\",\"template\":\"refund_confirmation\"}",
        closing_answer: "All done! Your $249.00 refund is processed (refund id rf_9k2m4) and lands in 3-5 business days. The confirmation email with the prepaid return label just went out to m.okafor@gmail.com — drop the headphones at any carrier point within 14 days.\n\nSorry the Arc 2s let you down. Anything else I can help with?",
      },
      {
        opening: "Order LU-73301 — the Slate desk speaker I got in June just isn't for me, honestly. Too bassy for a small room. What are my options?",
        order_id: "LU-7331O", order_id_fixed: "LU-73301",
        lookup_error: "ORDER_NOT_FOUND: no order matches id 'LU-7331O'",
        order_json: "{\"order_id\":\"LU-73301\",\"item\":\"Slate Desk Speaker\",\"price_usd\":179.00,\"delivered\":\"2026-06-29\",\"status\":\"delivered\",\"customer\":\"j.reyes@proton.me\"}",
        eligibility_answer: "Found it (the last character is a 1, not an O — happens all the time). Your Slate was delivered June 29th, which puts you at 48 days: past the 30-day full-refund window, but inside the 31-60 day partial window since it's opened.\n\nThat means I can offer **$143.20** back (80% of $179.00). Alternatively I can do a full-value store credit if you'd rather try the smaller Slate Mini. Which sounds better?",
        eligibility_alt: "I couldn't find that exact order, but based on a June delivery you'd likely be past the full refund window. You could try contacting billing directly, or check whether the retailer you bought from has its own policy.",
        confirm_msg: "The 80% works, let's do that.",
        refund_amount: 143.2, refund_reason: "customer preference, opened item in 31-60 day partial window",
        refund_result: "{\"refund_id\":\"rf_2x8p1\",\"status\":\"processed\",\"amount_usd\":143.20,\"eta_days\":\"3-5\"}",
        email_result: "{\"sent\":true,\"to\":\"j.reyes@proton.me\",\"template\":\"refund_confirmation\"}",
        closing_answer: "Done — $143.20 is on its way back to your card (refund id rf_2x8p1, 3-5 business days), and the confirmation with a return label is in your inbox.\n\nFor a small room, honestly, the Slate Mini or the Arc 2 in wired mode are the moves. Happy listening!",
      },
    ],
  },

  /* ---- analytics: SQL over warehouse ---- */
  {
    key: "analytics-sql",
    route: "analytics",
    system:
      "You are an analytics copilot with read-only SQL access to the {org} warehouse (Postgres dialect). Prefer CTEs over subqueries, always LIMIT exploratory queries, and state assumptions about schema explicitly. Numbers in answers must come from query results, never estimates.",
    tools: [T.run_sql],
    temperature: 0.3,
    steps: [
      { user: "{question}" },
      { call: { name: "run_sql", args: { query: "{q1}" } }, error: "{q1_error}", result: "{q1_result}", recover: { name: "run_sql", args: { query: "{q1_fixed}" } }, recoverResult: "{q1_result}" },
      { assistant: "{answer1}", alt: "{answer1_alt}" },
      { user: "{drill_question}" },
      { call: { name: "run_sql", args: { query: "{q2}" } }, result: "{q2_result}" },
      { assistant: "{answer2}", rating: "positive" },
    ],
    variants: [
      {
        org: "meridian",
        question: "What's our trial-to-paid conversion rate by signup month for this year? Marketing claims it cratered in Q2.",
        q1: "WITH cohorts AS (\n  SELECT date_trunc('month', trial_started_at) AS signup_month,\n         count(*) AS trials,\n         count(*) FILTER (WHERE converted_at IS NOT NULL) AS conversions\n  FROM accounts\n  WHERE trial_started_at >= '2026-01-01'\n  GROUP BY 1\n)\nSELECT signup_month, trials, conversions,\n       round(100.0 * conversions / trials, 1) AS conv_pct\nFROM cohorts ORDER BY signup_month;",
        q1_error: "ERROR: column \"converted_at\" does not exist\nHINT: Perhaps you meant to reference the column \"accounts.paid_converted_at\".",
        q1_fixed: "WITH cohorts AS (\n  SELECT date_trunc('month', trial_started_at) AS signup_month,\n         count(*) AS trials,\n         count(*) FILTER (WHERE paid_converted_at IS NOT NULL) AS conversions\n  FROM accounts\n  WHERE trial_started_at >= '2026-01-01'\n  GROUP BY 1\n)\nSELECT signup_month, trials, conversions,\n       round(100.0 * conversions / trials, 1) AS conv_pct\nFROM cohorts ORDER BY signup_month;",
        q1_result: "signup_month | trials | conversions | conv_pct\n2026-01-01   |  1843  |  312        | 16.9\n2026-02-01   |  1911  |  334        | 17.5\n2026-03-01   |  2204  |  391        | 17.7\n2026-04-01   |  2380  |  296        | 12.4\n2026-05-01   |  2511  |  289        | 11.5\n2026-06-01   |  2456  |  301        | 12.3\n(6 rows)",
        answer1: "Marketing is right. Conversion held at **17-18%** through Q1, then dropped to **12.4%** in April and has stayed near **11.5-12.3%** since — roughly a 5-point (30% relative) decline starting exactly in April.\n\n| Month | Trials | Conversions | Rate |\n|---|---|---|---|\n| Jan | 1,843 | 312 | 16.9% |\n| Feb | 1,911 | 334 | 17.5% |\n| Mar | 2,204 | 391 | 17.7% |\n| Apr | 2,380 | 296 | 12.4% |\n| May | 2,511 | 289 | 11.5% |\n| Jun | 2,456 | 301 | 12.3% |\n\nNote trials *grew* ~12% over the same period — this smells like a channel-mix change (more low-intent signups), not a product problem. Want me to split by acquisition channel?",
        answer1_alt: "The conversion rate this year averages around 14-15%, which is in the normal range for B2B SaaS. Q2 might look lower but monthly noise of a few points is expected; I wouldn't read too much into it without more data.",
        drill_question: "Yes — split April onward by channel.",
        q2: "SELECT channel,\n       count(*) AS trials,\n       count(*) FILTER (WHERE paid_converted_at IS NOT NULL) AS conversions,\n       round(100.0 * count(*) FILTER (WHERE paid_converted_at IS NOT NULL) / count(*), 1) AS conv_pct\nFROM accounts\nWHERE trial_started_at >= '2026-04-01'\nGROUP BY channel ORDER BY trials DESC;",
        q2_result: "channel        | trials | conversions | conv_pct\npaid_social    |  2913  |  187        | 6.4\norganic_search |  2101  |  384        | 18.3\nreferral       |  1266  |  231        | 18.2\npartner        |  1067  |  84         | 7.9\n(4 rows)",
        answer2: "There's your answer. Since April, **paid_social** delivered 2,913 trials — the biggest channel — converting at just **6.4%**, versus **18.3%** organic and **18.2%** referral (both unchanged from Q1 levels). The partner channel is also weak at 7.9%.\n\nThe Q2 \"crater\" is entirely channel mix: paid social volume roughly tripled while converting at a third of the baseline rate. Product conversion is fine; the paid-social targeting (or the landing-page promise it makes) is the thing to fix.",
      },
      {
        org: "meridian",
        question: "Which of our API endpoints got slower after the Aug 4 deploy? p95, before/after.",
        q1: "SELECT endpoint,\n       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)\n         FILTER (WHERE ts < '2026-08-04') AS p95_before,\n       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)\n         FILTER (WHERE ts >= '2026-08-04') AS p95_after\nFROM request_logs\nWHERE ts BETWEEN '2026-07-28' AND '2026-08-11'\nGROUP BY endpoint\nORDER BY p95_after - p95_before DESC\nLIMIT 10;",
        q1_error: null,
        q1_fixed: null,
        q1_result: "endpoint             | p95_before | p95_after\nPOST /v1/search      |  412       |  1893\nGET /v1/projects     |  188       |  201\nPOST /v1/completions |  902       |  921\nGET /v1/usage        |  95        |  97\nPOST /v1/files       |  341       |  339\n(5 rows)",
        answer1: "One endpoint regressed, and badly: **POST /v1/search** went from **412ms → 1,893ms p95** (4.6x) after the Aug 4 deploy. Everything else moved within noise (±13ms).\n\nGiven it's isolated to search, the likely suspects in that deploy are the query planner change or a lost index. Want me to check whether the slowdown correlates with result-set size or is flat across all search requests?",
        answer1_alt: "Several endpoints show some slowdown after Aug 4. Performance can vary due to load, time of day, and caching, so I'd recommend monitoring for another week before drawing conclusions.",
        drill_question: "Check if it's flat or correlates with result size.",
        q2: "SELECT width_bucket(result_count, 0, 500, 5) AS bucket,\n       min(result_count) AS min_results, max(result_count) AS max_results,\n       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95\nFROM request_logs\nWHERE endpoint = 'POST /v1/search' AND ts >= '2026-08-04'\nGROUP BY 1 ORDER BY 1;",
        q2_result: "bucket | min_results | max_results | p95\n1      | 0           | 98          | 1841\n2      | 101         | 197         | 1876\n3      | 204         | 296         | 1903\n4      | 302         | 388         | 1920\n5      | 411         | 500         | 1944\n(5 rows)",
        answer2: "It's **flat** — p95 sits at 1.84-1.94s whether the query returns 0 results or 500. A regression proportional to result size would slope upward; this doesn't.\n\nThat rules out serialization/payload cost and points at fixed per-request overhead added on Aug 4: most likely the reranker model call that deploy enabled, or a lost index forcing a full scan even for empty results (an empty-result full scan still reads the whole table). I'd check `EXPLAIN ANALYZE` on a zero-hit query first — if it's the index, that's a one-line fix.",
      },
    ],
  },

  /* ---- plain chat, no tools ---- */
  {
    key: "chat-writing",
    route: "chat",
    system: "You are a helpful assistant.",
    tools: null,
    temperature: 0.8,
    steps: [
      { user: "{ask}" },
      { assistant: "{answer}", alt: "{answer_alt}" },
      { user: "{revise}" },
      { assistant: "{answer2}", rating: "positive" },
    ],
    variants: [
      {
        ask: "Write a short email to my landlord asking them to fix the bathroom exhaust fan. It's been broken for three weeks and I've mentioned it twice in person. Polite but firm, and mention mold risk.",
        answer: "Subject: Bathroom exhaust fan — third request, repair needed this week\n\nHi Daniel,\n\nFollowing up in writing on the bathroom exhaust fan, which has now been out for three weeks. I've mentioned it in person twice (July 28 and Aug 6) but haven't heard back on a repair date.\n\nWithout ventilation the bathroom isn't drying out, and I'm starting to see condensation lingering on the ceiling — I want to flag mold risk before it becomes a bigger (and more expensive) problem for both of us.\n\nCould you confirm by Friday when a repair is scheduled? Happy to coordinate access any weekday after 5pm.\n\nThanks,\nSam",
        answer_alt: "Subject: Fan\n\nHi, the fan in my bathroom is still broken. Please fix it as soon as possible, it could cause mold which would be a violation of the habitability code and I may have to consider further action.\n\nRegards,\nSam",
        revise: "Good, but drop the exact dates (I don't remember them exactly) and make the deadline gentler.",
        answer2: "Subject: Bathroom exhaust fan — following up in writing\n\nHi Daniel,\n\nFollowing up on the bathroom exhaust fan, which has now been out for about three weeks. I've mentioned it in person a couple of times but we haven't landed on a repair date yet.\n\nWithout ventilation the bathroom isn't drying out between showers, and condensation is starting to linger on the ceiling — I'd love to get ahead of any mold risk before it becomes a bigger problem for both of us.\n\nCould you let me know this week when a repair could be scheduled? Happy to coordinate access any weekday after 5pm.\n\nThanks,\nSam",
      },
      {
        ask: "Explain to a non-technical exec why we can't just 'add more servers' to fix our database being slow. One paragraph, no jargon.",
        answer: "Adding servers helps when the problem is too many customers waiting in line — you open more checkout lanes. But our database is slow for a different reason: it's like one filing cabinet that every lane has to walk back to for every order. Adding lanes doesn't speed up the cabinet; it actually makes the crowd around it worse. The real fixes are making fewer trips to the cabinet (smarter queries), keeping copies of the most-used files at each lane (caching), or reorganizing the cabinet so lookups are faster (indexing). Those are engineering changes, not purchasing decisions — cheaper than servers, but they take focused time from the team.",
        answer_alt: "Because the database is a bottleneck and adding servers only scales the stateless tier. The database has vertical scaling limits and adding read replicas introduces replication lag and consistency tradeoffs, while sharding requires application-level changes. So horizontal scaling isn't directly applicable to the primary.",
        revise: "Love the filing cabinet metaphor. Can you end it with a one-line ask for two engineer-weeks?",
        answer2: "Adding servers helps when the problem is too many customers waiting in line — you open more checkout lanes. But our database is slow for a different reason: it's like one filing cabinet that every lane has to walk back to for every order. Adding lanes doesn't speed up the cabinet; it actually makes the crowd around it worse. The real fixes are making fewer trips to the cabinet (smarter queries), keeping copies of the most-used files at each lane (caching), or reorganizing the cabinet so lookups are faster (indexing). Those are engineering changes, not purchasing decisions — cheaper than servers, but they take focused time. **The ask: two engineer-weeks now to fix the cabinet, instead of a five-figure server bill that won't.**",
      },
      {
        ask: "I have chicken thighs, a lemon, feta, orzo, and a sad-looking zucchini. 30 minutes. What do I make?",
        answer: "One-pan lemon chicken orzo — perfect for exactly that inventory.\n\n1. **Sear** (8 min): Salt the thighs, sear skin-side down in an oven-safe pan until deep golden. Flip, 2 min, remove. Don't wash the pan — that fond is the flavor.\n2. **Toast** (2 min): Half-moon the zucchini, brown it in the chicken fat, then stir in the orzo (about 1 cup) for 30 seconds.\n3. **Simmer** (12 min): Add 2 cups of water or stock, juice of half the lemon, scrape the bottom. Nestle the thighs back on top, lid on, medium-low until the orzo is tender.\n4. **Finish**: Off heat — crumble feta over, zest the lemon on top, squeeze the rest of the juice, black pepper.\n\nThe orzo drinks the chicken juices and the feta half-melts into a sauce. The sad zucchini will not be recognized.",
        answer_alt: "You could make a chicken and orzo dish. Cook the chicken, boil the orzo separately according to package directions, sauté the zucchini, and combine everything with lemon juice and feta. Season to taste.",
        revise: "No stock, and my partner hates zucchini skin. Adjust?",
        answer2: "Easy on both counts:\n\n- **No stock**: water works fine here — the seared-chicken fond plus the rendered fat basically makes stock in the pan. Add an extra pinch of salt and, if you have it, a knob of butter with the water.\n- **Zucchini skin**: peel it before slicing (a Y-peeler takes 20 seconds), and cut slightly thicker half-moons so the peeled flesh doesn't go mushy. Browning them well in step 2 also builds enough texture that the skin won't be missed.\n\nEverything else — timing, order, the feta finish — stays exactly the same.",
      },
    ],
  },

  /* ---- docs QA (RAG) ---- */
  {
    key: "docs-qa",
    route: "docs",
    system:
      "You answer developer questions about the Meridian API using the search_docs tool. Ground every claim in retrieved passages and cite the doc slug like [rate-limits]. If the docs don't cover it, say so — never guess.",
    tools: [T.search_docs],
    temperature: 0.2,
    steps: [
      { user: "{q}" },
      { call: { name: "search_docs", args: { query: "{search_q}", top_k: 4 } }, result: "{passages}" },
      { assistant: "{answer}", alt: "{answer_alt}", rating: "positive" },
    ],
    variants: [
      {
        q: "Do webhook deliveries retry, and can I make them idempotent on my side?",
        search_q: "webhook delivery retries idempotency",
        passages: "[webhooks-retries] Failed deliveries (non-2xx or >10s timeout) retry on an exponential schedule: 1m, 5m, 30m, 2h, 8h, then dropped. Each attempt is logged in the dashboard.\n[webhooks-headers] Every delivery includes `X-Meridian-Delivery-Id` (stable across retries of the same event) and `X-Meridian-Signature`.\n[webhooks-ordering] Delivery order is not guaranteed across events; consumers must not assume sequence.\n[events-schema] Event payloads carry `event.id`, unique per event.",
        answer: "Yes to both.\n\n**Retries**: a delivery that returns non-2xx or takes >10s retries on an exponential schedule — 1m, 5m, 30m, 2h, 8h — then is dropped. Each attempt shows in the dashboard [webhooks-retries].\n\n**Idempotency**: dedupe on `X-Meridian-Delivery-Id`, which stays stable across retries of the same event [webhooks-headers] — or on `event.id` in the payload if you'd rather key on the event itself [events-schema]. Store processed ids and skip repeats.\n\nOne caveat worth designing for: ordering across *different* events is not guaranteed, so idempotency alone isn't enough if your handler assumes sequence [webhooks-ordering].",
        answer_alt: "Webhooks generally retry a few times if delivery fails, which is standard practice. For idempotency you can usually use some kind of unique ID in the request — check the headers your provider sends. Most webhook systems include one.",
      },
      {
        q: "What happens to in-flight requests when I rotate an API key? Is there a grace period?",
        search_q: "API key rotation grace period revocation",
        passages: "[auth-rotation] Rotating a key creates a new secret immediately; the previous secret remains valid for 24 hours by default (configurable 0-72h via `grace_period_hours`).\n[auth-revoke] Revoking (as opposed to rotating) invalidates the secret immediately; in-flight requests already authenticated are allowed to complete.\n[auth-audit] Key events (created, rotated, revoked, expired) appear in the audit log within 60 seconds.",
        answer: "There's a grace period for **rotation**, not for revocation:\n\n- **Rotate**: the new secret works immediately and the old one keeps working for 24 hours by default — tunable from 0 to 72 hours with `grace_period_hours` [auth-rotation]. So a rolling deploy can swap secrets with zero downtime.\n- **Revoke**: immediate invalidation. Requests already authenticated and in flight complete; new ones fail [auth-revoke].\n\nBoth actions land in the audit log within a minute if you need to verify [auth-audit].",
        answer_alt: "When you rotate a key, there's typically a transition window where both keys work so your services don't break. Check your dashboard settings for the exact duration — it's usually configurable.",
      },
    ],
  },

  /* ---- travel agent ---- */
  {
    key: "travel-plan",
    route: "travel",
    system:
      "You are a travel booking assistant with flight and hotel search tools. Always search before quoting prices — never invent fares. Present at most 3 options, lead with the best value, and state total trip cost. Prices from tools are final.",
    tools: [T.search_flights, T.search_hotels],
    temperature: 0.5,
    steps: [
      { user: "{ask}" },
      { call: { name: "search_flights", args: { origin: "{origin}", destination: "{dest}", depart: "{depart}", return: "{ret}" } }, result: "{flights}" },
      { call: { name: "search_hotels", args: { city: "{city}", checkin: "{depart}", checkout: "{ret}", max_usd: "{hotel_cap}" } }, result: "{hotels}" },
      { assistant: "{answer}", alt: "{answer_alt}", continuation: true },
      { user: "{tweak}" },
      { call: { name: "search_hotels", args: { city: "{city}", checkin: "{depart}", checkout: "{ret}", max_usd: "{hotel_cap2}" } }, result: "{hotels2}" },
      { assistant: "{answer2}", rating: "positive" },
    ],
    variants: [
      {
        ask: "Long weekend in Lisbon for two, flying out of Boston Oct 9-13. Keep the whole thing under $2500 if you can.",
        origin: "BOS", dest: "LIS", depart: "2026-10-09", ret: "2026-10-13", city: "Lisbon", hotel_cap: 220,
        flights: "[{\"carrier\":\"TAP\",\"flight\":\"TP218\",\"depart\":\"2026-10-09 21:55\",\"return\":\"2026-10-13 12:40\",\"nonstop\":true,\"per_person_usd\":648},{\"carrier\":\"Azores/SATA\",\"flight\":\"S4 224\",\"depart\":\"2026-10-09 17:30\",\"return\":\"2026-10-13 15:10\",\"nonstop\":false,\"stops\":\"PDL 1h50m\",\"per_person_usd\":511},{\"carrier\":\"United\",\"flight\":\"UA88→UA967\",\"depart\":\"2026-10-09 16:10\",\"return\":\"2026-10-13 09:00\",\"nonstop\":false,\"stops\":\"EWR 2h15m\",\"per_person_usd\":574}]",
        hotels: "[{\"name\":\"Hotel da Baixa\",\"area\":\"Baixa\",\"rating\":9.1,\"per_night_usd\":198,\"breakfast\":true},{\"name\":\"Lisboa Pessoa\",\"area\":\"Chiado\",\"rating\":8.9,\"per_night_usd\":176,\"breakfast\":false},{\"name\":\"Browns Central\",\"area\":\"Baixa\",\"rating\":8.6,\"per_night_usd\":149,\"breakfast\":true}]",
        answer: "Comes in well under budget. Best-value combination:\n\n**Flights — TAP nonstop, $1,296 for two.** TP218 out Oct 9 at 9:55pm (overnight, land mid-morning), return Oct 13 at 12:40pm. The Azores option saves $274 total but costs you 4+ hours each way — not worth it for a 4-day trip.\n\n**Hotel — Browns Central, $596 for 4 nights.** 8.6-rated, in Baixa so you're walking distance to everything, breakfast included ($149/night).\n\n**Total: $1,892** — about $600 under your cap. If you want to spend some of that headroom, Hotel da Baixa (9.1, also with breakfast) brings the total to $2,088 and is the best hotel in the search. Want me to hold either?",
        answer_alt: "Lisbon in October is lovely. Flights from Boston typically run $500-700 per person and decent central hotels around $150-200 a night, so a long weekend for two should land around $2,300-2,600 — right at your budget. Would you like me to search specific dates?",
        tweak: "Let's splurge a bit — anything with a rooftop pool under $300/night?",
        hotel_cap2: 300,
        hotels2: "[{\"name\":\"Memmo Príncipe Real\",\"area\":\"Príncipe Real\",\"rating\":9.3,\"per_night_usd\":289,\"breakfast\":true,\"pool\":\"rooftop\"},{\"name\":\"EPIC SANA Marquês\",\"area\":\"Marquês de Pombal\",\"rating\":8.8,\"per_night_usd\":244,\"breakfast\":true,\"pool\":\"rooftop\"},{\"name\":\"Hotel Mundial\",\"area\":\"Baixa\",\"rating\":8.2,\"per_night_usd\":205,\"breakfast\":false,\"pool\":\"rooftop\"}]",
        answer2: "Two great rooftop-pool options under $300:\n\n1. **Memmo Príncipe Real — $289/night** ($1,156 for 4 nights). 9.3 rating, breakfast included, and the rooftop looks over the whole city down to the river. Príncipe Real is the best neighborhood in Lisbon for a relaxed trip: 10 minutes' walk to Chiado, surrounded by the good restaurants.\n2. **EPIC SANA Marquês — $244/night** ($976). Bigger, more polished-corporate, proper heated rooftop pool.\n\nWith the TAP flights, Memmo puts the trip at **$2,452** — still under $2,500. That's the one I'd book. Shall I hold it?",
      },
    ],
  },
];

/* ------------------------- trace assembly machinery ------------------------ */

function fill(str, vars) {
  if (typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}
function fillArgs(args, vars) {
  const out = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === "string" ? fill(v, vars) : v;
  return out;
}

let clock = Date.UTC(2026, 6, 14, 6, 12, 0); // Jul 14 2026 — corpus spans ~3 weeks
function nextSessionStart() {
  clock += rint(45, 590) * 60_000 + rint(0, 45_000);
  return clock;
}

const traces = [];

function computeLatency(model, completionTokens, opts = {}) {
  const m = MODELS[model];
  const mult = 0.82 + rand() * 0.5 + (chance(0.06) ? rand() * 1.6 : 0); // long tail
  let ms = m.base + completionTokens * m.perTok * mult;
  if (opts.failFast) ms = rint(120, 900);
  if (opts.slowFail) ms = rint(8_000, 30_000);
  return Math.round(ms);
}

function makeTrace({ session, turn, model, system, messages, tools, temperature, status, error, responseMsg, finishReason, truncated, feedback, retryOf, ts, tags }) {
  const m = MODELS[model];
  const pt = promptTokens(system, messages, tools);
  let usage = null, cost = null, latency;
  if (status === 200 && responseMsg) {
    const ct = msgTokens(responseMsg);
    usage = { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct };
    cost = round6((pt * m.in + ct * m.out) / 1e6);
    latency = computeLatency(model, ct);
  } else {
    latency = computeLatency(model, 0, { failFast: status === 429 || status === 401, slowFail: status === 500 || status === 503 || status === 529 });
    if (status !== 200) { usage = null; cost = null; }
  }
  const trace = {
    id: uid("tr"),
    session_id: session.id,
    turn,
    ts: new Date(ts).toISOString(),
    model,
    provider: m.provider,
    status,
    error: error || null,
    request: {
      system,
      messages,
      tools: tools || null,
      temperature,
      max_tokens: session.maxTokens,
    },
    response: responseMsg ? { message: responseMsg, finish_reason: finishReason ?? "stop" } : null,
    usage,
    cost_usd: cost,
    latency_ms: latency,
    truncated: !!truncated,
    feedback: {
      rating: feedback?.rating ?? null,
      retry_of: retryOf ?? null,
      continuation: feedback?.continuation ?? null,
    },
    client: session.client,
    tags: tags || session.tags,
  };
  traces.push(trace);
  return trace;
}

const truncate = (s, frac) => {
  const cut = Math.max(40, Math.floor(s.length * frac));
  return s.slice(0, cut).replace(/\s+\S*$/, "") + " —";
};

/*
 * Build one session from a scenario+variant with an event plan.
 * plan: {
 *   infraRetryAt: stepIdx|null,      — provider failure then successful retry
 *   qualityRetryAt: stepIdx|null,    — weak answer, user regenerates (pref pair)
 *   contRejectAt: stepIdx|null,      — continuation rejected, re-ask accepted (pref pair)
 *   truncateAt: stepIdx|null,        — length-truncated final answer, session ends
 *   streamCutAt: stepIdx|null,       — mid-stream disconnect, then user retried
 *   abandonAt: stepIdx|null,         — hard failure, no retry, session dies
 *   useToolError: bool               — take the scenario's error branch on tool steps
 * }
 */
function buildSession(scenario, variant, plan) {
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

  let ts = nextSessionStart();
  let turn = 0;
  const history = []; // replayed transcript
  let assistantStepIdx = -1; // count of assistant-response steps seen (for event targeting)

  const stepDelay = () => rint(1_500, 18_000);
  const userDelay = () => rint(8_000, 160_000);

  const emit = (opts) => {
    turn += 1;
    ts += opts.gap ?? stepDelay();
    const t = makeTrace({ session, turn, model, system, messages: history.slice(), tools, temperature, ts, ...opts });
    ts += t.latency_ms;
    return t;
  };

  /* Model-level answer step (assistant text, maybe with events). */
  const answerStep = (step) => {
    assistantStepIdx += 1;
    const idx = assistantStepIdx;
    const good = fill(step.assistant, variant);
    const weak = step.alt ? fill(step.alt, variant) : null;

    /* 1. infra retry: provider fails, router retries (maybe fallback model) */
    if (plan.infraRetryAt === idx) {
      const kind = pick(["rate_limit", "overloaded", "server"]);
      const status = kind === "rate_limit" ? 429 : kind === "overloaded" ? 529 : 500;
      const err = {
        rate_limit: { type: "rate_limit_error", message: `Rate limit exceeded for ${model}. Please retry after 12s.` },
        overloaded: { type: "overloaded_error", message: "Upstream provider is overloaded. The request was shed before inference." },
        server: { type: "api_error", message: "Internal server error while streaming the response (upstream 500)." },
      }[kind];
      const failed = emit({ status, error: err, responseMsg: null });
      if (chance(0.4)) model = FALLBACKS[model]; // router falls back
      emit({ retryOf: failed.id, gap: rint(800, 14_000), status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: ratingFor(step, plan, idx) });
      history.push({ role: "assistant", content: good });
      return;
    }

    /* 2. stream cut: 200 but stream died mid-answer; client retried */
    if (plan.streamCutAt === idx) {
      const cut = truncate(good, 0.25 + rand() * 0.3);
      const failed = emit({ status: 200, responseMsg: { role: "assistant", content: cut }, finishReason: null, truncated: true, error: { type: "stream_interrupted", message: "Client disconnected before the stream completed; partial response persisted." } });
      emit({ retryOf: failed.id, gap: rint(1_000, 9_000), status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: ratingFor(step, plan, idx) });
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
      const cut = truncate(good, 0.45 + rand() * 0.25);
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
    const fb = ratingFor(step, plan, idx);
    if (step.continuation && chance(0.55)) fb.continuation = "accepted";
    emit({ status: 200, responseMsg: { role: "assistant", content: good }, finishReason: "stop", feedback: fb });
    history.push({ role: "assistant", content: good });
  };

  /* Tool-call step: assistant emits call, client runs tool, result goes into history. */
  const toolStep = (step) => {
    const args = fillArgs(step.call.args, variant);
    const callId = uid("call", 12);
    const callMsg = { role: "assistant", content: null, tool_calls: [{ id: callId, type: "function", function: { name: step.call.name, arguments: JSON.stringify(args) } }] };

    if (plan.infraRetryAt === -100) { /* unused branch guard */ }

    emit({ status: 200, responseMsg: callMsg, finishReason: "tool_calls" });
    history.push(callMsg);

    /* An error branch only fires when the variant actually resolves it: a
       null variant value leaves the "{placeholder}" unreplaced, which we
       detect by the surviving brace. */
    const errText = step.error ? fill(step.error, variant) : null;
    const useError = plan.useToolError && errText && !errText.includes("{");
    if (useError) {
      history.push({ role: "tool", tool_call_id: callId, name: step.call.name, content: JSON.stringify({ error: errText }) });
      /* model recovers with a corrected call */
      const rArgs = fillArgs(step.recover.args, variant);
      const rId = uid("call", 12);
      const rMsg = { role: "assistant", content: null, tool_calls: [{ id: rId, type: "function", function: { name: step.recover.name, arguments: JSON.stringify(rArgs) } }] };
      emit({ status: 200, responseMsg: rMsg, finishReason: "tool_calls" });
      history.push(rMsg);
      history.push({ role: "tool", tool_call_id: rId, name: step.recover.name, content: fill(step.recoverResult ?? step.result ?? "", variant) });
    } else {
      history.push({ role: "tool", tool_call_id: callId, name: step.call.name, content: fill(step.result ?? "", variant) });
    }
  };

  for (const step of scenario.steps) {
    if (step.user) {
      history.push({ role: "user", content: fill(step.user, variant) });
      ts += userDelay();
      continue;
    }
    if (step.call) { toolStep(step); continue; }
    if (step.assistant) {
      const r = answerStep(step);
      if (r === "stop") break;
    }
  }
  return session;
}

function ratingFor(step, plan, idx) {
  if (step.rating === "positive" && chance(0.5)) return { rating: chance(0.55) ? "strong" : "ok" };
  if (chance(0.12)) return { rating: pick(["ok", "ok", "strong", "weak", "weak"]) };
  return {};
}

/* ------------------------------ corpus plan -------------------------------- */

const plans = [];
function planFor(scenario) {
  /* index assistant steps by capability so events always land on eligible steps */
  let ai = -1;
  const altIdxs = [], contIdxs = [], allIdxs = [];
  for (const s of scenario.steps) {
    if (!s.assistant) continue;
    ai += 1;
    allIdxs.push(ai);
    if (s.alt) altIdxs.push(ai);
    if (s.alt && s.continuation) contIdxs.push(ai);
  }
  const nAssist = allIdxs.length;
  const p = { infraRetryAt: null, qualityRetryAt: null, contRejectAt: null, truncateAt: null, streamCutAt: null, abandonAt: null, useToolError: false };

  /* continuation rejection rolls independently (only some scenarios support it) */
  if (contIdxs.length > 0 && chance(0.22)) p.contRejectAt = pick(contIdxs);

  const roll = rand();
  if (roll < 0.13) p.infraRetryAt = rint(0, nAssist - 1);
  else if (roll < 0.33 && altIdxs.length > 0) p.qualityRetryAt = pick(altIdxs);
  else if (roll < 0.42) p.truncateAt = rint(Math.max(0, nAssist - 2), nAssist - 1);
  else if (roll < 0.48) p.streamCutAt = rint(0, nAssist - 1);
  else if (roll < 0.52) p.abandonAt = rint(0, nAssist - 1);
  /* don't stack two events on the same step */
  if (p.contRejectAt !== null) {
    for (const k of ["infraRetryAt", "qualityRetryAt", "truncateAt", "streamCutAt", "abandonAt"]) {
      if (p[k] === p.contRejectAt) p[k] = null;
    }
  }
  if (chance(0.3)) p.useToolError = true;
  return p;
}

const SESSION_COUNT = 96;
for (let i = 0; i < SESSION_COUNT; i++) {
  const scenario = pick(SCENARIOS);
  const variant = pick(scenario.variants);
  plans.push([scenario, variant, planFor(scenario)]);
}
for (const [scenario, variant, plan] of plans) buildSession(scenario, variant, plan);

/* ------------------------------- write out -------------------------------- */

mkdirSync(join(ROOT, "data"), { recursive: true });
const ndjson = traces.map((t) => JSON.stringify(t)).join("\n") + "\n";
writeFileSync(join(ROOT, "data", "traces.ndjson"), ndjson);

/* summary */
const by = (f) => traces.reduce((acc, t) => { const k = f(t); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const sessions = new Set(traces.map((t) => t.session_id)).size;
console.log(`wrote data/traces.ndjson`);
console.log(`traces: ${traces.length}  sessions: ${sessions}`);
console.log(`status:`, by((t) => t.status));
console.log(`models:`, by((t) => t.model));
console.log(`finish:`, by((t) => t.response?.finish_reason ?? "none"));
console.log(`truncated: ${traces.filter((t) => t.truncated).length}`);
console.log(`ratings:`, by((t) => t.feedback.rating));
console.log(`retries: ${traces.filter((t) => t.feedback.retry_of).length}`);
console.log(`continuation:`, by((t) => t.feedback.continuation));
console.log(`tool-error rows: ${traces.filter((t) => t.request.messages.some((m) => m.role === "tool" && String(m.content).includes('"error"'))).length}`);
console.log(`total cost: $${traces.reduce((s, t) => s + (t.cost_usd || 0), 0).toFixed(2)}`);
