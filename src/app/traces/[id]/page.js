import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrace } from "@/lib/store";
import { fmtUsd, fmtMs, fmtTokens, fmtTime } from "@/lib/format";
import { ModelChip, StatusDot, FinishReason, SignalStrip } from "@/components/badges";
import { Transcript } from "@/components/transcript";
import { Meta, SessionRail, RetryChain, ExportStanding } from "@/components/trace-detail";

export const dynamic = "force-dynamic";

/** Page title carries the trace id so browser history stays navigable. */
export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: id };
}

/** Strip the computed `derived` block for the raw-JSON view. */
function bareTrace(trace) {
  const { derived, ...bare } = trace;
  return bare;
}

/**
 * Trace detail: metadata strip, provider error (when failed), retry chain,
 * full transcript, session timeline, and this trace's export standing.
 */
export default async function TracePage({ params }) {
  const { id } = await params;
  const trace = getTrace(id);
  if (!trace) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/traces" className="text-[13px] text-ink-mute transition-colors hover:text-ink">
          Traces
        </Link>
        <span className="text-ink-mute">/</span>
        <h1 className="font-mono text-[15px] font-medium text-ink">{trace.id}</h1>
        <span className="num text-xs text-ink-mute">{fmtTime(trace.ts)} UTC</span>
        <span className="ml-auto">
          <SignalStrip trace={trace} />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-3 rounded-lg border border-edge bg-surface px-4 py-3 sm:grid-cols-5 lg:grid-cols-9">
        <Meta label="model">
          <ModelChip model={trace.model} provider={trace.provider} />
        </Meta>
        <Meta label="status">
          <StatusDot status={trace.status} />
        </Meta>
        <Meta label="finish">
          <FinishReason reason={trace.derived?.finish} />
        </Meta>
        <Meta label="latency">{fmtMs(trace.latency_ms)}</Meta>
        <Meta label="tokens in / out">
          {fmtTokens(trace.usage?.prompt_tokens)} / {fmtTokens(trace.usage?.completion_tokens)}
        </Meta>
        <Meta label="cost">{fmtUsd(trace.cost_usd)}</Meta>
        <Meta label="temp">{trace.request?.temperature ?? "—"}</Meta>
        <Meta label="max tokens">{trace.request?.max_tokens ?? "—"}</Meta>
        <Meta label="client">
          <span className="font-mono text-2xs">{trace.client ?? "—"}</span>
        </Meta>
      </div>

      {trace.error ? (
        <div className="rounded-lg border border-bad/40 bg-bad/5 px-4 py-3">
          <div className="microlabel text-bad">provider error · {trace.error.type ?? "unknown"}</div>
          <p className="mt-1 text-[13px] text-ink-dim">{trace.error.message ?? "No detail recorded."}</p>
        </div>
      ) : null}

      <RetryChain trace={trace} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Transcript trace={trace} />
          <details className="mt-5 rounded-lg border border-edge bg-surface">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-[13px] text-ink-mute transition-colors hover:text-ink">
              Raw trace JSON
            </summary>
            <pre className="overflow-x-auto border-t border-edge px-4 py-3 font-mono text-xs leading-5 text-ink-dim">
              {JSON.stringify(bareTrace(trace), null, 2)}
            </pre>
          </details>
        </div>
        <div className="space-y-4">
          <SessionRail trace={trace} />
          <ExportStanding trace={trace} />
        </div>
      </div>
    </div>
  );
}
