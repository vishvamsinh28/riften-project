import Link from "next/link";
import { Suspense } from "react";
import { getStore } from "@/lib/store";
import { parseFilters, filterTraces } from "@/lib/filters";
import { fmtCount } from "@/lib/format";
import { FilterBar } from "@/components/filter-bar";
import { TraceRows } from "@/components/trace-rows";
import { TRACE_GRID } from "@/components/trace-grid";
import { PageHeader, PageBody } from "@/components/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Traces" };

const PAGE_SIZE = 50;

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
      className={`flex items-center gap-1 text-2xs font-medium text-ink-mute transition-colors duration-150 hover:text-ink ${align === "right" ? "justify-end" : ""} ${active ? "text-ink-dim" : ""}`}
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
  const btn = (enabled) =>
    `rounded-md border border-edge px-2 py-1 text-xs transition-colors duration-150 ${
      enabled ? "text-ink-dim hover:bg-raised hover:text-ink" : "pointer-events-none text-ink-mute/60"
    }`;
  return (
    <div className="flex items-center justify-between border-t border-edge px-6 py-2">
      <span className="text-xs text-ink-mute">
        {fmtCount(from)}–{fmtCount(to)} of {fmtCount(total)}
      </span>
      <div className="flex items-center gap-1">
        <Link href={page > 1 ? link(page - 1) : "#"} aria-disabled={page <= 1} className={btn(page > 1)}>
          ← Prev
        </Link>
        <span className="num px-2 text-xs text-ink-mute">
          {page} / {pages}
        </span>
        <Link href={page < pages ? link(page + 1) : "#"} aria-disabled={page >= pages} className={btn(page < pages)}>
          Next →
        </Link>
      </div>
    </div>
  );
}

/** Strip transcript bodies so the client table gets slim, fast row payloads. */
function toRow(t) {
  return {
    id: t.id,
    session_id: t.session_id,
    turn: t.turn,
    ts: t.ts,
    model: t.model,
    provider: t.provider,
    status: t.status,
    latency_ms: t.latency_ms,
    cost_usd: t.cost_usd,
    tokens: t.usage?.total_tokens ?? null,
    feedback: t.feedback,
    derived: t.derived,
  };
}

/**
 * The trace explorer: URL-driven filters, sortable columns, paginated rows
 * that open a peek drawer. searchParams is a Promise in this Next version.
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
  const rows = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toRow);

  return (
    <>
      <PageHeader
        title="Traces"
        sub={
          filters.session ? (
            <>
              session <span className="font-mono text-accent">{filters.session}</span>
            </>
          ) : (
            "every router request, with quality signals"
          )
        }
        actions={
          <span className="text-xs text-ink-mute">
            <span className="num text-ink-dim">{fmtCount(results.length)}</span> matching
          </span>
        }
      />
      <PageBody className="group space-y-3">
        <Suspense fallback={<div className="h-[30px]" />}>
          <FilterBar models={models} />
        </Suspense>

        <div className="-mx-6 overflow-x-auto transition-opacity duration-200 group-has-data-pending:opacity-50">
          <div className="min-w-[1220px]">
            <div className={`${TRACE_GRID} border-b border-edge px-6 py-2`}>
              <SortHeader label="Time" field="ts" filters={filters} rawParams={rawParams} />
              <span className="text-2xs font-medium text-ink-mute">Trace</span>
              <span className="text-2xs font-medium text-ink-mute">Session</span>
              <span className="text-2xs font-medium text-ink-mute">Model</span>
              <span className="text-2xs font-medium text-ink-mute">Status</span>
              <span className="text-2xs font-medium text-ink-mute">Finish</span>
              <SortHeader label="Msgs" field="turns" filters={filters} rawParams={rawParams} align="right" />
              <SortHeader label="Tokens" field="tokens" filters={filters} rawParams={rawParams} align="right" />
              <SortHeader label="Latency" field="latency" filters={filters} rawParams={rawParams} align="right" />
              <SortHeader label="Cost" field="cost" filters={filters} rawParams={rawParams} align="right" />
              <span className="text-2xs font-medium text-ink-mute">Signals</span>
            </div>
            <TraceRows rows={rows} />
            <Pagination page={page} total={results.length} rawParams={rawParams} />
          </div>
        </div>
      </PageBody>
    </>
  );
}
