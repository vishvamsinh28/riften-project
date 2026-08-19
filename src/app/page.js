import Link from "next/link";
import { getStore } from "@/lib/store";
import { corpusStats } from "@/lib/stats";
import { buildSftExport } from "@/lib/export-sft";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { fmtUsd, fmtMs, fmtTokens, fmtCount, fmtPct, fmtDate } from "@/lib/format";
import { Histogram, DailyTraffic } from "@/components/bars";
import { Kpi, KpiStrip, Panel, SignalRow, latencyBuckets, dailyBuckets } from "@/components/overview-cards";
import { ModelTable } from "@/components/model-table";
import { PageHeader, PageBody } from "@/components/page-header";

export const dynamic = "force-dynamic";

/**
 * Dashboard: corpus vitals, daily traffic, model mix, latency shape,
 * quality signals, export readiness. Every number links into a
 * pre-filtered trace view.
 */
export default function DashboardPage() {
  const stats = corpusStats();
  const { all } = getStore();
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const latency = latencyBuckets(all);
  const daily = dailyBuckets(all);
  const maxLatency = Math.max(1, ...latency.map((b) => b.count));

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={`${fmtDate(stats.firstTs)} – ${fmtDate(stats.lastTs)} · every request the router served`}
        actions={
          <Link href="/exports" className="btn-primary inline-flex items-center gap-1.5">
            Build training data
          </Link>
        }
      />
      <PageBody className="divide-y divide-edge [&>*]:py-5 [&>*:first-child]:pt-0">
        <KpiStrip>
          <Kpi label="Traces" value={fmtCount(stats.traces)} sub={`${stats.sessions} sessions`} href="/traces" />
          <Kpi label="Spend" value={fmtUsd(stats.cost, { coarse: true })} sub={`${fmtTokens(stats.tokens)} tokens`} />
          <Kpi label="Latency p50" value={fmtMs(stats.p50)} sub={`p95 ${fmtMs(stats.p95)}`} />
          <Kpi label="Error rate" value={fmtPct(stats.errors, stats.traces)} sub={`${stats.errors} non-2xx`} href="/traces?status=4xx,5xx" />
          <Kpi label="Truncated" value={stats.truncated} sub="max_tokens or cut" href="/traces?truncated=1" />
          <Kpi label="Retries" value={stats.retries} sub={`${stats.toolErrors} tool errors`} href="/traces?feedback=retry" />
        </KpiStrip>

        <Panel id="volume" title="Request volume" aside="per day · errors in red">
          <DailyTraffic days={daily} />
        </Panel>

        <div className="grid gap-5 lg:grid-cols-5">
          <Panel id="models" title="Models" aside="requests · p95 · spend" className="lg:col-span-3" flush>
            <ModelTable models={stats.models} />
          </Panel>

          <div className="space-y-5 lg:col-span-2">
            <Panel title="Latency distribution" aside="successful requests">
              <Histogram buckets={latency} maxCount={maxLatency} />
              <div className="mt-1.5 flex justify-between">
                <span className="microlabel">0</span>
                <span className="microlabel">2s</span>
                <span className="microlabel">8s</span>
                <span className="microlabel">&gt;40s</span>
              </div>
            </Panel>

            <Panel id="quality" title="Quality signals" aside={`${stats.traces} traces`}>
              <div className="space-y-px">
                <SignalRow label="Rated strong" count={stats.ratings.strong} total={stats.traces} href="/traces?feedback=strong" dot="bg-good" />
                <SignalRow label="Rated ok" count={stats.ratings.ok} total={stats.traces} href="/traces?feedback=ok" />
                <SignalRow label="Rated weak" count={stats.ratings.weak} total={stats.traces} href="/traces?feedback=weak" dot="bg-warn" />
                <SignalRow label="Continuation accepted" count={stats.continuation.accepted} total={stats.traces} href="/traces?feedback=cont_accepted" dot="bg-good" />
                <SignalRow label="Continuation rejected" count={stats.continuation.rejected} total={stats.traces} href="/traces?feedback=cont_rejected" dot="bg-bad" />
                <SignalRow label="Answers retried away" count={stats.retriedAway} total={stats.traces} href="/traces?feedback=retried" />
                <SignalRow label="Tool errors in transcript" count={stats.toolErrors} total={stats.traces} href="/traces?tool_errors=1" dot="bg-warn" />
              </div>
            </Panel>
          </div>
        </div>

        <Panel title="Export readiness" aside="what this traffic yields">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <Link href="/exports" className="-mx-2 px-2 py-1.5 transition-colors duration-150 hover:bg-raised">
              <div className="font-doto text-[26px] font-bold leading-none text-ink">{sft.lines.length}</div>
              <div className="mt-1 text-[13px] text-ink-dim">SFT conversations</div>
              <div className="text-2xs text-ink-mute">one per session · longest clean transcript</div>
            </Link>
            <Link href="/exports" className="-mx-2 px-2 py-1.5 transition-colors duration-150 hover:bg-raised">
              <div className="font-doto text-[26px] font-bold leading-none text-ink">{pref.pairs.length}</div>
              <div className="mt-1 text-[13px] text-ink-dim">preference pairs</div>
              <div className="text-2xs text-ink-mute">
                {pref.sourceCounts.retrial ?? 0} retrial · {pref.sourceCounts.weak_rating ?? 0} weak ·{" "}
                {pref.sourceCounts.continuation_rejected ?? 0} rejected cont
              </div>
            </Link>
            <Link href="/exports#exclusions" className="-mx-2 px-2 py-1.5 transition-colors duration-150 hover:bg-raised">
              <div className="font-doto text-[26px] font-bold leading-none text-ink">{sft.excluded.length}</div>
              <div className="mt-1 text-[13px] text-ink-dim">traces excluded from SFT</div>
              <div className="text-2xs text-ink-mute">every one accounted for, by reason</div>
            </Link>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
