import Link from "next/link";
import { corpusStats, getStore } from "@/lib/store";
import { buildSftExport, buildPreferenceExport } from "@/lib/exports";
import { fmtUsd, fmtMs, fmtTokens, fmtCount, fmtPct, fmtDate } from "@/lib/format";
import { Histogram } from "@/components/bars";

export const dynamic = "force-dynamic";

function Tile({ label, value, sub, href }) {
  const body = (
    <>
      <div className="microlabel">{label}</div>
      <div className="num mt-1.5 text-[22px] leading-7 text-ink">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink-mute">{sub}</div> : null}
    </>
  );
  const cls = "rounded-lg border border-edge bg-surface px-4 py-3";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-edge-strong hover:bg-raised`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Card({ title, aside, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-edge bg-surface ${className}`}>
      <header className="flex items-baseline justify-between border-b border-edge px-4 py-2.5">
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        {aside ? <span className="text-xs text-ink-mute">{aside}</span> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function latencyBuckets(all) {
  const ls = all.filter((t) => t.status === 200).map((t) => t.latency_ms);
  const edges = [0, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 20000, 40000, Infinity];
  const label = (ms) => (ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`);
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    return {
      label: hi === Infinity ? `>${label(lo)}` : `${label(lo)}–${label(hi)}`,
      count: ls.filter((v) => v >= lo && v < hi).length,
    };
  });
}

function SignalRow({ label, count, total, href, tone = "text-ink-dim" }) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-raised"
    >
      <span className={`text-[13px] ${tone}`}>{label}</span>
      <span className="num text-xs text-ink-dim">
        {count}
        <span className="text-ink-mute"> · {fmtPct(count, total)}</span>
      </span>
    </Link>
  );
}

export default function OverviewPage() {
  const stats = corpusStats();
  const { all } = getStore();
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const buckets = latencyBuckets(all);
  const maxBucket = Math.max(...buckets.map((b) => b.count));
  const maxModelCount = Math.max(...stats.models.map((m) => m.count));
  const maxModelCost = Math.max(...stats.models.map((m) => m.cost));

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
        <Tile
          label="Errors"
          value={fmtPct(stats.errors, stats.traces)}
          sub={`${stats.errors} non-2xx`}
          href="/traces?status=4xx,5xx"
        />
        <Tile label="Truncated" value={stats.truncated} sub="hit max_tokens or cut" href="/traces?truncated=1" />
        <Tile label="Retries" value={stats.retries} sub={`${stats.toolErrors} tool errors`} href="/traces?feedback=retry" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Models" aside="requests · p95 · spend" className="lg:col-span-3">
          <table className="w-full">
            <thead>
              <tr className="microlabel text-left">
                <th className="pb-2 font-medium">model</th>
                <th className="pb-2 text-right font-medium">req</th>
                <th className="w-[26%] px-3 pb-2 font-medium">share</th>
                <th className="pb-2 text-right font-medium">p95</th>
                <th className="pb-2 text-right font-medium">err</th>
                <th className="pb-2 text-right font-medium">spend</th>
                <th className="w-[18%] pb-2 pl-3 font-medium">of spend</th>
              </tr>
            </thead>
            <tbody>
              {stats.models.map((m) => (
                <tr key={m.model} className="group border-t border-edge/60">
                  <td className="py-1.5 pr-2">
                    <Link href={`/traces?model=${encodeURIComponent(m.model)}`} className="font-mono text-xs text-ink group-hover:text-accent">
                      {m.model}
                    </Link>
                    <span className="ml-2 text-2xs text-ink-mute">{m.provider}</span>
                  </td>
                  <td className="num py-1.5 text-right text-xs text-ink-dim">{m.count}</td>
                  <td className="px-3 py-1.5">
                    <div className="h-1 w-full rounded-full bg-overlay">
                      <div
                        className="h-1 rounded-full bg-chart"
                        style={{ width: `${Math.max(2, (m.count / maxModelCount) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="num py-1.5 text-right text-xs text-ink-dim">{fmtMs(m.p95)}</td>
                  <td className={`num py-1.5 text-right text-xs ${m.errors ? "text-warn" : "text-ink-mute"}`}>
                    {m.errors || "·"}
                  </td>
                  <td className="num py-1.5 text-right text-xs text-ink-dim">{fmtUsd(m.cost, { coarse: true })}</td>
                  <td className="py-1.5 pl-3">
                    <div className="h-1 w-full rounded-full bg-overlay">
                      <div
                        className="h-1 rounded-full bg-chart/60"
                        style={{ width: `${Math.max(2, (m.cost / maxModelCost) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <SignalRow label="Answers retried away" count={all.filter((t) => t.derived.wasRetried).length} total={stats.traces} href="/traces?feedback=retried" />
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
              {pref.sourceCounts.retrial} retrial · {pref.sourceCounts.weak_rating} weak · {pref.sourceCounts.continuation_rejected} rejected cont
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
