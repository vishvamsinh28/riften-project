import { NextResponse } from "next/server";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { toJsonl } from "@/lib/export-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/preferences — download the preference dataset as
 * DPO-format JSONL. Filenames carry the export date and pair count so
 * re-downloads across corpus changes stay distinguishable.
 */
export async function GET() {
  try {
    const { pairs } = buildPreferenceExport();
    const body = toJsonl(pairs);
    if (!body) {
      return NextResponse.json(
        { success: false, error: "The preference export is empty — no valid pairs in the corpus." },
        { status: 404 }
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(body, "utf8")),
        "Content-Disposition": `attachment; filename="riften-preferences-${stamp}-${pairs.length}pairs.jsonl"`,
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
