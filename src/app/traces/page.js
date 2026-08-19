import Link from "next/link";
import { Suspense } from "react";
import { getStore } from "@/lib/store";
import { parseFilters, filterTraces, PER_PAGE_OPTIONS } from "@/lib/filters";
import { fmtCount } from "@/lib/format";
import { FilterBar } from "@/components/filter-bar";
import { TraceRows } from "@/components/trace-rows";
import { TRACE_GRID } from "@/components/trace-grid";
import { PageHeader, PageBody } from "@/components/page-header";
import { ScrollPagination } from "@/components/scroll-pagination";
import { TracesPagination, paramsFrom } from "@/components/traces-pagination";

export const dynamic = "force-dynamic";

export const metadata = { title: "Traces" };

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
      className={`microlabel flex items-center gap-1 transition-colors duration-150 hover:text-ink ${align === "right" ? "justify-end" : ""} ${active ? "text-ink-dim" : ""}`}
    >
      {label}
      {active ? <span className="text-accent">{filters.dir === "desc" ? "↓" : "↑"}</span> : null}
    </Link>
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
 * that link to each trace's full view. searchParams is a Promise in this Next version.
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
  const perPage = filters.per_page;
  const page = Math.min(filters.page, Math.max(1, Math.ceil(results.length / perPage)));
  const rows = results.slice((page - 1) * perPage, page * perPage).map(toRow);
  const query = paramsFrom(rawParams);

  return (
    <>
      <PageHeader
        title="Traces"
        sub={
          filters.session ? (
            <>
              session <span className="font-mono text-ink-dim">{filters.session}</span>
            </>
          ) : (
            "every router request, with quality signals"
          )
        }
        actions={
          <>
            <span className="microlabel">
              <span className="num text-xs text-ink-dim">{fmtCount(results.length)}</span> matching
            </span>
            {/* Plain <a>: a route-handler download, not a client navigation. */}
            <a href={`/api/export/traces${query.size ? `?${query}` : ""}`} className="btn-ghost">
              ↓ CSV
            </a>
          </>
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
              <span className="microlabel">Trace</span>
              <span className="microlabel">Session</span>
              <span className="microlabel">Model</span>
              <span className="microlabel">Status</span>
              <span className="microlabel">Finish</span>
              <SortHeader label="Msgs" field="turns" filters={filters} rawParams={rawParams} align="right" />
              <SortHeader label="Tokens" field="tokens" filters={filters} rawParams={rawParams} align="right" />
              <SortHeader label="Latency" field="latency" filters={filters} rawParams={rawParams} align="right" />
              <SortHeader label="Cost" field="cost" filters={filters} rawParams={rawParams} align="right" />
              <span className="microlabel">Signals</span>
            </div>
            <TraceRows rows={rows} />
          </div>
        </div>
      </PageBody>

      {/* Outside PageBody: its mount animation briefly makes it a transform
          containing block, which would re-anchor this fixed layer. Shown past
          the smallest density so the rows-per-page control stays reachable. */}
      {results.length > PER_PAGE_OPTIONS[0] ? (
        <ScrollPagination>
          <TracesPagination page={page} total={results.length} perPage={perPage} rawParams={rawParams} />
        </ScrollPagination>
      ) : null}
    </>
  );
}
