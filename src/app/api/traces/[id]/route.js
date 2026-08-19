import { NextResponse } from "next/server";
import { getTrace } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces/[id] — one full trace (request, response, derived) for
 * external consumers (the UI navigates to the full page instead). 404s with
 * the standard contract when the id is unknown.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const trace = getTrace(id);
    if (!trace) {
      return NextResponse.json({ success: false, error: `No trace with id ${id}.` }, { status: 404 });
    }
    return NextResponse.json({ success: true, trace });
  } catch (err) {
    console.error("[api/traces/id]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load the trace. Check server logs." },
      { status: 500 }
    );
  }
}
