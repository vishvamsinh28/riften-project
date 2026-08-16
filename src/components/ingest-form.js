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
        // A body that parses whole is one JSON value (object or array);
        // anything else is treated as NDJSON, one object per line.
        let isSingleJson = false;
        try {
          JSON.parse(body);
          isSingleJson = true;
        } catch {}
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": isSingleJson ? "application/json" : "application/x-ndjson" },
          body,
        });
        const json = await res.json();
        if (json.error) {
          setError(json.error);
          return;
        }
        setResult(json);
        router.refresh();
      } catch (e) {
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
        className="h-64 w-full resize-y rounded-lg border border-edge bg-surface p-3 font-mono text-xs leading-5 text-ink placeholder:text-ink-mute focus:border-accent/60 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-accent/15 px-4 py-1.5 text-[13px] font-medium text-accent ring-1 ring-accent/40 transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {isPending ? "Ingesting…" : "Ingest"}
        </button>
        <button
          onClick={() => setText(SAMPLE.map((r) => JSON.stringify(r)).join("\n"))}
          className="rounded-md border border-edge bg-surface px-3 py-1.5 text-[13px] text-ink-dim transition-colors hover:border-edge-strong hover:text-ink"
        >
          Load sample (1 valid, 1 broken)
        </button>
        {text ? (
          <button onClick={() => { setText(""); setResult(null); setError(null); }} className="px-2 py-1.5 text-[13px] text-ink-mute hover:text-ink">
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-[13px] text-bad">{error}</div>
      ) : null}

      {result ? (
        <div className="rounded-lg border border-edge bg-surface">
          <div className="flex items-center gap-4 border-b border-edge px-4 py-2.5 text-[13px]">
            <span className="text-good">
              ● <span className="num">{result.accepted}</span> accepted
            </span>
            <span className={result.rejected.length ? "text-bad" : "text-ink-mute"}>
              ● <span className="num">{result.rejected.length}</span> rejected
            </span>
            {result.accepted > 0 ? (
              <a href="/traces?sort=ts&dir=desc" className="ml-auto text-xs text-accent hover:underline">
                View in traces →
              </a>
            ) : null}
          </div>
          {result.rejected.length ? (
            <ul className="space-y-1.5 px-4 py-3">
              {result.rejected.map((r, i) => (
                <li key={i} className="text-xs leading-5">
                  <span className="num text-ink-mute">row {r.row}</span>
                  {r.id ? <span className="ml-2 font-mono text-ink-dim">{r.id}</span> : null}
                  <span className="ml-2 text-bad/90">{r.error}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-xs text-ink-mute">Every row validated clean.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
