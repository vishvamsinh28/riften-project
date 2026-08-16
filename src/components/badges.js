/**
 * Small display atoms shared across pages: model chips, status dots,
 * feedback signal pills. Neutral by default — color only carries meaning.
 */

/** Model name as a quiet mono chip; provider shows on hover via title. */
export function ModelChip({ model, provider, className = "" }) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded bg-raised px-1.5 py-px font-mono text-2xs text-ink-dim ${className}`}
      title={provider}
    >
      {model}
    </span>
  );
}

/** HTTP status as a semantic dot (green 2xx / amber 4xx / red 5xx) plus the code. */
export function StatusDot({ status }) {
  const cls = status === 200 ? "bg-good" : status >= 500 ? "bg-bad" : "bg-warn";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${cls}`} />
      <span className="num text-xs text-ink-dim">{status}</span>
    </span>
  );
}

/* Soft pill styles per signal kind: tinted fill + readable dark text. */
const PILL_STYLES = {
  strong: "bg-good-tint text-good",
  ok: "bg-raised text-ink-dim",
  weak: "bg-warn-tint text-warn",
  accepted: "bg-good-tint text-good",
  rejected: "bg-bad-tint text-bad",
  retry: "bg-accent-soft text-accent",
  retried: "bg-raised text-ink-mute",
  truncated: "bg-warn-tint text-warn",
  tool_error: "bg-bad-tint text-bad",
  neutral: "bg-raised text-ink-dim",
};

/**
 * One quality-signal pill (rating, continuation, retry, truncation…).
 * Kind selects the tint; unknown kinds fall back to neutral styling.
 */
export function Signal({ kind, children, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px font-medium text-2xs ${PILL_STYLES[kind] ?? PILL_STYLES.neutral}`}
    >
      {children}
    </span>
  );
}

/** Compact strip of every quality signal a trace carries, for table rows. */
export function SignalStrip({ trace }) {
  const f = trace?.feedback ?? {};
  const d = trace?.derived ?? {};
  const out = [];
  if (f.rating) out.push(<Signal key="r" kind={f.rating} title={`rated ${f.rating}`}>{f.rating}</Signal>);
  if (f.continuation)
    out.push(
      <Signal key="c" kind={f.continuation} title={`continuation ${f.continuation}`}>
        {f.continuation === "accepted" ? "cont ✓" : "cont ✕"}
      </Signal>
    );
  if (d.isRetry) out.push(<Signal key="ir" kind="retry" title={`retry of ${f.retry_of}`}>retry</Signal>);
  if (d.wasRetried) out.push(<Signal key="wr" kind="retried" title="a later retry replaced this answer">retried</Signal>);
  if (d.truncated) out.push(<Signal key="t" kind="truncated" title="response truncated">trunc</Signal>);
  if (d.hasToolError) out.push(<Signal key="te" kind="tool_error" title="a tool returned an error in this transcript">tool err</Signal>);
  return out.length ? <span className="inline-flex flex-wrap gap-1">{out}</span> : <span className="text-ink-mute">·</span>;
}

/** finish_reason in tinted mono text; null (failed/cut requests) renders an em dash. */
export function FinishReason({ reason }) {
  if (!reason) return <span className="text-ink-mute">—</span>;
  const tint =
    reason === "stop" ? "text-ink-dim" : reason === "tool_calls" ? "text-accent" : reason === "length" ? "text-warn" : "text-bad";
  return <span className={`font-mono text-2xs ${tint}`}>{reason}</span>;
}
