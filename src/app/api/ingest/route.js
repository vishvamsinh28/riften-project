import { NextResponse } from "next/server";
import { ingestRows } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Standard error response for this route's contract. */
function fail(error, status) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Parse an NDJSON body into rows, tracking per-line parse failures so the
 * caller learns exactly which lines were unreadable.
 */
function parseNdjson(text) {
  const rows = [];
  const parseErrors = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch {
      parseErrors.push({ row: i + 1, id: null, error: "invalid JSON" });
    }
  });
  return { rows, parseErrors };
}

/**
 * POST /api/ingest — accepts a JSON array of traces, a single trace object,
 * or NDJSON (one JSON object per line). Every row is validated; the response
 * reports each accepted and rejected row with its reason.
 */
export async function POST(request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isSingleJson = contentType.includes("json") && !contentType.includes("ndjson");

  let rows;
  let parseErrors = [];
  try {
    if (isSingleJson) {
      const body = await request.json();
      rows = Array.isArray(body) ? body : [body];
    } else {
      const text = await request.text();
      ({ rows, parseErrors } = parseNdjson(text));
      if (rows.length === 0 && parseErrors.length === 0) return fail("empty body", 400);
    }
  } catch (err) {
    console.error("[api/ingest] unreadable body:", err.message);
    return fail("body is not valid JSON", 400);
  }

  try {
    const result = ingestRows(rows);
    const rejected = [...parseErrors, ...result.rejected];
    const total = result.total + parseErrors.length;
    // Nothing accepted from a non-empty body is a data-level failure, but the
    // per-row rejection detail still ships so the caller can fix its rows.
    if (result.accepted === 0 && total > 0) {
      return NextResponse.json(
        { success: false, error: "Every row was rejected.", accepted: 0, rejected, total },
        { status: 422 }
      );
    }
    return NextResponse.json({ success: true, accepted: result.accepted, rejected, total });
  } catch (err) {
    console.error("[api/ingest]", err);
    return fail("Ingest failed while persisting rows. Check server logs.", 500);
  }
}
