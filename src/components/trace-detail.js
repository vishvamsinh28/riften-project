import Link from "next/link";
import { getSession, getTrace, getStore } from "@/lib/store";
import { buildSftExport } from "@/lib/export-sft";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { SFT_REASONS } from "@/lib/export-reasons";
import { shortId } from "@/lib/format";

/**
 * Side-rail components for the trace detail page: metadata cells, the
 * session timeline, the retry chain strip, and the trace's export standing.
 * All server components reading the live store.
 */

/** One labeled metadata cell in the header strip. */
export function Meta({ label, children }) {
  return (
    <div>
      <div className="microlabel">{label}</div>
      <div className="num mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  );
}

/** Short status word for a session-rail entry's right edge. */
function railStatus(t) {
  const base = t.derived?.finish ?? String(t.status);
  return t.derived?.isRetry ? `${base} ↻` : base;
}

/** The session timeline: every trace of this session, current one highlighted. */
export function SessionRail({ trace }) {
  const session = getSession(trace.session_id) ?? [];
  return (
    <div className="rounded-lg border border-edge bg-surface">
      <div className="flex items-baseline justify-between border-b border-edge px-4 py-2.5">
        <span className="text-[13px] font-medium text-ink">Session</span>
        <Link href={`/traces?session=${trace.session_id}`} className="font-mono text-2xs text-accent hover:underline">
          {trace.session_id}
        </Link>
      </div>
      <div className="max-h-105 overflow-y-auto py-1.5">
        {session.map((t) => {
          const current = t.id === trace.id;
          const dot = t.status !== 200 ? "bg-bad" : t.derived?.truncated ? "bg-warn" : "bg-good";
          return (
            <Link
              key={t.id}
              href={`/traces/${t.id}`}
              className={`flex items-center gap-2.5 px-4 py-1.5 text-xs transition-colors ${current ? "bg-overlay" : "hover:bg-raised"}`}
            >
              <span className="num w-5 shrink-0 text-right text-ink-mute">{t.turn}</span>
              <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
              <span className={`truncate font-mono ${current ? "text-ink" : "text-ink-dim"}`}>{shortId(t.id)}</span>
              <span className="ml-auto shrink-0 font-mono text-2xs text-ink-mute">{railStatus(t)}</span>
            </Link>
          );
        })}
      </div>
    </div>
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-2.5 text-[13px]">
      <span className="microlabel">retry chain</span>
      {original ? (
        <>
          <Link href={`/traces/${original.id}`} className="font-mono text-xs text-accent hover:underline">
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
          <Link href={`/traces/${r.id}`} className="font-mono text-xs text-accent hover:underline">
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
    <div className="rounded-lg border border-edge bg-surface">
      <div className="border-b border-edge px-4 py-2.5 text-[13px] font-medium text-ink">Export standing</div>
      <div className="space-y-2.5 px-4 py-3 text-[13px]">
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
        <Link href="/exports" className="inline-block text-xs text-accent hover:underline">
          Exports &amp; exclusions →
        </Link>
      </div>
    </div>
  );
}
