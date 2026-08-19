"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const SAMPLE = [
  {
    id: "tr_demo_" + "ok01",
    session_id: "ses_demo01",
    turn: 1,
    ts: "2026-08-15T10:32:00.000Z",
    model: "claude-sonnet-4-5",
    status: 200,
    request: {
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Give me a one-line description of what a vector clock is." }],
    },
    response: {
      message: {
        role: "assistant",
        content: "A vector clock is a per-process array of counters that lets a distributed system decide whether one event happened before another or the two are concurrent.",
      },
      finish_reason: "stop",
    },
    usage: { prompt_tokens: 28, completion_tokens: 34, total_tokens: 62 },
    cost_usd: 0.000594,
    latency_ms: 912,
    feedback: { rating: "strong", retry_of: null, continuation: null },
  },
  {
    id: "tr_demo_" + "bad01",
    session_id: "ses_demo01",
    ts: "not-a-timestamp",
    model: "claude-sonnet-4-5",
    status: 200,
    request: { messages: [{ role: "user", content: "This row has a broken timestamp." }] },
    latency_ms: 500,
  },
];

/**
 * Detect whether the pasted body is one whole JSON value (object or array)
 * versus NDJSON. Parse failure is the signal here, not an error to surface.
 */
function detectSingleJson(body) {
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false; // not one JSON document -> treat as NDJSON, one object per line
  }
}

/**
 * Paste-and-ingest form. Posts to /api/ingest, renders the per-row
 * accept/reject report, and refreshes server components on success.
 */
export function IngestForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  async function submit() {
    setError(null);
    setResult(null);
    const body = text.trim();
    if (!body) {
      setError("Paste at least one trace first.");
      return;
    }
    startTransition(async () => {
      try {
        const isSingleJson = detectSingleJson(body);
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": isSingleJson ? "application/json" : "application/x-ndjson" },
          body,
        });
        const json = await res.json();
        // The API contract: { success, accepted?, rejected?, total?, error? }.
        // A failed request may still carry per-row detail worth showing.
        if (json?.success === false) setError(json.error ?? "Ingest failed.");
        if (Array.isArray(json?.rejected)) {
          setResult({ accepted: json.accepted ?? 0, rejected: json.rejected });
        }
        if (json?.success && (json.accepted ?? 0) > 0) router.refresh();
      } catch (err) {
        console.error("[ingest-form]", err);
        setError("Request failed — is the dev server running?");
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={'{"id":"tr_...","session_id":"ses_...","ts":"2026-08-15T10:32:00Z","model":"gpt-5", ...}\none JSON object per line, or a JSON array'}
        className="h-64 w-full resize-y border border-edge bg-surface p-3 font-mono text-xs leading-5 text-ink placeholder:text-ink-mute transition-colors duration-150 focus:border-edge-strong"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={isPending}
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {isPending ? "Ingesting…" : "Ingest"}
        </button>
        <button
          onClick={() => setText(SAMPLE.map((r) => JSON.stringify(r)).join("\n"))}
          className="btn-ghost inline-flex items-center gap-1.5"
        >
          Load sample (1 valid, 1 broken)
        </button>
        {text ? (
          <button onClick={() => { setText(""); setResult(null); setError(null); }} className="ulink text-xs">
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="border-t border-edge pt-3 text-[13px] text-bad">{error}</p>
      ) : null}

      {result ? (
        <div className="border-t border-edge pt-3">
          <div className="flex items-baseline gap-4">
            <span className="label text-good">
              <span className="num">{result.accepted}</span> accepted
            </span>
            <span className={`label ${result.rejected.length ? "text-bad" : "text-ink-mute"}`}>
              <span className="num">{result.rejected.length}</span> rejected
            </span>
            {result.accepted > 0 ? (
              <a href="/traces?sort=ts&dir=desc" className="ulink ml-auto text-xs">
                View in traces →
              </a>
            ) : null}
          </div>
          {result.rejected.length ? (
            <ul className="mt-3 space-y-1.5">
              {result.rejected.map((r, i) => (
                <li key={i} className="text-xs leading-5">
                  <span className="num text-ink-mute">row {r.row}</span>
                  {r.id ? <span className="ml-2 font-mono text-ink-dim">{r.id}</span> : null}
                  <span className="ml-2 text-bad">{r.error}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-2xs text-ink-mute">Every row validated clean.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
