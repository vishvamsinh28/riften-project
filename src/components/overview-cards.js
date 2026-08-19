import Link from "next/link";
import { fmtPct } from "@/lib/format";

/**
 * Dashboard building blocks: unboxed KPI row, hairline-separated sections,
 * and quality-signal rows, plus the chart bucketing helpers. Everything
 * sits directly on the app surface — no card chrome.
 */

/** One KPI: label over a large numeral; links get a hover wash. */
export function Kpi({ label, value, sub, href }) {
  const body = (
    <>
      <div className="microlabel">{label}</div>
      <div className="font-doto mt-1.5 text-[26px] font-bold leading-none text-ink">{value}</div>
      {sub ? <div className="mt-1 text-2xs text-ink-mute">{sub}</div> : null}
    </>
  );
  const cls = "block min-w-0 px-4 py-1 transition-colors duration-150 first:pl-0";
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link href={href} className={`${cls} hover:bg-raised`}>
      {body}
    </Link>
  );
}

/** The KPI row: no box — cells separated by hairline dividers only. */
export function KpiStrip({ children }) {
  return (
    <div className="grid grid-cols-2 gap-y-4 md:flex md:items-start md:divide-x md:divide-edge md:[&>*]:pr-6 md:[&>*+*]:pl-6">
      {children}
    </div>
  );
}

/**
 * A titled section on the open surface: small heading row, content below,
 * no border box. Pages separate sections with space + hairlines.
 */
export function Panel({ title, aside, children, className = "", flush = false, id }) {
  return (
    <section id={id} className={`scroll-mt-16 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="label text-ink-dim">{title}</h2>
        {aside ? <span className="text-2xs text-ink-mute">{aside}</span> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

/** One quality-signal row: label, count, share — links into filtered traces. */
export function SignalRow({ label, count, total, href, dot = "bg-edge-strong" }) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center justify-between px-2 py-[5px] transition-colors duration-150 hover:bg-raised"
    >
      <span className="flex items-center gap-2 text-[13px] text-ink-dim">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {label}
      </span>
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
 * dashboard histogram. Returns [{label, count}].
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

/**
 * Aggregate traces into per-day success/error counts spanning the corpus
 * range, including zero-traffic days so the time axis stays honest.
 */
export function dailyBuckets(traces) {
  const list = traces ?? [];
  if (list.length === 0) return [];
  const byDay = new Map();
  for (const t of list) {
    const day = t.ts?.slice(0, 10);
    if (!day) continue;
    const entry = byDay.get(day) ?? { ok: 0, err: 0 };
    if (t.status === 200) entry.ok += 1;
    else entry.err += 1;
    byDay.set(day, entry);
  }
  const days = [...byDay.keys()].sort();
  const out = [];
  // Walk the full calendar range so gaps render as empty days, not skipped.
  for (let d = new Date(days[0]); d <= new Date(days[days.length - 1]); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, ...(byDay.get(key) ?? { ok: 0, err: 0 }) });
  }
  return out;
}
