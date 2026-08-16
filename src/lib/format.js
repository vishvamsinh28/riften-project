/**
 * Shared display formatters. Safe in server and client components; every
 * formatter guards nullish input and renders an em dash rather than throwing.
 */

/**
 * Format a dollar amount. Sub-cent values keep up to 4 decimals (trailing
 * zeros trimmed) unless opts.coarse forces 2; nullish renders as an em dash.
 */
export function fmtUsd(v, opts = {}) {
  if (v == null) return "—";
  if (v === 0) return "$0";
  if (v < 0.01 && !opts.coarse) {
    return "$" + v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  return "$" + v.toFixed(2);
}

/**
 * Format a millisecond duration: >=10s as "X.Xs", >=1s as "X.XXs",
 * otherwise rounded milliseconds. Nullish renders as an em dash.
 */
export function fmtMs(v) {
  if (v == null) return "—";
  if (v >= 10_000) return (v / 1000).toFixed(1) + "s";
  if (v >= 1000) return (v / 1000).toFixed(2) + "s";
  return Math.round(v) + "ms";
}

/**
 * Format a token count with tiered units: >=1M as "X.XXM", >=10k as whole
 * "Nk", >=1k as "X.Xk", else the raw number. Nullish renders as an em dash.
 */
export function fmtTokens(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "k";
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(v);
}

/** Format an integer with en-US thousands separators; em dash when nullish. */
export function fmtCount(v) {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format an ISO timestamp as "Mon D HH:MM" in UTC — deterministic across
 * viewers so server-rendered times never shift per timezone.
 */
export function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Format an ISO timestamp as a UTC "Mon D" date; em dash for empty input. */
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Render part/whole as a percentage string. Values between 0 and 1% keep
 * one decimal so small shares stay visible; an empty whole returns "0%".
 */
export function fmtPct(part, whole) {
  if (!whole) return "0%";
  const p = (100 * part) / whole;
  if (p > 0 && p < 1) return p.toFixed(1) + "%";
  return Math.round(p) + "%";
}

/** Shorten an id for display: "tr_9k2m4wq1ax" -> "tr_9k2m4w". */
export function shortId(id) {
  if (!id) return "—";
  const [prefix, rest] = id.split("_");
  return rest ? `${prefix}_${rest.slice(0, 6)}` : id.slice(0, 9);
}
