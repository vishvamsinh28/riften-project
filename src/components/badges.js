/** Small display atoms shared across pages. Server-safe (no state). */

const MODEL_TINTS = {
  anthropic: "border-[#c8794a]/35 text-[#e0a37e]",
  openai: "border-[#5fb8a5]/35 text-[#8ed0c1]",
  google: "border-[#7f9df0]/35 text-[#a7bcf5]",
  deepseek: "border-[#a48fe0]/35 text-[#c0b0ec]",
  meta: "border-[#6aa8d8]/35 text-[#93c4e8]",
  unknown: "border-edge-strong text-ink-dim",
};

export function ModelChip({ model, provider, className = "" }) {
  const tint = MODEL_TINTS[provider] ?? MODEL_TINTS.unknown;
  return (
    <span
      className={`inline-flex items-center rounded border bg-transparent px-1.5 py-px font-mono text-2xs ${tint} ${className}`}
      title={provider}
    >
      {model}
    </span>
  );
}

export function StatusDot({ status }) {
  const cls = status === 200 ? "bg-good" : status >= 500 ? "bg-bad" : "bg-warn";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${cls}`} />
      <span className="num text-xs">{status}</span>
    </span>
  );
}

const RATING_STYLES = {
  strong: "border-good/40 text-good",
  ok: "border-ink-mute/50 text-ink-dim",
  weak: "border-warn/40 text-warn",
};

export function Signal({ kind, children, title }) {
  const styles = {
    strong: RATING_STYLES.strong,
    ok: RATING_STYLES.ok,
    weak: RATING_STYLES.weak,
    accepted: "border-good/40 text-good",
    rejected: "border-bad/40 text-bad",
    retry: "border-accent/40 text-accent",
    retried: "border-ink-mute/50 text-ink-dim",
    truncated: "border-warn/40 text-warn",
    tool_error: "border-bad/40 text-bad",
    neutral: "border-edge-strong text-ink-dim",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-2xs ${styles[kind] ?? styles.neutral}`}
    >
      {children}
    </span>
  );
}

/** Compact signal strip for table rows. */
export function SignalStrip({ trace }) {
  const f = trace.feedback;
  const d = trace.derived;
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

export function FinishReason({ reason }) {
  if (!reason) return <span className="text-ink-mute">—</span>;
  const tint =
    reason === "stop" ? "text-ink-dim" : reason === "tool_calls" ? "text-accent" : reason === "length" ? "text-warn" : "text-bad";
  return <span className={`font-mono text-2xs ${tint}`}>{reason}</span>;
}
