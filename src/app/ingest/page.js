import { corpusStats } from "@/lib/stats";
import { fmtCount } from "@/lib/format";
import { IngestForm } from "@/components/ingest-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ingest" };

const CURL = `curl -X POST http://localhost:3000/api/ingest \\
  -H 'Content-Type: application/x-ndjson' \\
  --data-binary @traces.ndjson`;

const FIELDS = [
  ["id", "unique trace id", true],
  ["session_id", "conversation the trace belongs to", true],
  ["ts", "ISO-8601 timestamp", true],
  ["model", "model that served (or failed) the request", true],
  ["status", "HTTP status from the provider", true],
  ["request.messages", "replayed transcript, OpenAI roles", true],
  ["latency_ms", "wall-clock latency", true],
  ["request.system / tools", "system prompt, tool schemas", false],
  ["response", "assistant message + finish_reason", false],
  ["usage / cost_usd", "token counts and computed cost", false],
  ["truncated", "stream cut before completion", false],
  ["feedback.rating", "weak · ok · strong", false],
  ["feedback.retry_of", "id of the answer this retry replaced", false],
  ["feedback.continuation", "accepted · rejected", false],
];

/**
 * Ingest page: the paste-in form plus the direct POST endpoint recipe and
 * the accepted trace shape, with live counts of what the store holds.
 */
export default function IngestPage() {
  const stats = corpusStats();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Ingest</h1>
        <p className="mt-0.5 text-[13px] text-ink-mute">
          The store currently holds <span className="num text-ink-dim">{fmtCount(stats.traces)}</span> traces across{" "}
          <span className="num text-ink-dim">{stats.sessions}</span> sessions. Rows are validated on the way in —
          malformed rows are rejected with a reason, never silently dropped.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h2 className="mb-2 text-[13px] font-medium text-ink">Paste traces</h2>
          <IngestForm />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-lg border border-edge bg-surface">
            <h2 className="border-b border-edge px-4 py-2.5 text-[13px] font-medium text-ink">Or POST directly</h2>
            <div className="px-4 py-3">
              <pre className="codeblock text-2xs leading-4">{CURL}</pre>
              <p className="mt-2 text-xs leading-5 text-ink-mute">
                Accepts NDJSON (one trace per line) or a JSON array. The response reports every accepted and rejected
                row with the validation error.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-edge bg-surface">
            <h2 className="border-b border-edge px-4 py-2.5 text-[13px] font-medium text-ink">Trace shape</h2>
            <div className="px-4 py-2">
              {FIELDS.map(([field, desc, required]) => (
                <div key={field} className="flex items-baseline gap-3 border-b border-edge/60 py-1.5 last:border-b-0">
                  <code className="w-40 shrink-0 font-mono text-2xs text-accent">{field}</code>
                  <span className="flex-1 text-xs text-ink-mute">{desc}</span>
                  {required ? <span className="microlabel shrink-0 text-warn/80">req</span> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
