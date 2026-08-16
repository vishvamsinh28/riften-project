import { NextResponse } from "next/server";
import { filterTraces, parseFilters } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/traces — filtered trace list (same query params as the UI). */
export async function GET(request) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const filters = parseFilters(sp);
  const traces = filterTraces(filters);
  const limit = Math.min(500, parseInt(sp.limit, 10) || 100);
  const start = (filters.page - 1) * limit;
  return NextResponse.json({
    total: traces.length,
    page: filters.page,
    limit,
    traces: traces.slice(start, start + limit).map(({ derived, ...t }) => ({ ...t, derived })),
  });
}
