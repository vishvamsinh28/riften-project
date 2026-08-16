import Link from "next/link";
import { fmtUsd, fmtMs } from "@/lib/format";

/**
 * Per-model breakdown table for the overview: request share and spend as
 * inline single-hue bars (identity lives in the row label, not color).
 */

/** Inline magnitude bar; width floor keeps tiny values visible. */
function ShareBar({ share, dim = false }) {
  return (
    <div className="h-1 w-full rounded-full bg-overlay">
      <div
        className={`h-1 rounded-full ${dim ? "bg-chart/60" : "bg-chart"}`}
        style={{ width: `${Math.max(2, share * 100)}%` }}
      />
    </div>
  );
}

/** The model rollup table. `models` comes from corpusStats().models. */
export function ModelTable({ models }) {
  if (!models?.length) return <p className="py-4 text-[13px] text-ink-mute">No traffic yet.</p>;
  const maxCount = Math.max(1, ...models.map((m) => m.count));
  const maxCost = Math.max(1e-9, ...models.map((m) => m.cost));

  return (
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
        {models.map((m) => (
          <tr key={m.model} className="group border-t border-edge/60">
            <td className="py-1.5 pr-2">
              <Link href={`/traces?model=${encodeURIComponent(m.model)}`} className="font-mono text-xs text-ink group-hover:text-accent">
                {m.model}
              </Link>
              <span className="ml-2 text-2xs text-ink-mute">{m.provider}</span>
            </td>
            <td className="num py-1.5 text-right text-xs text-ink-dim">{m.count}</td>
            <td className="px-3 py-1.5">
              <ShareBar share={m.count / maxCount} />
            </td>
            <td className="num py-1.5 text-right text-xs text-ink-dim">{fmtMs(m.p95)}</td>
            <td className={`num py-1.5 text-right text-xs ${m.errors ? "text-warn" : "text-ink-mute"}`}>
              {m.errors || "·"}
            </td>
            <td className="num py-1.5 text-right text-xs text-ink-dim">{fmtUsd(m.cost, { coarse: true })}</td>
            <td className="py-1.5 pl-3">
              <ShareBar share={m.cost / maxCost} dim />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
