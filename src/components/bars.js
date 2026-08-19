import { fmtDate } from "@/lib/format";

/**
 * CSS chart atoms, server-safe. Identity is carried by labels and position,
 * magnitude by one hue; errors overlay in red. Tooltips are pure CSS hover.
 */

/** Shared hover tooltip bubble anchored above a chart column. */
function Tip({ children }) {
  return (
    <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap border border-edge bg-overlay px-2 py-1 font-mono text-2xs text-ink shadow-pop group-hover:block">
      {children}
    </div>
  );
}

/** Latency histogram: vertical bars, hover reveals bucket + count. */
export function Histogram({ buckets, maxCount, unit = "" }) {
  const list = Array.isArray(buckets) ? buckets : [];
  if (list.length === 0) return null;
  return (
    <div className="flex h-24 items-end gap-px border-b border-edge">
      {list.map((b, i) => (
        <div key={i} className="group relative flex h-full flex-1 items-end">
          <div
            className="bar-grow w-full bg-chart opacity-[0.85] transition-opacity duration-150 group-hover:opacity-100"
            style={{ height: `${b.count === 0 ? 0 : Math.max(4, (b.count / maxCount) * 100)}%`, animationDelay: `${i * 14}ms` }}
          />
          <Tip>{b.label}{unit} · {b.count}</Tip>
        </div>
      ))}
    </div>
  );
}

/**
 * Daily request volume with errors stacked on top in red. Bucket shape:
 * { day: ISO date, ok: n, err: n }. X labels render sparsely.
 */
export function DailyTraffic({ days }) {
  const list = Array.isArray(days) ? days : [];
  if (list.length === 0) return null;
  const max = Math.max(1, ...list.map((d) => d.ok + d.err));
  const labelEvery = Math.max(1, Math.round(list.length / 6));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px] border-b border-edge">
        {list.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
            {d.err > 0 ? (
              <div className="bar-grow w-full bg-accent-strong" style={{ height: `${(d.err / max) * 100}%`, animationDelay: `${i * 10}ms` }} />
            ) : null}
            <div
              className="bar-grow w-full bg-chart opacity-[0.85] transition-opacity duration-150 group-hover:opacity-100"
              style={{ height: `${Math.max(d.ok === 0 ? 0 : 2, (d.ok / max) * 100)}%`, animationDelay: `${i * 10}ms` }}
            />
            <Tip>{fmtDate(d.day)} · {d.ok + d.err} req{d.err ? ` · ${d.err} err` : ""}</Tip>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {list.map((d, i) =>
          i % labelEvery === 0 ? (
            <span key={d.day} className="microlabel">{fmtDate(d.day)}</span>
          ) : null
        )}
      </div>
    </div>
  );
}

/** Single stacked composition bar with hairline gaps; pair with a legend list. */
export function StackedBar({ segments }) {
  const list = (segments ?? []).filter((s) => s.value > 0);
  const total = list.reduce((s, x) => s + x.value, 0) || 1;
  if (list.length === 0) return null;
  return (
    <div className="flex h-2 w-full gap-px overflow-hidden">
      {list.map((s, i) => (
        <div
          key={i}
          title={`${s.label}: ${s.value}`}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          className="h-full min-w-[3px]"
        />
      ))}
    </div>
  );
}
