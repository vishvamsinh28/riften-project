import { NextResponse } from "next/server";
import { buildSftExport } from "@/lib/export-sft";
import { toJsonl } from "@/lib/export-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/sft — download the SFT dataset as OpenAI chat-format
 * JSONL, one conversation per line. Errors return the standard contract.
 */
export async function GET() {
  try {
    const { lines } = buildSftExport();
    return new Response(toJsonl(lines), {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": 'attachment; filename="riften-sft.jsonl"',
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
