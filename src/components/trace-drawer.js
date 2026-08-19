"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtUsd, fmtMs, fmtTokens, fmtTime } from "@/lib/format";
import { ModelChip, StatusDot, FinishReason, SignalStrip } from "./badges";
import { Transcript } from "./transcript";

/**
 * Side-peek drawer for a trace: slides in over the table, fetches the full
 * trace from the API, renders metadata plus the complete transcript, and
 * links to the dedicated page for a shareable full view.
 */

/** One labeled metadata cell in the drawer's header grid. */
function Cell({ label, children }) {
  return (
    <div>
      <div className="microlabel">{label}</div>
      <div className="num mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  );
}

/** Skeleton shown while the trace body is in flight. */
function DrawerSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {[64, 96, 80, 120, 72].map((h, i) => (
        <div key={i} className="skeleton w-full" style={{ height: h }} />
      ))}
    </div>
  );
}

/**
 * The drawer overlay. `traceId` opens it; `onClose` dismisses (backdrop
 * click or Escape). Fetches on every open so the view is always fresh.
 */
export function TraceDrawer({ traceId, onClose }) {
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState(null);

  // Load the full trace whenever the peeked id changes.
  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;
    setTrace(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/traces/${traceId}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success === false || !json?.trace) setError(json?.error ?? "Failed to load trace.");
        else setTrace(json.trace);
      } catch (err) {
        console.error("[trace-drawer]", err);
        if (!cancelled) setError("Failed to load trace — is the server running?");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    if (!traceId) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [traceId, onClose]);

  if (!traceId) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label={`Trace ${traceId}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[720px] animate-drawer-in flex-col border-l border-edge bg-overlay shadow-drawer"
      >
        <header className="flex items-center gap-3 border-b border-edge px-5 py-3">
          <span className="num truncate text-xs text-ink">{traceId}</span>
          {trace ? <span className="num shrink-0 text-2xs text-ink-mute">{fmtTime(trace.ts)} UTC</span> : null}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Link
              href={`/traces/${traceId}`}
              className="btn-ghost inline-flex shrink-0 items-center"
            >
              Open full view
            </Link>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex size-7 items-center justify-center text-ink-mute transition-colors duration-150 hover:bg-raised hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        {error ? (
          <p className="m-5 border border-bad/40 bg-bad-tint px-3 py-2 text-[13px] text-bad">{error}</p>
        ) : !trace ? (
          <DrawerSkeleton />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-b border-edge px-5 py-3.5 sm:grid-cols-6">
              <Cell label="Model">
                <ModelChip model={trace.model} provider={trace.provider} />
              </Cell>
              <Cell label="Status">
                <StatusDot status={trace.status} />
              </Cell>
              <Cell label="Finish">
                <FinishReason reason={trace.derived?.finish} />
              </Cell>
              <Cell label="Latency">{fmtMs(trace.latency_ms)}</Cell>
              <Cell label="Tokens">{fmtTokens(trace.usage?.total_tokens)}</Cell>
              <Cell label="Cost">{fmtUsd(trace.cost_usd)}</Cell>
            </div>
            <div className="border-b border-edge px-5 py-2.5">
              <SignalStrip trace={trace} />
            </div>
            {trace.error ? (
              <div className="mx-5 mt-4 border border-bad/40 bg-bad-tint px-3 py-2">
                <div className="font-mono text-2xs text-bad">provider error · {trace.error.type ?? "unknown"}</div>
                <p className="mt-0.5 text-xs text-ink-dim">{trace.error.message ?? "No detail recorded."}</p>
              </div>
            ) : null}
            <div className="p-5">
              <Transcript trace={trace} />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
