import Link from "next/link";
import { fmtUsd, fmtMs } from "@/lib/format";

/**
 * Per-model breakdown table for the dashboard: request share and spend as
 * inline single-hue bars (identity lives in the row label, not color).
 * Rendered flush inside its panel like a real data table.
 */

/** Inline magnitude bar; width floor keeps tiny values visible. */
function ShareBar({ share, dim = false }) {
  return (
    <div className="h-1 w-full rounded-full bg-raised">
      <div
        className={`h-1 rounded-full ${dim ? "bg-chart/50" : "bg-chart"}`}
        style={{ width: `${Math.max(2, share * 100)}%` }}
      />
    </div>
  );
}

/** The model rollup table. `models` comes from corpusStats().models. */
export function ModelTable({ models }) {
  if (!models?.length) return <p className="px-4 py-6 text-[13px] text-ink-mute">No traffic yet.</p>;
  const maxCount = Math.max(1, ...models.map((m) => m.count));
  const maxCost = Math.max(1e-9, ...models.map((m) => m.cost));

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-edge text-left">
          <th className="py-2 pr-2 text-left text-2xs font-medium text-ink-mute">Model</th>
          <th className="py-2 pl-3 text-right text-2xs font-medium text-ink-mute">Req</th>
          <th className="w-[24%] px-3 py-2 text-2xs font-medium text-ink-mute">Share</th>
          <th className="py-2 pl-3 text-right text-2xs font-medium text-ink-mute">p95</th>
          <th className="py-2 pl-3 text-right text-2xs font-medium text-ink-mute">Err</th>
          <th className="py-2 pl-3 text-right text-2xs font-medium text-ink-mute">Spend</th>
          <th className="w-[14%] py-2 pl-3 text-left text-2xs font-medium text-ink-mute">Of spend</th>
        </tr>
      </thead>
      <tbody>
        {models.map((m) => (
          <tr key={m.model} className="group border-b border-edge/60 transition-colors duration-150 last:border-b-0 hover:bg-raised/50">
            <td className="whitespace-nowrap py-[7px] pr-2">
              <Link href={`/traces?model=${encodeURIComponent(m.model)}`} className="font-mono text-xs text-ink transition-colors group-hover:text-accent">
                {m.model}
              </Link>
              <span className="ml-2 hidden text-2xs text-ink-mute xl:inline">{m.provider}</span>
            </td>
            <td className="num py-[7px] pl-3 text-right text-xs text-ink-dim">{m.count}</td>
            <td className="px-3 py-[7px]">
              <ShareBar share={m.count / maxCount} />
            </td>
            <td className="num py-[7px] pl-3 text-right text-xs text-ink-dim">{fmtMs(m.p95)}</td>
            <td className={`num py-[7px] pl-3 text-right text-xs ${m.errors ? "text-warn" : "text-ink-mute"}`}>
              {m.errors || "·"}
            </td>
            <td className="num py-[7px] pl-3 text-right text-xs text-ink-dim">{fmtUsd(m.cost, { coarse: true })}</td>
            <td className="py-[7px] pl-3">
              <ShareBar share={m.cost / maxCost} dim />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
