import { corpusStats } from "@/lib/stats";
import { fmtCount } from "@/lib/format";
import { IngestForm } from "@/components/ingest-form";
import { Panel } from "@/components/overview-cards";
import { PageHeader, PageBody } from "@/components/page-header";

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
    <>
      <PageHeader
        title="Ingest"
        sub={`store holds ${fmtCount(stats.traces)} traces across ${stats.sessions} sessions · every row validated on the way in`}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <h2 className="label mb-2 text-ink-dim">Paste traces</h2>
            <IngestForm />
          </div>

          <div className="space-y-5 lg:col-span-2">
            <Panel id="api" title="Or POST directly">
              <pre className="codeblock text-2xs leading-4">{CURL}</pre>
              <p className="mt-2 text-xs leading-5 text-ink-mute">
                Accepts NDJSON (one trace per line) or a JSON array. The response reports every accepted and rejected
                row with the validation error.
              </p>
            </Panel>

            <Panel id="shape" title="Trace shape" flush>
              <div>
                {FIELDS.map(([field, desc, required]) => (
                  <div key={field} className="flex items-baseline gap-3 border-b border-edge py-[5px] last:border-b-0">
                    <code className="w-40 shrink-0 font-mono text-2xs text-ink-dim">{field}</code>
                    <span className="flex-1 text-xs text-ink-mute">{desc}</span>
                    {required ? (
                      <span className="shrink-0 bg-warn-tint px-1.5 py-px font-mono text-2xs uppercase tracking-[0.04em] text-warn">req</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
