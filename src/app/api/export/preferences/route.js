import { NextResponse } from "next/server";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { toJsonl } from "@/lib/export-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/preferences — download the preference dataset as
 * DPO-format JSONL. Errors return the standard contract.
 */
export async function GET() {
  try {
    const { pairs } = buildPreferenceExport();
    return new Response(toJsonl(pairs), {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": 'attachment; filename="riften-preferences.jsonl"',
      },
    });
  } catch (err) {
    console.error("[api/export/preferences]", err);
    return NextResponse.json(
      { success: false, error: "Failed to build the preference export. Check the corpus file and server logs." },
      { status: 500 }
    );
  }
}
