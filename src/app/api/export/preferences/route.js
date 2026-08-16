import { buildPreferenceExport, toJsonl } from "@/lib/exports";

export const dynamic = "force-dynamic";

/** GET /api/export/preferences — chosen/rejected pairs, JSONL. */
export async function GET() {
  const { pairs } = buildPreferenceExport();
  return new Response(toJsonl(pairs), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="riften-preferences.jsonl"',
    },
  });
}
