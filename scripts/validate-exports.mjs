#!/usr/bin/env node
/**
 * Assertion suite for the export engine, run against the live corpus.
 * Exits non-zero on any invariant violation.
 */
import { getStore } from "../src/lib/store.js";
import { normalizeTrace } from "../src/lib/normalize.js";
import { buildSftExport } from "../src/lib/export-sft.js";
import { buildPreferenceExport } from "../src/lib/export-preferences.js";
import { toJsonl, canonicalJson, contentKey, conversationMessages } from "../src/lib/export-helpers.js";
import { checkLineShape } from "./validate-helpers.mjs";

let failures = 0;
/** Record one assertion: log and count a failure when the condition is false. */
const check = (cond, msg) => {
  if (!cond) {
    failures += 1;
    console.error("FAIL:", msg);
  }
};

const { all, sessions } = getStore();
const sft = buildSftExport();
const pref = buildPreferenceExport();

/* ---- SFT accounting: every trace is either included or excluded, once ---- */
check(sft.included.length + sft.excluded.length === all.length,
  `accounting: ${sft.included.length} included + ${sft.excluded.length} excluded != ${all.length} traces`);
const seen = new Set();
for (const t of sft.included) { check(!seen.has(t.id), `dup include ${t.id}`); seen.add(t.id); }
for (const e of sft.excluded) { check(!seen.has(e.trace.id), `trace both included and excluded: ${e.trace.id}`); seen.add(e.trace.id); }

/* ---- one conversation per session, the longest eligible ---- */
const perSession = new Map();
for (const t of sft.included) {
  check(!perSession.has(t.session_id), `two SFT lines for session ${t.session_id}`);
  perSession.set(t.session_id, t);
}
for (const [sid, kept] of perSession) {
  const eligible = sessions.get(sid).filter((t) =>
    t.status === 200 && !t.derived.truncated && !t.derived.wasRetried &&
    t.feedback.continuation !== "rejected" && t.feedback.rating !== "weak" &&
    t.response?.finish_reason !== "content_filter");
  const maxLen = Math.max(...eligible.map((t) => t.derived.convLength));
  check(kept.derived.convLength === maxLen,
    `session ${sid}: kept convLength ${kept.derived.convLength} != max eligible ${maxLen}`);
}

/* ---- no dirty rows leak into SFT lines ---- */
for (const t of sft.included) {
  check(t.status === 200, `non-2xx in SFT: ${t.id}`);
  check(!t.derived.truncated, `truncated in SFT: ${t.id}`);
  check(!t.derived.wasRetried, `retried-away answer in SFT: ${t.id}`);
  check(t.feedback.continuation !== "rejected", `rejected continuation in SFT: ${t.id}`);
  check(t.feedback.rating !== "weak", `weak-rated answer in SFT: ${t.id}`);
}

/* ---- line shape: valid OpenAI chat format (helpers keep nesting flat) ---- */
for (const line of sft.lines) checkLineShape(check, line);

/* ---- rejected answers embedded in kept transcripts must be loss-masked ----
   Rejection is read from the SIGNALS (retried/rejected/weak), never from the
   exclusion-reason precedence, and matched on canonical (key-sorted) bytes. */
const rejectedAnswers = new Map(); // session -> Set of rejected answer payloads
for (const e of sft.excluded) {
  const t = e.trace;
  const rejected = t.derived?.wasRetried || t.feedback?.continuation === "rejected" || t.feedback?.rating === "weak";
  if (!rejected || !t.response?.message) continue;
  if (!rejectedAnswers.has(t.session_id)) rejectedAnswers.set(t.session_id, new Set());
  rejectedAnswers.get(t.session_id).add(canonicalJson(t.response.message));
}
let maskedSeen = 0;
for (const line of sft.lines) {
  const set = rejectedAnswers.get(line.metadata.session_id);
  if (!set) continue;
  line.messages.forEach((m, i) => {
    if (m.role !== "assistant" || i === line.messages.length - 1) return;
    const { weight, ...bare } = m;
    if (set.has(canonicalJson(bare))) {
      maskedSeen += 1;
      check(weight === 0, `rejected answer embedded unmasked in kept line for ${line.metadata.session_id}`);
    }
  });
}
check(maskedSeen === sft.maskedCount, `maskedCount ${sft.maskedCount} != embedded rejected answers found ${maskedSeen}`);

/* ---- content dedup: no two kept lines or pairs share content identity ---- */
const lineKeys = new Set();
for (const t of sft.included) {
  const key = contentKey(conversationMessages(t));
  check(!lineKeys.has(key), `duplicate conversation content kept twice (session ${t.session_id})`);
  lineKeys.add(key);
}
const pairKeys = new Set();
for (const p of pref.pairs) {
  const key = contentKey({ i: p.input.messages, p: p.preferred_output, n: p.non_preferred_output });
  check(!pairKeys.has(key), `duplicate pair content kept twice (rejected ${p.metadata.rejected.trace_id})`);
  pairKeys.add(key);
}

/* ---- jsonl round trip ---- */
for (const [i, l] of toJsonl(sft.lines).trimEnd().split("\n").entries()) {
  try { JSON.parse(l); } catch { check(false, `sft line ${i} not parseable`); }
}

/* ---- preference pairs ---- */
check(pref.pairs.length > 0, "no preference pairs generated");
const rejectedSeen = new Set();
for (const p of pref.pairs) {
  const meta = p.metadata;
  check(["retrial", "weak_rating", "continuation_rejected"].includes(meta.source), `bad source ${meta.source}`);
  check(meta.chosen.trace_id !== meta.rejected.trace_id, "pair with itself");
  check(!rejectedSeen.has(meta.rejected.trace_id), `rejected trace paired twice: ${meta.rejected.trace_id}`);
  rejectedSeen.add(meta.rejected.trace_id);
  check(p.preferred_output.length === 1 && p.non_preferred_output.length === 1, "pair without single outputs");
  check(JSON.stringify(p.preferred_output) !== JSON.stringify(p.non_preferred_output), "identical chosen/rejected");
  check(p.input.messages.length > 0, "pair with empty input");
  const lastInput = p.input.messages[p.input.messages.length - 1];
  check(lastInput.role !== "assistant", "pair input ends with assistant message");
}

/* ---- chosen sides are never rejected answers; dispositions are unique ---- */
const chosenIds = new Set(pref.pairs.map((p) => p.metadata.chosen.trace_id));
for (const p of pref.pairs) {
  check(!chosenIds.has(p.metadata.rejected.trace_id),
    `trace ${p.metadata.rejected.trace_id} is chosen in one pair and rejected in another`);
  const c = p.metadata.chosen;
  check(c.feedback.rating !== "weak", `weak-rated answer used as chosen: ${c.trace_id}`);
  check(c.feedback.continuation !== "rejected", `rejected continuation used as chosen: ${c.trace_id}`);
  check(!c.feedback.was_retried, `retried-away answer used as chosen: ${c.trace_id}`);
}
const skipIds = new Set();
for (const s of pref.skipped) {
  check(!skipIds.has(s.trace.id), `trace ${s.trace.id} skipped twice (double-counted disposition)`);
  skipIds.add(s.trace.id);
  check(!pref.pairs.some((p) => p.metadata.rejected.trace_id === s.trace.id),
    `trace ${s.trace.id} both paired and skipped`);
}

/* ---- source coverage: corpus must exercise all three sources ---- */
for (const src of ["retrial", "weak_rating", "continuation_rejected"]) {
  check(pref.sourceCounts[src] > 0, `no pairs from source ${src} — corpus or pairing logic gap`);
}

/* ---- exclusion coverage: corpus must exercise the headline reasons ---- */
for (const r of ["non_2xx", "truncated", "retried_away", "continuation_rejected", "weak_rating", "superseded", "duplicate_content"]) {
  check(sft.reasonCounts[r] > 0, `no exclusions with reason ${r} — corpus or exclusion logic gap`);
}

/* ---- ingest validation rejects malformed rows ---- */
const bad = [
  { id: "x1" }, // missing everything
  { id: "x2", session_id: "s", ts: "not-a-date", model: "m", status: 200, request: { messages: [{ role: "user", content: "hi" }] }, latency_ms: 5 },
  { id: "x3", session_id: "s", ts: "2026-01-01T00:00:00Z", model: "m", status: 9000, request: { messages: [{ role: "user", content: "hi" }] }, latency_ms: 5 },
  { id: "x4", session_id: "s", ts: "2026-01-01T00:00:00Z", model: "m", status: 200, request: { messages: [{ role: "alien", content: "hi" }] }, latency_ms: 5 },
  "not an object",
];
for (const row of bad) {
  const { error } = normalizeTrace(row);
  check(!!error, `normalizeTrace accepted a malformed row: ${JSON.stringify(row).slice(0, 60)}`);
}
const good = normalizeTrace({
  id: "ok1", session_id: "s", ts: "2026-01-01T00:00:00Z", model: "gpt-5", status: 200,
  request: { messages: [{ role: "user", content: "hi" }] },
  response: { message: { role: "assistant", content: "hello" }, finish_reason: "stop" },
  latency_ms: 100,
});
check(!good.error, `normalizeTrace rejected a valid row: ${good.error}`);

/* ---- summary ---- */
console.log("---");
console.log(`traces: ${all.length}  sessions: ${sessions.size}`);
console.log(`SFT lines: ${sft.lines.length} (sessions covered: ${sft.sessionsCovered}/${sft.sessionsTotal})`);
console.log(`SFT exclusions:`, sft.reasonCounts);
console.log(`preference pairs: ${pref.pairs.length}`, pref.sourceCounts);
console.log(`preference skips:`, pref.skipCounts);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
