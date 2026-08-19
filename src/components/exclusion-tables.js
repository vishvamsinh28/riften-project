import Link from "next/link";
import { SFT_REASONS, PREF_SKIP_REASONS } from "@/lib/export-reasons";
import { fmtPct, shortId } from "@/lib/format";
import { StackedBar } from "@/components/bars";

/**
 * The exclusion accounting on the exports page: the composition bar, the
 * per-reason SFT exclusion table, and the preference skip table. Every
 * dropped trace is listed and linked — nothing disappears silently.
 */

/* Deep-link each reason into the trace explorer where a filter expresses it. */
const REASON_FILTER_LINKS = {
  non_2xx: "/traces?status=4xx,5xx",
  truncated: "/traces?truncated=1",
  retried_away: "/traces?feedback=retried",
  continuation_rejected: "/traces?feedback=cont_rejected",
  weak_rating: "/traces?feedback=weak",
};

/* Monochrome + red register: white kept, grays for benign drops, red only
   for the error/rejected family. Legend labels carry the distinctions. */
const REASON_COLORS = {
  kept: "var(--color-chart)",
  superseded: "var(--color-edge-strong)",
  duplicate_content: "var(--color-raised)",
  non_2xx: "var(--color-accent-strong)",
  truncated: "var(--color-ink-mute)",
  retried_away: "var(--color-bad)",
  continuation_rejected: "var(--color-bad)",
  weak_rating: "var(--color-bad)",
  empty_response: "var(--color-ink-dim)",
  content_filter: "var(--color-ink-dim)",
};

/** Collapsible chip list of excluded traces, capped for very long groups. */
function ExcludedList({ entries }) {
  if (!entries?.length) return null;
  const shown = entries.slice(0, 24);
  return (
    <details>
      <summary className="microlabel cursor-pointer transition-colors hover:text-ink">
        {entries.length} trace{entries.length === 1 ? "" : "s"} — show
      </summary>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shown.map((e) => (
          <Link
            key={e.trace.id}
            href={`/traces/${e.trace.id}`}
            className="border border-edge bg-surface px-1.5 py-0.5 font-mono text-2xs text-ink-dim transition-colors duration-150 hover:border-edge-strong hover:bg-raised hover:text-ink"
          >
            {shortId(e.trace.id)}
          </Link>
        ))}
        {entries.length > shown.length ? (
          <span className="px-1 py-0.5 text-2xs text-ink-mute">+{entries.length - shown.length} more</span>
        ) : null}
      </div>
    </details>
  );
}

/** Group excluded/skipped entries by their reason key. */
function groupByReason(entries) {
  const grouped = {};
  for (const e of entries ?? []) (grouped[e.reason] ??= []).push(e);
  return grouped;
}

/** The kept-vs-dropped composition bar with its legend. */
export function CompositionBar({ sft }) {
  const segments = [
    { key: "kept", label: "kept", value: sft.included.length },
    ...Object.entries(sft.reasonCounts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, label: SFT_REASONS[k]?.label ?? k, value: v })),
  ].map((s) => ({ ...s, color: REASON_COLORS[s.key] ?? "var(--color-ink-mute)" }));

  return (
    <>
      <StackedBar segments={segments} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-2xs text-ink-mute">
            <span className="size-2" style={{ background: s.color }} />
            {s.label} <span className="num text-ink-dim">{s.value}</span>
          </span>
        ))}
      </div>
    </>
  );
}

/** Per-reason SFT exclusion table: reason, count, share, rationale, trace list. */
export function SftExclusionTable({ sft, total }) {
  const grouped = groupByReason(sft.excluded);
  const rows = Object.entries(sft.reasonCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-5 overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-[minmax(150px,190px)_56px_52px_1fr] items-center gap-x-4 border-y border-edge px-0 py-2 md:grid-cols-[190px_56px_52px_minmax(280px,1fr)_minmax(160px,240px)]">
        <span className="microlabel">Reason</span>
        <span className="microlabel text-right">Traces</span>
        <span className="microlabel text-right">Share</span>
        <span className="microlabel">Why it&apos;s out</span>
        <span className="microlabel hidden md:block">Excluded traces</span>
      </div>
      {rows.map(([reason, count]) => {
        const meta = SFT_REASONS[reason] ?? { label: reason, detail: "" };
        const href = REASON_FILTER_LINKS[reason];
        return (
          <div
            key={reason}
            className="grid min-w-[560px] grid-cols-[minmax(150px,190px)_56px_52px_1fr] items-start gap-x-4 border-b border-edge/60 px-0 py-2.5 last:border-b-0 md:grid-cols-[190px_56px_52px_minmax(280px,1fr)_minmax(160px,240px)]"
          >
            <span className="flex items-center gap-2 text-[13px] text-ink-dim">
              <span className="size-2 shrink-0" style={{ background: REASON_COLORS[reason] ?? "var(--color-ink-mute)" }} />
              {href ? <Link href={href} className="ulink">{meta.label}</Link> : meta.label}
            </span>
            <span className="num pt-px text-right text-xs text-ink">{count}</span>
            <span className="num pt-px text-right text-xs text-ink-mute">{fmtPct(count, total)}</span>
            <span className="text-xs leading-5 text-ink-mute">{meta.detail}</span>
            <span className="col-span-full mt-1.5 md:col-span-1 md:mt-0">
              <ExcludedList entries={grouped[reason]} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Preference candidates that failed to pair, grouped by skip reason. */
export function PrefSkipTable({ pref }) {
  const grouped = groupByReason(pref.skipped);
  const rows = Object.entries(pref.skipCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    return <p className="py-3 text-[13px] text-ink-mute">Every candidate paired — nothing was skipped.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {rows.map(([reason, count]) => {
        const meta = PREF_SKIP_REASONS[reason] ?? { label: reason, detail: "" };
        return (
          <div
            key={reason}
            className="grid min-w-[520px] grid-cols-[minmax(150px,220px)_56px_1fr] items-start gap-x-4 border-b border-edge/60 py-2.5 last:border-b-0 md:grid-cols-[220px_56px_minmax(280px,1fr)_minmax(160px,240px)]"
          >
            <span className="text-[13px] text-ink-dim">{meta.label}</span>
            <span className="num text-right text-xs text-ink">{count}</span>
            <span className="text-xs leading-5 text-ink-mute">{meta.detail}</span>
            <span className="col-span-full mt-1.5 md:col-span-1 md:mt-0">
              <ExcludedList entries={grouped[reason]} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
