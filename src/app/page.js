import Link from "next/link";
import { getStore } from "@/lib/store";
import { corpusStats } from "@/lib/stats";
import { buildSftExport } from "@/lib/export-sft";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { fmtUsd, fmtMs, fmtTokens, fmtCount, fmtPct, fmtDate } from "@/lib/format";
import { Histogram } from "@/components/bars";
import { Tile, Card, SignalRow, latencyBuckets } from "@/components/overview-cards";
import { ModelTable } from "@/components/model-table";

export const dynamic = "force-dynamic";

/**
 * Overview: corpus vitals, model mix, latency shape, quality signals, and
 * export readiness. Every number links into a pre-filtered trace view.
 */
export default function OverviewPage() {
  const stats = corpusStats();
  const { all } = getStore();
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const buckets = latencyBuckets(all);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Router traffic</h1>
          <p className="mt-0.5 text-[13px] text-ink-mute">
            {fmtDate(stats.firstTs)} – {fmtDate(stats.lastTs)} · every request the router served, with quality signals
          </p>
        </div>
        <Link
          href="/exports"
          className="rounded-md border border-edge bg-raised px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-edge-strong hover:bg-overlay"
        >
          Build training data →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Traces" value={fmtCount(stats.traces)} sub={`${stats.sessions} sessions`} href="/traces" />
        <Tile label="Spend" value={fmtUsd(stats.cost, { coarse: true })} sub={`${fmtTokens(stats.tokens)} tokens`} />
        <Tile label="Latency p50" value={fmtMs(stats.p50)} sub={`p95 ${fmtMs(stats.p95)}`} />
        <Tile label="Errors" value={fmtPct(stats.errors, stats.traces)} sub={`${stats.errors} non-2xx`} href="/traces?status=4xx,5xx" />
        <Tile label="Truncated" value={stats.truncated} sub="hit max_tokens or cut" href="/traces?truncated=1" />
        <Tile label="Retries" value={stats.retries} sub={`${stats.toolErrors} tool errors`} href="/traces?feedback=retry" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Models" aside="requests · p95 · spend" className="lg:col-span-3">
          <ModelTable models={stats.models} />
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Latency" aside="successful requests">
            <Histogram buckets={buckets} maxCount={maxBucket} />
            <div className="mt-1.5 flex justify-between">
              <span className="microlabel">0</span>
              <span className="microlabel">2s</span>
              <span className="microlabel">8s</span>
              <span className="microlabel">&gt;40s</span>
            </div>
          </Card>

          <Card title="Quality signals" aside={`${stats.traces} traces`}>
            <div className="space-y-0.5">
              <SignalRow label="Rated strong" count={stats.ratings.strong} total={stats.traces} href="/traces?feedback=strong" tone="text-good" />
              <SignalRow label="Rated ok" count={stats.ratings.ok} total={stats.traces} href="/traces?feedback=ok" />
              <SignalRow label="Rated weak" count={stats.ratings.weak} total={stats.traces} href="/traces?feedback=weak" tone="text-warn" />
              <SignalRow label="Continuation accepted" count={stats.continuation.accepted} total={stats.traces} href="/traces?feedback=cont_accepted" tone="text-good" />
              <SignalRow label="Continuation rejected" count={stats.continuation.rejected} total={stats.traces} href="/traces?feedback=cont_rejected" tone="text-bad" />
              <SignalRow label="Answers retried away" count={stats.retriedAway} total={stats.traces} href="/traces?feedback=retried" />
              <SignalRow label="Tool errors in transcript" count={stats.toolErrors} total={stats.traces} href="/traces?tool_errors=1" tone="text-warn" />
            </div>
          </Card>
        </div>
      </div>

      <Card title="Export readiness" aside="what this traffic yields">
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <Link href="/exports" className="-mx-2 rounded-md px-2 py-1.5 hover:bg-raised">
            <div className="num text-xl text-ink">{sft.lines.length}</div>
            <div className="mt-0.5 text-[13px] text-ink-dim">SFT conversations</div>
            <div className="text-xs text-ink-mute">one per session · longest clean transcript</div>
          </Link>
          <Link href="/exports" className="-mx-2 rounded-md px-2 py-1.5 hover:bg-raised">
            <div className="num text-xl text-ink">{pref.pairs.length}</div>
            <div className="mt-0.5 text-[13px] text-ink-dim">preference pairs</div>
            <div className="text-xs text-ink-mute">
              {pref.sourceCounts.retrial ?? 0} retrial · {pref.sourceCounts.weak_rating ?? 0} weak ·{" "}
              {pref.sourceCounts.continuation_rejected ?? 0} rejected cont
            </div>
          </Link>
          <Link href="/exports#exclusions" className="-mx-2 rounded-md px-2 py-1.5 hover:bg-raised">
            <div className="num text-xl text-ink">{sft.excluded.length}</div>
            <div className="mt-0.5 text-[13px] text-ink-dim">traces excluded from SFT</div>
            <div className="text-xs text-ink-mute">every one accounted for, by reason</div>
          </Link>
        </div>
      </Card>
    </div>
  );
}
