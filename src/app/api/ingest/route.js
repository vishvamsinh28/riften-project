import { NextResponse } from "next/server";
import { ingestRows } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Standard error response for this route's contract. */
function fail(error, status) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Parse an NDJSON body into rows, tracking per-line parse failures AND each
 * parsed row's physical line number, so every reported row number — parse
 * or validation — points at the same line of the submitted body.
 */
function parseNdjson(text) {
  const rows = [];
  const lineOf = []; // rows[i] came from physical line lineOf[i]
  const parseErrors = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const value = JSON.parse(line);
      if (Array.isArray(value)) {
        parseErrors.push({ row: i + 1, id: null, error: "line is a JSON array — send Content-Type: application/json, or one object per line" });
        return;
      }
      rows.push(value);
      lineOf.push(i + 1);
    } catch {
      parseErrors.push({ row: i + 1, id: null, error: "invalid JSON" });
    }
  });
  return { rows, lineOf, parseErrors };
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
  let lineOf = null;
  let parseErrors = [];
  try {
    if (isSingleJson) {
      const body = await request.json();
      rows = Array.isArray(body) ? body : [body];
    } else {
      const text = await request.text();
      ({ rows, lineOf, parseErrors } = parseNdjson(text));
      if (rows.length === 0 && parseErrors.length === 0) return fail("empty body", 400);
    }
  } catch (err) {
    console.error("[api/ingest] unreadable body:", err.message);
    return fail("body is not valid JSON", 400);
  }

  try {
    const result = ingestRows(rows);
    // NDJSON validation rejects carry ordinals — map back to physical lines.
    const validationRejects = lineOf
      ? result.rejected.map((r) => ({ ...r, row: lineOf[r.row - 1] ?? r.row }))
      : result.rejected;
    const rejected = [...parseErrors, ...validationRejects].sort((a, b) => a.row - b.row);
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
