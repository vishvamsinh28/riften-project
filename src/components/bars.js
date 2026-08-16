/** CSS chart atoms. Server-safe; identity is carried by labels, magnitude by one hue. */

export function BarRow({ label, sub, display, share, href, color = "var(--color-chart)" }) {
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-xs text-ink">{label}</span>
        <span className="num shrink-0 text-xs text-ink-dim">
          {display}
          {sub ? <span className="ml-1.5 text-ink-mute">{sub}</span> : null}
        </span>
      </div>
      <div className="mt-1 h-1 w-full rounded-full bg-overlay">
        <div
          className="h-1 rounded-full transition-[width]"
          style={{ width: `${Math.max(1.5, share * 100)}%`, background: color }}
        />
      </div>
    </>
  );
  if (href) {
    return (
      <a href={href} className="-mx-2 block rounded-md px-2 py-1.5 hover:bg-raised">
        {inner}
      </a>
    );
  }
  return <div className="py-1.5">{inner}</div>;
}

/** Latency histogram: vertical bars, hover reveals bucket + count. */
export function Histogram({ buckets, maxCount, unit = "" }) {
  return (
    <div className="flex h-24 items-end gap-px">
      {buckets.map((b, i) => (
        <div key={i} className="group relative flex h-full flex-1 items-end">
          <div
            className="w-full rounded-t-[2px] bg-chart/70 transition-colors group-hover:bg-chart"
            style={{ height: `${b.count === 0 ? 0 : Math.max(4, (b.count / maxCount) * 100)}%` }}
          />
          <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-edge-strong bg-overlay px-2 py-1 font-mono text-2xs text-ink shadow-lg group-hover:block">
            {b.label}
            {unit} · {b.count}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Single stacked composition bar with 2px gaps; pair with a legend list. */
export function StackedBar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <div
            key={i}
            title={`${s.label}: ${s.value}`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
          />
        ))}
    </div>
  );
}
