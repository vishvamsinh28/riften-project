import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrace, getSession, getStore } from "@/lib/store";
import { buildSftExport, buildPreferenceExport, SFT_REASONS } from "@/lib/exports";
import { fmtUsd, fmtMs, fmtTokens, fmtTime, shortId } from "@/lib/format";
import { ModelChip, StatusDot, FinishReason, SignalStrip } from "@/components/badges";
import { Transcript } from "@/components/transcript";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: id };
}

function Meta({ label, children }) {
  return (
    <div>
      <div className="microlabel">{label}</div>
      <div className="num mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  );
}

function ExportStanding({ trace }) {
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const included = sft.included.some((t) => t.id === trace.id);
  const exclusion = sft.excluded.find((e) => e.trace.id === trace.id);
  const pair = pref.pairs.find(
    (p) => p.metadata.chosen.trace_id === trace.id || p.metadata.rejected.trace_id === trace.id
  );
  const skip = pref.skipped.find((s) => s.trace.id === trace.id);

  return (
    <div className="rounded-lg border border-edge bg-surface">
      <div className="border-b border-edge px-4 py-2.5 text-[13px] font-medium text-ink">Export standing</div>
      <div className="space-y-2.5 px-4 py-3 text-[13px]">
        {included ? (
          <p className="text-good">
            ● In the SFT export — this is the session&apos;s longest clean transcript.
          </p>
        ) : (
          <p className="text-ink-dim">
            <span className="text-ink-mute">○ Not in SFT export.</span>{" "}
            {exclusion ? (
              <>
                <span className="text-warn">{SFT_REASONS[exclusion.reason].label}:</span>{" "}
                <span className="text-ink-mute">{SFT_REASONS[exclusion.reason].detail}</span>
              </>
            ) : null}
          </p>
        )}
        {pair ? (
          <p className={pair.metadata.chosen.trace_id === trace.id ? "text-good" : "text-bad"}>
            ● {pair.metadata.chosen.trace_id === trace.id ? "Chosen" : "Rejected"} side of a preference pair
            <span className="text-ink-mute"> · source: {pair.metadata.source.replace("_", " ")}</span>
          </p>
        ) : skip ? (
          <p className="text-ink-mute">○ Preference candidate, unpaired — {skip.reason.replaceAll("_", " ")}.</p>
        ) : null}
        <Link href="/exports" className="inline-block text-xs text-accent hover:underline">
          Exports & exclusions →
        </Link>
      </div>
    </div>
  );
}

function SessionRail({ trace }) {
  const session = getSession(trace.session_id) ?? [];
  return (
    <div className="rounded-lg border border-edge bg-surface">
      <div className="flex items-baseline justify-between border-b border-edge px-4 py-2.5">
        <span className="text-[13px] font-medium text-ink">Session</span>
        <Link href={`/traces?session=${trace.session_id}`} className="font-mono text-2xs text-accent hover:underline">
          {trace.session_id}
        </Link>
      </div>
      <div className="max-h-105 overflow-y-auto py-1.5">
        {session.map((t) => {
          const current = t.id === trace.id;
          return (
            <Link
              key={t.id}
              href={`/traces/${t.id}`}
              className={`flex items-center gap-2.5 px-4 py-1.5 text-xs transition-colors ${
                current ? "bg-overlay" : "hover:bg-raised"
              }`}
            >
              <span className="num w-5 shrink-0 text-right text-ink-mute">{t.turn}</span>
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  t.status !== 200 ? "bg-bad" : t.derived.truncated ? "bg-warn" : "bg-good"
                }`}
              />
              <span className={`truncate font-mono ${current ? "text-ink" : "text-ink-dim"}`}>{shortId(t.id)}</span>
              <span className="ml-auto shrink-0 font-mono text-2xs text-ink-mute">
                {t.derived.finish ?? t.status}
                {t.derived.isRetry ? " ↻" : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function TracePage({ params }) {
  const { id } = await params;
  const trace = getTrace(id);
  if (!trace) notFound();

  const { retriedBy } = getStore();
  const retries = (retriedBy.get(trace.id) ?? []).map(getTrace).filter(Boolean);
  const original = trace.feedback.retry_of ? getTrace(trace.feedback.retry_of) : null;

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
          <FinishReason reason={trace.derived.finish} />
        </Meta>
        <Meta label="latency">{fmtMs(trace.latency_ms)}</Meta>
        <Meta label="tokens in / out">
          {fmtTokens(trace.usage?.prompt_tokens)} / {fmtTokens(trace.usage?.completion_tokens)}
        </Meta>
        <Meta label="cost">{fmtUsd(trace.cost_usd)}</Meta>
        <Meta label="temp">{trace.request.temperature ?? "—"}</Meta>
        <Meta label="max tokens">{trace.request.max_tokens ?? "—"}</Meta>
        <Meta label="client">
          <span className="font-mono text-2xs">{trace.client ?? "—"}</span>
        </Meta>
      </div>

      {trace.error ? (
        <div className="rounded-lg border border-bad/40 bg-bad/5 px-4 py-3">
          <div className="microlabel text-bad">provider error · {trace.error.type}</div>
          <p className="mt-1 text-[13px] text-ink-dim">{trace.error.message}</p>
        </div>
      ) : null}

      {original || retries.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-2.5 text-[13px]">
          <span className="microlabel">retry chain</span>
          {original ? (
            <>
              <Link href={`/traces/${original.id}`} className="font-mono text-xs text-accent hover:underline">
                {shortId(original.id)}
              </Link>
              <span className="text-ink-mute">({original.status !== 200 ? `failed ${original.status}` : original.derived.truncated ? "truncated" : original.feedback.rating ?? "regenerated"})</span>
              <span className="text-ink-mute">→</span>
              <span className="font-mono text-xs text-ink">this</span>
            </>
          ) : null}
          {retries.map((r) => (
            <span key={r.id} className="flex items-center gap-2">
              {original ? null : <span className="font-mono text-xs text-ink">this</span>}
              <span className="text-ink-mute">→</span>
              <Link href={`/traces/${r.id}`} className="font-mono text-xs text-accent hover:underline">
                {shortId(r.id)}
              </Link>
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Transcript trace={trace} />
          <details className="mt-5 rounded-lg border border-edge bg-surface">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-[13px] text-ink-mute transition-colors hover:text-ink">
              Raw trace JSON
            </summary>
            <pre className="overflow-x-auto border-t border-edge px-4 py-3 font-mono text-xs leading-5 text-ink-dim">
              {JSON.stringify(
                (() => {
                  const { derived, ...bare } = trace;
                  return bare;
                })(),
                null,
                2
              )}
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
