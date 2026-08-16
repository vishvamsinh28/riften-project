import { buildSftExport, toJsonl } from "@/lib/exports";

export const dynamic = "force-dynamic";

/** GET /api/export/sft — OpenAI chat-format JSONL, one conversation per line. */
export async function GET() {
  const { lines } = buildSftExport();
  return new Response(toJsonl(lines), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="riften-sft.jsonl"',
    },
  });
}
