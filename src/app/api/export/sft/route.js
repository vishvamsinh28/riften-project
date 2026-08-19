import { NextResponse } from "next/server";
import { buildSftExport } from "@/lib/export-sft";
import { toJsonl } from "@/lib/export-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/sft — download the SFT dataset as OpenAI chat-format
 * JSONL, one conversation per line. Filenames carry the export date and
 * line count so re-downloads across corpus changes stay distinguishable.
 */
export async function GET() {
  try {
    const { lines } = buildSftExport();
    const body = toJsonl(lines);
    if (!body) {
      return NextResponse.json(
        { success: false, error: "The SFT export is empty — no eligible conversations in the corpus." },
        { status: 404 }
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(body, "utf8")),
        "Content-Disposition": `attachment; filename="riften-sft-${stamp}-${lines.length}conv.jsonl"`,
      },
    });
  } catch (err) {
    console.error("[api/export/sft]", err);
    return NextResponse.json(
      { success: false, error: "Failed to build the SFT export. Check the corpus file and server logs." },
      { status: 500 }
    );
  }
}
