# Riften · Post-training data platform

Turns Riften Router traces into training data. The router already captures every request —
messages, system prompt, response, tool calls, finish reason, model, tokens, cost, latency,
plus quality signals (explicit weak/ok/strong ratings, retrials, continuation accepted/rejected).
This platform ingests those traces, makes them inspectable, and distills them into SFT and
preference datasets with every dropped row accounted for.

No production traffic is used: `npm run seed` generates a deterministic synthetic corpus
(478 traces across 96 sessions) in exactly the shape the router emits — multi-turn agent
sessions with tool loops, infra retries (429/500), user regenerations, tool errors the model
recovers from, truncated and stream-cut responses, and eight models across four providers.

## Run it

```bash
npm install
npm run seed        # regenerate data/traces.ndjson (seeded, deterministic)
npm run dev         # http://localhost:3000
npm run validate    # assertion suite over the export engine
```

## The pages

| Page | What it does |
|---|---|
| `/` | Corpus overview: spend, latency, error/truncation rates, model mix, quality signals. Every number links into a pre-filtered trace view. |
| `/traces` | The inspector. Filter by model, status class, feedback signal, truncation, tool errors, cost and latency ranges, full-text search. Filter state lives in the URL. |
| `/traces/[id]` | Full transcript — tool calls, tool results (errors flagged), the response, retry chains, the session timeline, and this trace's export standing (kept or excluded, and why). |
| `/exports` | Download both datasets and read the complete exclusion accounting. |
| `/ingest` | Paste or POST more traces; per-row validation with reasons for every rejection. |

## The trace shape

One JSON object per line (`data/traces.ndjson`):

```jsonc
{
  "id": "tr_…", "session_id": "ses_…", "turn": 3, "ts": "2026-07-…",
  "model": "claude-sonnet-4-5", "provider": "anthropic",
  "status": 200,                     // provider HTTP status; non-2xx rows carry `error`
  "request": { "system": "…", "messages": [/* replayed transcript */], "tools": […], "temperature": 0.2, "max_tokens": 4096 },
  "response": { "message": { "role": "assistant", "content": "…", "tool_calls": […] }, "finish_reason": "stop|tool_calls|length|…" },
  "usage": { "prompt_tokens": 773, "completion_tokens": 62, "total_tokens": 835 },
  "cost_usd": 0.0016, "latency_ms": 1440, "truncated": false,
  "feedback": {
    "rating": "weak|ok|strong|null", // explicit user rating
    "retry_of": "tr_…|null",        // this trace regenerated that one
    "continuation": "accepted|rejected|null"
  }
}
```

Agent clients replay the full transcript every turn, so a session's traces form growing
prefixes of one conversation. Retries replay the identical context as their original —
that identity is what makes preference pairs valid.

## SFT export (`/api/export/sft`)

OpenAI chat-format JSONL, one conversation per line, `metadata` on every line
(model, tokens, cost, latency, feedback, finish reason). Rules, in order:

1. **Drop** non-2xx, empty responses, truncated/stream-cut rows, content-filtered rows.
2. **Drop rejected answers**: retried-away originals, continuation-rejected turns, weak-rated turns.
3. **Dedup to one line per session** — the longest eligible transcript; everything shorter is
   a prefix of it (reason: `superseded`). Ties break toward recency, so a retry beats the
   answer it replaced.

## Preference export (`/api/export/preferences`)

DPO-style JSONL: `input` (shared context) + `preferred_output` / `non_preferred_output`,
with per-side metadata. Pairs come from three signals:

- **Retrial** — the user regenerated a completed answer; kept retry = chosen, original = rejected.
- **Weak rating** — the original was explicitly rated weak before regeneration.
- **Continuation rejected** — a rejected turn paired with the accepted alternative over the same context.

A pair only exists when both sides completed over an identical context. Infra retries of
failed requests carry no rejected answer and are skipped — visibly, with a reason, like
every other exclusion (`/exports`).

## Ingest

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H 'Content-Type: application/x-ndjson' \
  --data-binary @traces.ndjson
```

Accepts NDJSON or a JSON array. Every row is validated (required fields, role enums, status
codes, timestamp parseability, duplicate ids); the response lists each accepted and rejected
row with the reason. Accepted rows are appended to the corpus file, or held in memory on
read-only filesystems.

## Layout

```
scripts/generate-corpus.mjs   seeded synthetic corpus generator
scripts/validate-exports.mjs  invariant suite for the export engine
data/traces.ndjson            the corpus (regenerate with npm run seed)
src/lib/store.js              load · normalize · derive · filter · ingest
src/lib/exports.js            SFT + preference builders, exclusion accounting
src/app/…                     UI (Next.js 16 App Router) and API routes
```
