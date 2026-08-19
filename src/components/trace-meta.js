import { CopyButton } from "./copy-button";
import { fmtTokens } from "@/lib/format";

/**
 * Meta-strip atoms for the trace detail header: the labeled cell, the trace
 * id title with its copy affordance, and the token in/out proportion bar.
 * Server components; CopyButton is the only client island.
 */

/** One labeled metadata cell in the header strip. */
export function Meta({ label, children }) {
  return (
    <div>
      <div className="microlabel">{label}</div>
      <div className="num mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  );
}

/** The trace id for the page-title area, paired with its copy affordance. */
export function TraceIdTitle({ id }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono normal-case text-[14px]">{id}</span>
      <CopyButton text={id} />
    </span>
  );
}

/**
 * Meta cell for token usage: an input/output proportion bar (input share as
 * white fill, output share as muted gray) over a microlabel count caption.
 */
export function TokenSplit({ usage }) {
  const tokIn = usage?.prompt_tokens ?? 0;
  const tokOut = usage?.completion_tokens ?? 0;
  const total = tokIn + tokOut;
  const inPct = total > 0 ? (100 * tokIn) / total : 0;
  return (
    <div>
      <div className="microlabel">tokens in / out</div>
      <div className="mt-2 flex h-[3px] w-full bg-raised" aria-hidden="true">
        <span className="h-full bg-ink" style={{ width: `${inPct}%` }} />
        <span className="h-full bg-edge-strong" style={{ width: `${100 - inPct}%` }} />
      </div>
      {/* normal-case: unit suffixes ("1.2k") are dynamic data, never uppercased */}
      <div className="microlabel mt-1.5">
        in <span className="num normal-case text-ink-dim">{fmtTokens(usage?.prompt_tokens)}</span> · out{" "}
        <span className="num normal-case text-ink-dim">{fmtTokens(usage?.completion_tokens)}</span>
      </div>
    </div>
  );
}
