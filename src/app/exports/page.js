import { getStore } from "@/lib/store";
import { buildSftExport } from "@/lib/export-sft";
import { buildPreferenceExport } from "@/lib/export-preferences";
import { toJsonl } from "@/lib/export-helpers";
import { fmtCount } from "@/lib/format";
import { SftCard, PreferenceCard } from "@/components/export-cards";
import { CompositionBar, SftExclusionTable, PrefSkipTable } from "@/components/exclusion-tables";
import { Panel } from "@/components/overview-cards";
import { PageHeader, PageBody } from "@/components/page-header";

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
  // byte length, not UTF-16 code units — the files carry non-ASCII text
  const sftBytes = Buffer.byteLength(toJsonl(sft.lines), "utf8");
  const prefBytes = Buffer.byteLength(toJsonl(pref.pairs), "utf8");

  return (
    <>
      <PageHeader
        title="Exports"
        sub={`${fmtCount(all.length)} raw traces distilled into training data — nothing dropped silently`}
      />
      <PageBody className="divide-y divide-edge [&>*]:py-6 [&>*:first-child]:pt-0">
        <div>
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <SftCard sft={sft} bytes={sftBytes} />
            <PreferenceCard pref={pref} bytes={prefBytes} />
          </div>
          <p className="mt-6 border-t border-edge pt-3 text-2xs leading-4 text-ink-mute">
            The two files share sessions by design — a preference pair's session also yields the kept SFT line.
            Hold out eval splits by <code className="bg-surface px-1 font-mono">metadata.session_id</code> across both
            files jointly, never per file.
          </p>
        </div>

        <div id="exclusions" className="scroll-mt-16">
          <Panel
            title="What was excluded, and why"
            aside={`${fmtCount(all.length)} in · ${fmtCount(sft.lines.length)} out · every drop accounted for`}
          >
            <CompositionBar sft={sft} />
            <SftExclusionTable sft={sft} total={all.length} />
          </Panel>
        </div>

        <Panel
          title="Preference candidates that didn't pair"
          aside="a rejection is only trainable against an accepted answer over the same context"
        >
          <PrefSkipTable pref={pref} />
        </Panel>
      </PageBody>
    </>
  );
}
