import Link from "next/link";
import { fmtPct } from "@/lib/format";

/**
 * Presentational atoms for the overview page: stat tiles, titled cards,
 * quality-signal rows, and the latency bucketing helper. Server-safe.
 */

/** One headline stat; wraps in a link when a drill-down target exists. */
export function Tile({ label, value, sub, href }) {
  const body = (
    <>
      <div className="microlabel">{label}</div>
      <div className="num mt-1.5 text-[22px] leading-7 text-ink">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink-mute">{sub}</div> : null}
    </>
  );
  const cls = "rounded-lg border border-edge bg-surface px-4 py-3";
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link href={href} className={`${cls} transition-colors hover:border-edge-strong hover:bg-raised`}>
      {body}
    </Link>
  );
}

/** Titled card shell with an optional right-aligned aside note. */
export function Card({ title, aside, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-edge bg-surface ${className}`}>
      <header className="flex items-baseline justify-between border-b border-edge px-4 py-2.5">
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        {aside ? <span className="text-xs text-ink-mute">{aside}</span> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** One quality-signal row: label, count, share — links into filtered traces. */
export function SignalRow({ label, count, total, href, tone = "text-ink-dim" }) {
  return (
    <Link href={href} className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-raised">
      <span className={`text-[13px] ${tone}`}>{label}</span>
      <span className="num text-xs text-ink-dim">
        {count}
        <span className="text-ink-mute"> · {fmtPct(count, total)}</span>
      </span>
    </Link>
  );
}

/* Nonlinear bucket edges matched to the corpus's latency long tail. */
const LATENCY_EDGES = [0, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 20000, 40000, Infinity];

/**
 * Bucket successful-request latencies into the fixed edge set for the
 * overview histogram. Returns [{label, count}].
 */
export function latencyBuckets(traces) {
  const values = (traces ?? []).filter((t) => t.status === 200).map((t) => t.latency_ms);
  const label = (ms) => (ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`);
  return LATENCY_EDGES.slice(0, -1).map((lo, i) => {
    const hi = LATENCY_EDGES[i + 1];
    return {
      label: hi === Infinity ? `>${label(lo)}` : `${label(lo)}–${label(hi)}`,
      count: values.filter((v) => v >= lo && v < hi).length,
    };
  });
}
