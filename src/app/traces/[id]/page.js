import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrace } from "@/lib/store";
import { fmtUsd, fmtMs, fmtTokens, fmtTime } from "@/lib/format";
import { ModelChip, StatusDot, FinishReason, SignalStrip } from "@/components/badges";
import { Transcript } from "@/components/transcript";
import { Meta, SessionRail, RetryChain, ExportStanding } from "@/components/trace-detail";
import { PageHeader, PageBody } from "@/components/page-header";

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
 * Trace detail (full view): metadata strip, provider error when failed,
 * retry chain, transcript, session timeline, and export standing.
 */
export default async function TracePage({ params }) {
  const { id } = await params;
  const trace = getTrace(id);
  if (!trace) notFound();

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link href="/traces" className="ulink">
              Traces
            </Link>
            <span className="text-ink-mute">/</span>
            <span className="font-mono normal-case text-[14px]">{trace.id}</span>
          </span>
        }
        sub={`${fmtTime(trace.ts)} UTC`}
        actions={<SignalStrip trace={trace} />}
      />
      <PageBody className="space-y-4">
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 border-b border-edge pb-4 sm:grid-cols-5 lg:grid-cols-9">
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
          <div className="border border-bad/40 bg-bad-tint px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="microlabel text-bad">provider error</span>
              <span className="font-mono text-2xs text-bad">{trace.error.type ?? "unknown"}</span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{trace.error.message ?? "No detail recorded."}</p>
          </div>
        ) : null}

        <RetryChain trace={trace} />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Transcript trace={trace} />
            <details className="mt-5">
              <summary className="label cursor-pointer select-none text-ink-mute transition-colors duration-150 hover:text-ink">
                Raw trace JSON
              </summary>
              <pre className="codeblock mt-2 max-h-96 overflow-auto text-2xs leading-4 text-ink-dim">
                {JSON.stringify(bareTrace(trace), null, 2)}
              </pre>
            </details>
          </div>
          <div className="space-y-6 lg:border-l lg:border-edge lg:pl-6">
            <SessionRail trace={trace} />
            <ExportStanding trace={trace} />
          </div>
        </div>
      </PageBody>
    </>
  );
}
