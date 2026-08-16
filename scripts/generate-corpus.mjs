#!/usr/bin/env node
/**
 * Synthetic Riften Router trace corpus — entry point.
 *
 * Emits data/traces.ndjson, one router request per line, in the exact shape
 * the platform ingests. Deterministic: same seed, same corpus, byte for byte
 * (all randomness flows through scripts/corpus/rng.mjs in a fixed order).
 *
 * Invariants the generator guarantees (the export engine depends on them):
 *  - Agent clients replay the full transcript: trace N's request.messages is
 *    trace N-1's messages + accepted assistant msg + tool results (+ user msg).
 *  - A retry replays the *identical* request context as its original.
 *  - Rejected answers (retried-away, continuation-rejected) never appear in
 *    later transcript history — only accepted content is replayed.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rint, pick } from "./corpus/rng.mjs";
import { SCENARIOS } from "./corpus/scenarios/index.mjs";
import { planFor } from "./corpus/plan.mjs";
import { buildSession } from "./corpus/session.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_COUNT = 96;

/** Session start times stride forward over ~3 weeks from Jul 14 2026. */
function createClock() {
  let clock = Date.UTC(2026, 6, 14, 6, 12, 0);
  return () => {
    clock += rint(45, 590) * 60_000 + rint(0, 45_000);
    return clock;
  };
}

/** Compose the whole corpus: plan every session first, then build each one. */
function generate() {
  const plans = [];
  for (let i = 0; i < SESSION_COUNT; i += 1) {
    const scenario = pick(SCENARIOS);
    const variant = pick(scenario.variants);
    plans.push([scenario, variant, planFor(scenario)]);
  }
  const nextSessionStart = createClock();
  const traces = [];
  for (const [scenario, variant, plan] of plans) {
    traces.push(...buildSession(scenario, variant, plan, nextSessionStart));
  }
  return traces;
}

/** Frequency table over the corpus for the run summary. */
function countBy(traces, keyFn) {
  const acc = {};
  for (const t of traces) {
    const k = keyFn(t);
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return acc;
}

/** Write the corpus and print a distribution summary for eyeballing. */
function main() {
  const traces = generate();
  const outDir = join(ROOT, "data");
  const outFile = join(outDir, "traces.ndjson");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, traces.map((t) => JSON.stringify(t)).join("\n") + "\n");
  } catch (err) {
    console.error(`Failed to write ${outFile}: ${err.message}`);
    process.exit(1);
  }

  const sessions = new Set(traces.map((t) => t.session_id)).size;
  console.log("wrote data/traces.ndjson");
  console.log(`traces: ${traces.length}  sessions: ${sessions}`);
  console.log("status:", countBy(traces, (t) => t.status));
  console.log("models:", countBy(traces, (t) => t.model));
  console.log("finish:", countBy(traces, (t) => t.response?.finish_reason ?? "none"));
  console.log(`truncated: ${traces.filter((t) => t.truncated || t.response?.finish_reason === "length").length}`);
  console.log("ratings:", countBy(traces, (t) => t.feedback?.rating));
  console.log(`retries: ${traces.filter((t) => t.feedback?.retry_of).length}`);
  console.log("continuation:", countBy(traces, (t) => t.feedback?.continuation));
  console.log(`total cost: $${traces.reduce((s, t) => s + (t.cost_usd ?? 0), 0).toFixed(2)}`);
}

main();
