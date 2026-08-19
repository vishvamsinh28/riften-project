"use client";

import { useState } from "react";
import { fmtUsd, fmtMs, fmtTokens, fmtTime, shortId } from "@/lib/format";
import { ModelChip, StatusDot, FinishReason, SignalStrip } from "./badges";
import { TraceDrawer } from "./trace-drawer";
import { TRACE_GRID } from "./trace-grid";

/**
 * Client half of the trace table: renders the data rows and owns the peek
 * drawer. Rows receive slim summaries from the server page (no transcript
 * bodies); the drawer fetches the full trace on open.
 */

export function TraceRows({ rows }) {
  const [peek, setPeek] = useState(null);

  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-[13px] text-ink-dim">No traces match these filters.</p>
        <p className="mt-1 text-xs text-ink-mute">Loosen a filter, or clear them all.</p>
      </div>
    );
  }

  return (
    <>
      {rows.map((t) => (
        <button
          key={t.id}
          onClick={() => setPeek(t.id)}
          className={`${TRACE_GRID} w-full border-b border-edge/70 px-6 py-[7px] text-left transition-colors duration-100 last:border-b-0 hover:bg-raised ${
            peek === t.id ? "bg-accent-soft" : ""
          }`}
        >
          <span className="num whitespace-nowrap text-xs text-ink-mute">{fmtTime(t.ts)}</span>
          <span className="num truncate text-xs text-ink-dim">{shortId(t.id)}</span>
          <span className="num truncate text-xs text-ink-mute">
            {shortId(t.session_id)}
            <span className="ml-1">·{t.turn}</span>
          </span>
          <span className="min-w-0 truncate">
            <ModelChip model={t.model} provider={t.provider} />
          </span>
          <StatusDot status={t.status} />
          <FinishReason reason={t.derived?.finish} />
          <span className="num text-right text-xs text-ink-dim">{t.derived?.convLength}</span>
          <span className="num text-right text-xs text-ink-dim">{fmtTokens(t.tokens)}</span>
          <span className="num text-right text-xs text-ink-dim">{fmtMs(t.latency_ms)}</span>
          <span className="num text-right text-xs text-ink-dim">{fmtUsd(t.cost_usd)}</span>
          <SignalStrip trace={t} />
        </button>
      ))}
      <TraceDrawer traceId={peek} onClose={() => setPeek(null)} />
    </>
  );
}
