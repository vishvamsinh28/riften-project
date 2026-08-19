import { NextResponse } from "next/server";
import { parseFilters, filterTraces } from "@/lib/filters";

export const dynamic = "force-dynamic";

/* Column order is the CSV contract; each accessor pulls one flat field. */
const COLUMNS = [
  ["id", (t) => t.id],
  ["session_id", (t) => t.session_id],
  ["turn", (t) => t.turn],
  ["ts", (t) => t.ts],
  ["model", (t) => t.model],
  ["provider", (t) => t.provider],
  ["status", (t) => t.status],
  ["finish_reason", (t) => t.response?.finish_reason ?? null],
  ["latency_ms", (t) => t.latency_ms],
  ["total_tokens", (t) => t.usage?.total_tokens ?? null],
  ["cost_usd", (t) => t.cost_usd ?? null],
  ["rating", (t) => t.feedback?.rating ?? null],
  ["continuation", (t) => t.feedback?.continuation ?? null],
  ["truncated", (t) => t.derived?.truncated === true],
  ["retry_of", (t) => t.feedback?.retry_of ?? null],
];

/**
 * RFC 4180 field escaping: quote when a comma, quote, or newline appears,
 * doubling internal quotes. Nullish serializes as the empty field.
 */
function csvField(v) {
  if (v == null) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection (OWASP): ingested traces are
  // untrusted, and Excel executes fields starting with = + - @ or tab/CR.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * GET /api/export/traces — download the currently filtered trace view as
 * CSV. Accepts the same query string as /traces (page/per_page are ignored:
 * the export always covers every matching row). Errors return the standard
 * contract.
 */
export async function GET(request) {
  try {
    // Flatten to a plain object; repeated keys collapse to the last value,
    // matching the traces page.
    const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
    const header = COLUMNS.map(([name]) => name).join(",");
    const rows = filterTraces(filters).map((t) =>
      COLUMNS.map(([, pick]) => csvField(pick(t))).join(",")
    );
    return new Response([header, ...rows].join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="riften-traces.csv"',
      },
    });
  } catch (err) {
    console.error("[api/export/traces]", err);
    return NextResponse.json(
      { success: false, error: "Failed to build the trace CSV export. Check the corpus file and server logs." },
      { status: 500 }
    );
  }
}
