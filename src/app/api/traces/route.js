import { NextResponse } from "next/server";
import { parseFilters, filterTraces } from "@/lib/filters";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces — filtered, paginated trace list using the same query
 * params as the UI. Errors return the standard { success:false } contract.
 */
export async function GET(request) {
  try {
    const sp = Object.fromEntries(request.nextUrl.searchParams);
    const filters = parseFilters(sp);
    const traces = filterTraces(filters);

    const limit = Math.min(500, Math.max(1, parseInt(sp.limit, 10) || 100));
    const start = (filters.page - 1) * limit;
    return NextResponse.json({
      success: true,
      total: traces.length,
      page: filters.page,
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
