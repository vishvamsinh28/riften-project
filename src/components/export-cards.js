import { PREF_SOURCES } from "@/lib/export-reasons";

/**
 * The two dataset cards on the exports page: SFT and preference, each with
 * headline counts, the keep/drop story, and a collapsible line preview.
 */

/** Primary download button hitting a JSONL route handler. */
export function DownloadButton({ href, children }) {
  return (
    <a
      href={href}
      download
      className="btn-primary inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap normal-case"
    >
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M7 1v8M3.5 6 7 9.5 10.5 6M2 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </a>
  );
}

/** Collapsible pretty-printed preview of one export line. */
function LinePreview({ line }) {
  if (!line) return null;
  return (
    <details className="group">
      <summary className="microlabel cursor-pointer select-none transition-colors hover:text-ink">
        <span className="group-open:hidden">Preview a line ▸</span>
        <span className="hidden group-open:inline">Preview a line ▾</span>
      </summary>
      <pre className="codeblock mt-2 max-h-72 overflow-auto text-2xs leading-4 text-ink-dim">
        {JSON.stringify(line, null, 2)}
      </pre>
    </details>
  );
}

/** Unboxed section shell shared by both datasets. */
function CardShell({ title, subtitle, download, children }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="label text-ink-dim">{title}</h2>
          <p className="mt-1 text-2xs lowercase text-ink-mute">{subtitle}</p>
        </div>
        {download}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** One big-number stat inside a card. */
function Stat({ value, unit, label }) {
  return (
    <div>
      <div className="font-doto text-[26px] font-bold leading-none text-ink">
        {value}
        {unit ? <span className="font-mono text-xs text-ink-dim"> {unit}</span> : null}
      </div>
      <div className="microlabel mt-1.5">{label}</div>
    </div>
  );
}

/** The SFT dataset card. `sft` is buildSftExport() output; `bytes` its JSONL size. */
export function SftCard({ sft, bytes }) {
  return (
    <CardShell
      title="SFT dataset"
      subtitle="OpenAI chat JSONL · one conversation per line · metadata on every line"
      download={<DownloadButton href="/api/export/sft">riften-sft.jsonl</DownloadButton>}
    >
      <div className="flex items-baseline gap-6">
        <Stat value={sft.lines.length} label="conversations" />
        <Stat value={`${sft.sessionsCovered}/${sft.sessionsTotal}`} label="sessions covered" />
        <Stat value={(bytes / 1024).toFixed(0)} unit="KB" label="on disk" />
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
            <span className="text-ink">Masked:</span> <span className="num text-warn">{sft.maskedCount}</span> rejected
            answer{sft.maskedCount === 1 ? "" : "s"} the user continued from sit inside kept transcripts — exported with{" "}
            <code className="bg-surface px-1 font-mono text-xs text-ink-dim">weight: 0</code> so they are context, never training
            targets.
          </p>
        ) : null}
      </div>
      <LinePreview line={sft.lines[0]} />
    </CardShell>
  );
}

/** The preference dataset card. `pref` is buildPreferenceExport() output. */
export function PreferenceCard({ pref, bytes }) {
  return (
    <CardShell
      title="Preference dataset"
      subtitle="chosen vs rejected over identical context · DPO-ready JSONL"
      download={<DownloadButton href="/api/export/preferences">riften-preferences.jsonl</DownloadButton>}
    >
      <div className="flex items-baseline gap-6">
        <Stat value={pref.pairs.length} label="pairs" />
        <Stat value={(bytes / 1024).toFixed(0)} unit="KB" label="on disk" />
      </div>
      <div className="space-y-1.5">
        {Object.entries(PREF_SOURCES).map(([key, meta]) => (
          <div key={key} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-ink">{meta.label}</span>
            <span className="mx-1 flex-1 border-b border-dashed border-edge" />
            <span className="num text-xs text-ink">{pref.sourceCounts[key] ?? 0}</span>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-5 text-ink-dim">
        A pair only exists when both sides completed over the <span className="text-ink">same prompt context</span> —
        infra retries of failed requests carry no rejected answer and are skipped.
      </p>
      <LinePreview line={pref.pairs[0]} />
    </CardShell>
  );
}
