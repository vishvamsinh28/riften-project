import { getStore } from "@/lib/store";
import { buildSftExport } from "@/lib/export-sft";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { toJsonl } from "@/lib/export-helpers";
import { fmtCount } from "@/lib/format";
import { SftCard, PreferenceCard } from "@/components/export-cards";
import { CompositionBar, SftExclusionTable, PrefSkipTable } from "@/components/exclusion-tables";

export const dynamic = "force-dynamic";

export const metadata = { title: "Exports" };

/**
 * Export center: download both datasets and read the complete exclusion
 * accounting — what was kept, what was dropped, and why, per trace.
 */
export default function ExportsPage() {
  const { all } = getStore();
  const sft = buildSftExport();
  const pref = buildPreferenceExport();
  const sftBytes = toJsonl(sft.lines).length;
  const prefBytes = toJsonl(pref.pairs).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Exports</h1>
        <p className="mt-0.5 text-[13px] text-ink-mute">
          {fmtCount(all.length)} raw traces distilled into training data. Nothing is dropped silently.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SftCard sft={sft} bytes={sftBytes} />
        <PreferenceCard pref={pref} bytes={prefBytes} />
      </div>

      <section id="exclusions" className="rounded-lg border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">What was excluded, and why</h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            {fmtCount(all.length)} traces in · {fmtCount(sft.lines.length)} conversations out · every drop accounted for
          </p>
        </div>
        <div className="px-5 py-4">
          <CompositionBar sft={sft} />
          <SftExclusionTable sft={sft} total={all.length} />
        </div>
      </section>

      <section className="rounded-lg border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Preference candidates that didn&apos;t pair</h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            a rejection is only trainable against an accepted answer over the same context
          </p>
        </div>
        <div className="px-5 py-2">
          <PrefSkipTable pref={pref} />
        </div>
      </section>
    </div>
  );
}
