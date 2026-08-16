import Link from "next/link";
import {
  buildSftExport,
  buildPreferenceExport,
  toJsonl,
  SFT_REASONS,
  PREF_SOURCES,
  PREF_SKIP_REASONS,
} from "@/lib/exports";
import { getStore } from "@/lib/store";
import { fmtCount, fmtPct, shortId } from "@/lib/format";
import { StackedBar } from "@/components/bars";

export const dynamic = "force-dynamic";

export const metadata = { title: "Exports" };

const REASON_FILTER_LINKS = {
  non_2xx: "/traces?status=4xx,5xx",
  truncated: "/traces?truncated=1",
  retried_away: "/traces?feedback=retried",
  continuation_rejected: "/traces?feedback=cont_rejected",
  weak_rating: "/traces?feedback=weak",
};

const REASON_COLORS = {
  kept: "var(--color-chart)",
  superseded: "#5d6572",
  non_2xx: "var(--color-bad)",
  truncated: "var(--color-warn)",
  retried_away: "#8a93a3",
  continuation_rejected: "#c25a54",
  weak_rating: "#c9a13c",
  empty_response: "#5a616e",
  content_filter: "#a06058",
};

function DownloadButton({ href, children }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-2 rounded-md bg-accent/15 px-3.5 py-1.5 text-[13px] font-medium text-accent ring-1 ring-accent/40 transition-colors hover:bg-accent/25"
    >
      <svg width="12" height="12" viewBox="0 0 14 14">
        <path d="M7 1v8M3.5 6 7 9.5 10.5 6M2 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </a>
  );
}

function LinePreview({ line }) {
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-xs text-ink-mute transition-colors hover:text-ink">
        <span className="group-open:hidden">Preview a line ▸</span>
        <span className="hidden group-open:inline">Preview a line ▾</span>
      </summary>
      <pre className="codeblock mt-2 max-h-72 overflow-auto text-2xs leading-4 text-ink-dim">
        {JSON.stringify(line, null, 2)}
      </pre>
    </details>
  );
}

function ExcludedList({ entries }) {
  if (!entries.length) return null;
  const shown = entries.slice(0, 24);
  return (
    <details>
      <summary className="cursor-pointer text-2xs text-ink-mute transition-colors hover:text-ink">
        {entries.length} trace{entries.length === 1 ? "" : "s"} — show
      </summary>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shown.map((e) => (
          <Link
            key={e.trace.id}
            href={`/traces/${e.trace.id}`}
            className="rounded border border-edge bg-bg px-1.5 py-0.5 font-mono text-2xs text-accent transition-colors hover:border-edge-strong"
          >
            {shortId(e.trace.id)}
          </Link>
        ))}
        {entries.length > shown.length ? (
          <span className="px-1 py-0.5 text-2xs text-ink-mute">+{entries.length - shown.length} more</span>
        ) : null}
      </div>
    </details>
  );
}

export default function ExportsPage() {
  const { all } = getStore();
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const sftBytes = toJsonl(sft.lines).length;
  const prefBytes = pref.pairs.length ? toJsonl(pref.pairs).length : 0;

  const segments = [
    { key: "kept", label: "kept", value: sft.included.length },
    ...Object.entries(sft.reasonCounts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, label: SFT_REASONS[k].label, value: v })),
  ].map((s) => ({ ...s, color: REASON_COLORS[s.key] ?? "#5a616e" }));

  const excludedByReason = {};
  for (const e of sft.excluded) (excludedByReason[e.reason] ??= []).push(e);
  const skippedByReason = {};
  for (const s of pref.skipped) (skippedByReason[s.reason] ??= []).push(s);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Exports</h1>
        <p className="mt-0.5 text-[13px] text-ink-mute">
          {fmtCount(all.length)} raw traces distilled into training data. Nothing is dropped silently.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-edge bg-surface">
          <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">SFT dataset</h2>
              <p className="mt-0.5 text-xs text-ink-mute">
                OpenAI chat JSONL · one conversation per line · metadata on every line
              </p>
            </div>
            <DownloadButton href="/api/export/sft">riften-sft.jsonl</DownloadButton>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-baseline gap-6">
              <div>
                <div className="num text-2xl text-ink">{sft.lines.length}</div>
                <div className="text-xs text-ink-mute">conversations</div>
              </div>
              <div>
                <div className="num text-2xl text-ink">{sft.sessionsCovered}/{sft.sessionsTotal}</div>
                <div className="text-xs text-ink-mute">sessions covered</div>
              </div>
              <div>
                <div className="num text-2xl text-ink">{(sftBytes / 1024).toFixed(0)}<span className="text-sm text-ink-dim"> KB</span></div>
                <div className="text-xs text-ink-mute">on disk</div>
              </div>
            </div>
            <div className="space-y-1.5 text-[13px] leading-5 text-ink-dim">
              <p>
                <span className="text-ink">Kept:</span> per session, the longest transcript that finished clean — agent
                clients replay the whole conversation every turn, so shorter traces are prefixes of the kept line.
              </p>
              <p>
                <span className="text-ink">Dropped:</span> rejected answers (retried away, rejected continuations, rated
                weak), non-2xx requests, truncated responses.
              </p>
              {sft.maskedCount > 0 ? (
                <p>
                  <span className="text-ink">Masked:</span>{" "}
                  <span className="num text-warn">{sft.maskedCount}</span> rejected answer
                  {sft.maskedCount === 1 ? "" : "s"} the user continued from sit inside kept transcripts — exported with{" "}
                  <code className="rounded bg-bg px-1 font-mono text-xs">weight: 0</code> so they are context, never
                  training targets.
                </p>
              ) : null}
            </div>
            {sft.lines.length ? <LinePreview line={sft.lines[0]} /> : null}
          </div>
        </section>

        <section className="rounded-lg border border-edge bg-surface">
          <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Preference dataset</h2>
              <p className="mt-0.5 text-xs text-ink-mute">
                chosen vs rejected over identical context · DPO-ready JSONL
              </p>
            </div>
            <DownloadButton href="/api/export/preferences">riften-preferences.jsonl</DownloadButton>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-baseline gap-6">
              <div>
                <div className="num text-2xl text-ink">{pref.pairs.length}</div>
                <div className="text-xs text-ink-mute">pairs</div>
              </div>
              <div>
                <div className="num text-2xl text-ink">{(prefBytes / 1024).toFixed(0)}<span className="text-sm text-ink-dim"> KB</span></div>
                <div className="text-xs text-ink-mute">on disk</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {Object.entries(PREF_SOURCES).map(([key, meta]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink">{meta.label}</span>
                  <span className="mx-1 flex-1 border-b border-dashed border-edge" />
                  <span className="num text-ink-dim">{pref.sourceCounts[key]}</span>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-5 text-ink-dim">
              A pair only exists when both sides completed over the <span className="text-ink">same prompt context</span> —
              infra retries of failed requests carry no rejected answer and are skipped.
            </p>
            {pref.pairs.length ? <LinePreview line={pref.pairs[0]} /> : null}
          </div>
        </section>
      </div>

      <section id="exclusions" className="rounded-lg border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">What was excluded, and why</h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            {fmtCount(all.length)} traces in · {fmtCount(sft.lines.length)} conversations out · every drop accounted for
          </p>
        </div>
        <div className="px-5 py-4">
          <StackedBar segments={segments} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {segments.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-2xs text-ink-mute">
                <span className="size-2 rounded-[3px]" style={{ background: s.color }} />
                {s.label} <span className="num text-ink-dim">{s.value}</span>
              </span>
            ))}
          </div>

          <div className="mt-5 overflow-x-auto rounded-md border border-edge">
            <div className="grid min-w-[560px] grid-cols-[minmax(150px,190px)_56px_52px_1fr] items-center gap-x-4 border-b border-edge bg-raised px-4 py-2 md:grid-cols-[190px_56px_52px_minmax(280px,1fr)_minmax(160px,240px)]">
              <span className="microlabel">reason</span>
              <span className="microlabel text-right">traces</span>
              <span className="microlabel text-right">share</span>
              <span className="microlabel">why it&apos;s out</span>
              <span className="microlabel hidden md:block">excluded traces</span>
            </div>
            {Object.entries(sft.reasonCounts)
              .filter(([, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <div
                  key={reason}
                  className="grid min-w-[560px] grid-cols-[minmax(150px,190px)_56px_52px_1fr] items-start gap-x-4 border-b border-edge/60 px-4 py-2.5 last:border-b-0 md:grid-cols-[190px_56px_52px_minmax(280px,1fr)_minmax(160px,240px)]"
                >
                  <span className="flex items-center gap-2 text-[13px] text-ink">
                    <span className="size-2 shrink-0 rounded-[3px]" style={{ background: REASON_COLORS[reason] ?? "#5a616e" }} />
                    {REASON_FILTER_LINKS[reason] ? (
                      <Link href={REASON_FILTER_LINKS[reason]} className="hover:text-accent">
                        {SFT_REASONS[reason].label}
                      </Link>
                    ) : (
                      SFT_REASONS[reason].label
                    )}
                  </span>
                  <span className="num pt-px text-right text-[13px] text-ink-dim">{count}</span>
                  <span className="num pt-px text-right text-xs text-ink-mute">{fmtPct(count, all.length)}</span>
                  <span className="text-xs leading-5 text-ink-mute">{SFT_REASONS[reason].detail}</span>
                  <span className="col-span-full mt-1.5 md:col-span-1 md:mt-0">
                    <ExcludedList entries={excludedByReason[reason] ?? []} />
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Preference candidates that didn&apos;t pair</h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            a rejection is only trainable against an accepted answer over the same context
          </p>
        </div>
        <div className="overflow-x-auto px-5 py-2">
          {Object.entries(pref.skipCounts)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => (
              <div
                key={reason}
                className="grid min-w-[520px] grid-cols-[minmax(150px,220px)_56px_1fr] items-start gap-x-4 border-b border-edge/60 py-2.5 last:border-b-0 md:grid-cols-[220px_56px_minmax(280px,1fr)_minmax(160px,240px)]"
              >
                <span className="text-[13px] text-ink">{PREF_SKIP_REASONS[reason].label}</span>
                <span className="num text-right text-[13px] text-ink-dim">{count}</span>
                <span className="text-xs leading-5 text-ink-mute">{PREF_SKIP_REASONS[reason].detail}</span>
                <span className="col-span-full mt-1.5 md:col-span-1 md:mt-0">
                  <ExcludedList entries={skippedByReason[reason] ?? []} />
                </span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
