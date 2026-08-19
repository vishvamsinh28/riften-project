import Link from "next/link";
import { getSession, getTrace, getStore } from "@/lib/store";
import { buildSftExport } from "@/lib/export-sft";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { SFT_REASONS } from "@/lib/export-reasons";
import { shortId } from "@/lib/format";
import { CopyButton } from "./copy-button";

/**
 * Side-rail components for the trace detail page: the session timeline,
 * the retry chain strip, and the trace's export standing. All server
 * components reading the live store; meta-strip cells live in trace-meta.
 */

export { Meta, TraceIdTitle, TokenSplit } from "./trace-meta";

/** Short status word for a session-rail entry's right edge. */
function railStatus(t) {
  const base = t.derived?.finish ?? String(t.status);
  return t.derived?.isRetry ? `${base} ↻` : base;
}

/** The session timeline: every trace of this session, current one highlighted. */
export function SessionRail({ trace }) {
  const session = getSession(trace.session_id) ?? [];
  // Slowest turn anchors the waterfall; 1 guards an empty or zero-latency session.
  const maxLatency = Math.max(1, ...session.map((t) => t.latency_ms ?? 0));
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="label text-ink-dim">Session</h2>
        <span className="flex min-w-0 items-center gap-1.5">
          <Link href={`/traces?session=${trace.session_id}`} className="ulink truncate font-mono text-2xs">
            {trace.session_id}
          </Link>
          <CopyButton text={trace.session_id} />
        </span>
      </div>
      <div className="-mx-2 max-h-105 overflow-y-auto">
        {session.map((t) => {
          const current = t.id === trace.id;
          const ok = t.status >= 200 && t.status < 300;
          const dot = !ok ? "bg-bad" : t.derived?.truncated ? "bg-warn" : "bg-good";
          // 2% floor keeps sub-percent turns visible against the slowest one.
          const pct = Math.max(2, Math.round((100 * (t.latency_ms ?? 0)) / maxLatency));
          return (
            <Link
              key={t.id}
              href={`/traces/${t.id}`}
              className={`block px-2 py-1.5 text-xs transition-colors duration-100 ${current ? "bg-accent-soft" : "hover:bg-raised"}`}
            >
              <span className="flex items-center gap-2.5">
                <span className="num w-5 shrink-0 text-right text-ink-mute">{t.turn}</span>
                <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
                <span className={`truncate font-mono ${current ? "text-ink" : "text-ink-dim"}`}>{shortId(t.id)}</span>
                <span className="ml-auto shrink-0 font-mono text-2xs text-ink-mute">{railStatus(t)}</span>
              </span>
              {/* Latency waterfall: gray for 2xx turns, red reserved for failures. */}
              <span className="mt-1 ml-[30px] block h-0.5" aria-hidden="true">
                <span className={`block h-full ${ok ? "bg-ink-mute" : "bg-accent-strong"}`} style={{ width: `${pct}%` }} />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Why the original in a retry chain was replaced, for the chain strip. */
function retryReason(original) {
  if (original.status !== 200) return `failed ${original.status}`;
  if (original.derived?.truncated) return "truncated";
  return original.feedback?.rating ?? "regenerated";
}

/** Linked retry-chain strip: original → this → retries. Renders nothing without links. */
export function RetryChain({ trace }) {
  const { retriedBy } = getStore();
  const retries = (retriedBy.get(trace.id) ?? []).map(getTrace).filter(Boolean);
  const original = trace.feedback?.retry_of ? getTrace(trace.feedback.retry_of) : null;
  if (!original && retries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="microlabel">retry chain</span>
      {original ? (
        <>
          <Link href={`/traces/${original.id}`} className="ulink font-mono text-xs">
            {shortId(original.id)}
          </Link>
          <span className="text-ink-mute">({retryReason(original)})</span>
          <span className="text-ink-mute">→</span>
          <span className="font-mono text-xs text-ink">this</span>
        </>
      ) : (
        <span className="font-mono text-xs text-ink">this</span>
      )}
      {retries.map((r) => (
        <span key={r.id} className="flex items-center gap-2">
          <span className="text-ink-mute">→</span>
          <Link href={`/traces/${r.id}`} className="ulink font-mono text-xs">
            {shortId(r.id)}
          </Link>
        </span>
      ))}
    </div>
  );
}

/**
 * Where this trace stands in both exports: kept SFT line, excluded (and
 * why), chosen/rejected side of a preference pair, or unpaired candidate.
 */
export function ExportStanding({ trace }) {
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const included = sft.included.some((t) => t.id === trace.id);
  const exclusion = sft.excluded.find((e) => e.trace.id === trace.id);
  const pair = pref.pairs.find(
    (p) => p.metadata?.chosen?.trace_id === trace.id || p.metadata?.rejected?.trace_id === trace.id
  );
  const skip = pref.skipped.find((s) => s.trace.id === trace.id);
  const reason = exclusion ? SFT_REASONS[exclusion.reason] : null;

  return (
    <section>
      <h2 className="label mb-2 text-ink-dim">Export standing</h2>
      <div className="space-y-2.5 text-[13px]">
        {included ? (
          <p className="text-good">● In the SFT export — this is the session&apos;s longest clean transcript.</p>
        ) : (
          <p className="text-ink-dim">
            <span className="text-ink-mute">○ Not in SFT export.</span>{" "}
            {reason ? (
              <>
                <span className="text-warn">{reason.label}:</span>{" "}
                <span className="text-ink-mute">{reason.detail}</span>
              </>
            ) : null}
          </p>
        )}
        {pair ? (
          <p className={pair.metadata?.chosen?.trace_id === trace.id ? "text-good" : "text-bad"}>
            ● {pair.metadata?.chosen?.trace_id === trace.id ? "Chosen" : "Rejected"} side of a preference pair
            <span className="text-ink-mute"> · source: {String(pair.metadata?.source ?? "").replace("_", " ")}</span>
          </p>
        ) : null}
        {!pair && skip ? (
          <p className="text-ink-mute">○ Preference candidate, unpaired — {skip.reason.replaceAll("_", " ")}.</p>
        ) : null}
        <Link href="/exports" className="ulink inline-block text-xs">
          Exports &amp; exclusions →
        </Link>
      </div>
    </section>
  );
}
