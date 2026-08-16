/** Shared formatters. Safe in server and client components. */

export function fmtUsd(v, opts = {}) {
  if (v == null) return "—";
  if (v === 0) return "$0";
  if (v < 0.01 && !opts.coarse) {
    return "$" + v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  return "$" + v.toFixed(2);
}

export function fmtMs(v) {
  if (v == null) return "—";
  if (v >= 10_000) return (v / 1000).toFixed(1) + "s";
  if (v >= 1000) return (v / 1000).toFixed(2) + "s";
  return Math.round(v) + "ms";
}

export function fmtTokens(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "k";
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(v);
}

export function fmtCount(v) {
  return v.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deterministic UTC display — corpus timestamps are UTC and must not shift per viewer. */
export function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtPct(part, whole) {
  if (!whole) return "0%";
  const p = (100 * part) / whole;
  if (p > 0 && p < 1) return p.toFixed(1) + "%";
  return Math.round(p) + "%";
}

/** Short id for display: tr_9k2m4wq1ax -> 9k2m4wq1ax is too long; keep prefix+6 */
export function shortId(id) {
  if (!id) return "—";
  const [prefix, rest] = id.split("_");
  return rest ? `${prefix}_${rest.slice(0, 6)}` : id.slice(0, 9);
}
