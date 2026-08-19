import Link from "next/link";
import { PER_PAGE_OPTIONS, PER_PAGE_DEFAULT } from "@/lib/filters";
import { fmtCount } from "@/lib/format";

/** Rebuild the current query string from raw params, minus empty values. */
export function paramsFrom(rawParams) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rawParams)) if (v) params.set(k, v);
  return params;
}

/** /traces URL for the given mutation of the current params; empty query drops the "?". */
function tracesHref(rawParams, mutate) {
  const params = paramsFrom(rawParams);
  mutate(params);
  return `/traces${params.size ? `?${params}` : ""}`;
}

/**
 * Rows-per-page + range summary + prev/next links preserving every other
 * query param. Rendered as a floating pill inside the scroll-aware fixed
 * shell — it is a contextual layer, not part of the document flow.
 */
export function TracesPagination({ page, total, perPage, rawParams }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const link = (p) =>
    tracesHref(rawParams, (params) => {
      if (p > 1) params.set("page", String(p));
      else params.delete("page");
    });
  // Changing density restarts from page 1; the default density stays out of the URL.
  const perLink = (n) =>
    tracesHref(rawParams, (params) => {
      if (n !== PER_PAGE_DEFAULT) params.set("per_page", String(n));
      else params.delete("per_page");
      params.delete("page");
    });
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const btnCls = "label px-2 py-1 text-[11px] transition-colors duration-150";
  /* A boundary direction renders as a non-interactive span — pointer-events
     alone would leave a fake-disabled link in the keyboard tab order. */
  const step = (enabled, href, text) =>
    enabled ? (
      <Link href={href} className={`${btnCls} text-ink-dim hover:text-ink`}>
        {text}
      </Link>
    ) : (
      <span aria-disabled="true" className={`${btnCls} text-ink-mute`}>
        {text}
      </span>
    );
  return (
    <nav
      aria-label="Traces pagination"
      className="flex items-center gap-2 rounded-[10px] border border-edge bg-overlay/95 py-1.5 pl-4 pr-2 shadow-pop backdrop-blur"
    >
      <span className="flex items-center gap-2" aria-label="Rows per page">
        {PER_PAGE_OPTIONS.map((n) => (
          <Link
            key={n}
            href={perLink(n)}
            aria-current={n === perPage ? "true" : undefined}
            className={`num text-2xs transition-colors duration-150 ${
              n === perPage ? "text-ink" : "text-ink-mute hover:text-ink"
            }`}
          >
            {n}
          </Link>
        ))}
      </span>
      <span className="h-4 w-px bg-edge" aria-hidden="true" />
      <span className="num whitespace-nowrap text-xs text-ink-mute">
        {fmtCount(from)}–{fmtCount(to)} of {fmtCount(total)}
      </span>
      <span className="h-4 w-px bg-edge" aria-hidden="true" />
      {step(page > 1, link(page - 1), "← Prev")}
      <span className="num text-xs text-ink-mute">
        {page} / {pages}
      </span>
      {step(page < pages, link(page + 1), "Next →")}
    </nav>
  );
}
