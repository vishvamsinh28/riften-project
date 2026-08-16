import Link from "next/link";
import { Suspense } from "react";
import { getStore } from "@/lib/store";
import { parseFilters, filterTraces } from "@/lib/filters";
import { fmtUsd, fmtMs, fmtTokens, fmtTime, fmtCount, shortId } from "@/lib/format";
import { FilterBar } from "@/components/filter-bar";
import { ModelChip, StatusDot, FinishReason, SignalStrip } from "@/components/badges";

export const dynamic = "force-dynamic";

export const metadata = { title: "Traces" };

const PAGE_SIZE = 50;

const GRID =
  "grid grid-cols-[92px_108px_120px_minmax(160px,1fr)_64px_84px_44px_64px_68px_76px_minmax(170px,1.1fr)] items-center gap-x-3";

/** Rebuild the current query string from raw params, minus empty values. */
function paramsFrom(rawParams) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rawParams)) if (v) params.set(k, v);
  return params;
}

/** Sortable column header; clicking toggles direction on the active field. */
function SortHeader({ label, field, filters, rawParams, align = "left" }) {
  const active = filters.sort === field;
  const params = paramsFrom(rawParams);
  params.set("sort", field);
  params.set("dir", active && filters.dir === "desc" ? "asc" : "desc");
  params.delete("page");
  return (
    <Link
      href={`/traces?${params}`}
      className={`microlabel flex items-center gap-1 transition-colors hover:text-ink ${align === "right" ? "justify-end" : ""} ${active ? "text-ink-dim" : ""}`}
    >
      {label}
      {active ? <span className="text-accent">{filters.dir === "desc" ? "↓" : "↑"}</span> : null}
    </Link>
  );
}

/** Range summary + prev/next links preserving every other query param. */
function Pagination({ page, total, rawParams }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p) => {
    const params = paramsFrom(rawParams);
    if (p > 1) params.set("page", String(p));
    else params.delete("page");
    return `/traces${params.size ? `?${params}` : ""}`;
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between border-t border-edge px-4 py-2.5">
      <span className="text-xs text-ink-mute">
        {fmtCount(from)}–{fmtCount(to)} of {fmtCount(total)}
      </span>
      <div className="flex items-center gap-1">
        <Link
          href={page > 1 ? link(page - 1) : "#"}
          aria-disabled={page <= 1}
          className={`rounded border border-edge px-2 py-1 text-xs ${page > 1 ? "text-ink-dim hover:bg-raised hover:text-ink" : "pointer-events-none text-ink-mute/70"}`}
        >
          ← Prev
        </Link>
        <span className="num px-2 text-xs text-ink-mute">
          {page} / {pages}
        </span>
        <Link
          href={page < pages ? link(page + 1) : "#"}
          aria-disabled={page >= pages}
          className={`rounded border border-edge px-2 py-1 text-xs ${page < pages ? "text-ink-dim hover:bg-raised hover:text-ink" : "pointer-events-none text-ink-mute/70"}`}
        >
          Next →
        </Link>
      </div>
    </div>
  );
}

/**
 * The trace explorer: URL-driven filters, sortable columns, paginated
 * server-rendered rows. searchParams is a Promise in this Next version.
 */
export default async function TracesPage({ searchParams }) {
  const sp = await searchParams;
  // Repeated query keys arrive as arrays; the last occurrence wins.
  const rawParams = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[v.length - 1] : v])
  );
  const filters = parseFilters(rawParams);
  const results = filterTraces(filters);
  const models = [...new Set(getStore().all.map((t) => t.model))].sort();
  const page = Math.min(filters.page, Math.max(1, Math.ceil(results.length / PAGE_SIZE)));
  const rows = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="group space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Traces</h1>
        <span className="text-[13px] text-ink-mute">
          <span className="num text-ink-dim">{fmtCount(results.length)}</span> matching
          {filters.session ? (
            <>
              {" "}
              in session <span className="font-mono text-accent">{filters.session}</span>
            </>
          ) : null}
        </span>
      </div>

      <Suspense fallback={<div className="h-[30px]" />}>
        <FilterBar models={models} />
      </Suspense>

      <div className="overflow-x-auto rounded-lg border border-edge bg-surface transition-opacity group-has-data-pending:opacity-50">
        <div className="min-w-[1220px]">
          <div className={`${GRID} border-b border-edge px-4 py-2`}>
            <SortHeader label="time" field="ts" filters={filters} rawParams={rawParams} />
            <span className="microlabel">trace</span>
            <span className="microlabel">session</span>
            <span className="microlabel">model</span>
            <span className="microlabel">status</span>
            <span className="microlabel">finish</span>
            <SortHeader label="msgs" field="turns" filters={filters} rawParams={rawParams} align="right" />
            <SortHeader label="tokens" field="tokens" filters={filters} rawParams={rawParams} align="right" />
            <SortHeader label="latency" field="latency" filters={filters} rawParams={rawParams} align="right" />
            <SortHeader label="cost" field="cost" filters={filters} rawParams={rawParams} align="right" />
            <span className="microlabel">signals</span>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[13px] text-ink-dim">No traces match these filters.</p>
              <p className="mt-1 text-xs text-ink-mute">Loosen a filter, or clear them all.</p>
            </div>
          ) : (
            rows.map((t) => (
              <Link key={t.id} href={`/traces/${t.id}`} className={`${GRID} border-b border-edge/60 px-4 py-2 transition-colors last:border-b-0 hover:bg-raised`}>
                <span className="num text-xs whitespace-nowrap text-ink-mute">{fmtTime(t.ts)}</span>
                <span className="truncate font-mono text-xs text-accent">{shortId(t.id)}</span>
                <span className="truncate font-mono text-xs text-ink-mute">
                  {shortId(t.session_id)}
                  <span className="ml-1">·{t.turn}</span>
                </span>
                <span className="truncate">
                  <ModelChip model={t.model} provider={t.provider} />
                </span>
                <StatusDot status={t.status} />
                <FinishReason reason={t.derived.finish} />
                <span className="num text-right text-xs text-ink-dim">{t.derived.convLength}</span>
                <span className="num text-right text-xs text-ink-dim">{fmtTokens(t.usage?.total_tokens)}</span>
                <span className="num text-right text-xs text-ink-dim">{fmtMs(t.latency_ms)}</span>
                <span className="num text-right text-xs text-ink-dim">{fmtUsd(t.cost_usd)}</span>
                <SignalStrip trace={t} />
              </Link>
            ))
          )}

          <Pagination page={page} total={results.length} rawParams={rawParams} />
        </div>
      </div>
    </div>
  );
}
