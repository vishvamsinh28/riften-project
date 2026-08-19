import { NextResponse } from "next/server";
import { parseFilters, filterTraces } from "@/lib/filters";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces — filtered, paginated trace list using the same query
 * grammar as the UI: per_page (25/50/100) and page behave exactly like the
 * explorer, with page clamped to the last non-empty slice; `limit` (max 500)
 * overrides per_page for API consumers wanting bigger windows.
 * Errors return the standard { success:false } contract.
 */
export async function GET(request) {
  try {
    const sp = Object.fromEntries(request.nextUrl.searchParams);
    const filters = parseFilters(sp);
    const traces = filterTraces(filters);

    const limit = sp.limit != null ? Math.min(500, Math.max(1, parseInt(sp.limit, 10) || 100)) : filters.per_page;
    const page = Math.min(filters.page, Math.max(1, Math.ceil(traces.length / limit)));
    const start = (page - 1) * limit;
    return NextResponse.json({
      success: true,
      total: traces.length,
      page,
      limit,
      traces: traces.slice(start, start + limit),
    });
  } catch (err) {
    console.error("[api/traces]", err);
    return NextResponse.json(
      { success: false, error: "Failed to query traces. Check the corpus file and server logs." },
      { status: 500 }
    );
  }
}
