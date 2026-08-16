import { NextResponse } from "next/server";
import { ingestRows } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingest
 * Accepts a JSON array of traces, a single trace object, or NDJSON
 * (content-type application/x-ndjson or text/plain, one JSON object per line).
 */
export async function POST(request) {
  const contentType = request.headers.get("content-type") ?? "";
  let rows;
  try {
    if (contentType.includes("json") && !contentType.includes("ndjson")) {
      const body = await request.json();
      rows = Array.isArray(body) ? body : [body];
    } else {
      const text = await request.text();
      const lines = text.split("\n").filter((l) => l.trim());
      rows = [];
      const parseErrors = [];
      lines.forEach((line, i) => {
        try {
          rows.push(JSON.parse(line));
        } catch {
          parseErrors.push({ row: i + 1, id: null, error: "invalid JSON" });
        }
      });
      if (rows.length === 0 && parseErrors.length === 0) {
        return NextResponse.json({ error: "empty body" }, { status: 400 });
      }
      const result = ingestRows(rows);
      result.rejected = [...parseErrors, ...result.rejected];
      result.total += parseErrors.length;
      return NextResponse.json(result, { status: result.accepted > 0 ? 200 : 422 });
    }
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }
  const result = ingestRows(rows);
  return NextResponse.json(result, { status: result.accepted > 0 || result.total === 0 ? 200 : 422 });
}
