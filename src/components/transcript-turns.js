import { RichText, ToolUnit, OrphanResult } from "./transcript-blocks";

/**
 * Turn-level rendering for the transcript: role nodes on the thread, one
 * exchange's messages in full, and the collapsed-row summary stats.
 */

const NODE = {
  system: "size-[7px] bg-edge-strong",
  user: "size-[7px] bg-ink",
  assistant: "size-[7px] border border-ink-dim bg-bg",
  tool: "size-[5px] bg-ink-mute",
};

/** Role node pinned onto the thread; offsets are relative to the pl-6 gutter. */
export function Node({ kind, className = "" }) {
  return <span aria-hidden="true" className={`absolute ${NODE[kind] ?? NODE.tool} ${className}`} />;
}

/** One exchange's messages in full. `threaded` pins role nodes to the thread. */
export function ExchangeBody({ group, byId, consumed, threaded = false }) {
  const node = (kind) => (threaded ? <Node kind={kind} className="-left-[24px] top-[3px]" /> : null);
  return (
    <div className="space-y-3">
      {group.map((m, i) => {
        if (m?.role === "user") {
          return (
            <div key={i} className="relative">
              {node("user")}
              <div className="microlabel mb-1.5 text-ink-dim">user</div>
              <RichText text={m.content} className="text-ink-dim" />
            </div>
          );
        }
        if (m?.role === "assistant") {
          return (
            <div key={i} className="relative">
              {node("assistant")}
              <div className="microlabel mb-1.5 text-ink-dim">assistant</div>
              {m.content ? <RichText text={m.content} className="text-ink" /> : null}
              {(m.tool_calls ?? []).length > 0 ? (
                <div className={`space-y-2 ${m.content ? "mt-2" : ""}`}>
                  {m.tool_calls.map((c, j) => (
                    <ToolUnit key={c?.id ?? j} call={c} result={c?.id ? byId.get(c.id) : undefined} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        }
        if (m?.role === "tool" && !consumed.has(m)) {
          return (
            <div key={i} className="relative">
              {threaded ? <Node kind="tool" className="-left-[23px] top-[4px]" /> : null}
              <OrphanResult message={m} />
            </div>
          );
        }
        return null; // consumed results render inside their assistant's unit
      })}
    </div>
  );
}

/** One-line stats for a collapsed exchange row: preview, tool count, errors. */
export function exchangeSummary(group) {
  const user = group.find((m) => m?.role === "user");
  const preview = typeof user?.content === "string" ? user.content.replace(/\s+/g, " ").slice(0, 96) : "(no user message)";
  const tools = group.reduce((n, m) => n + (m?.role === "assistant" ? (m.tool_calls?.length ?? 0) : 0), 0);
  const hasError = group.some((m) => m?.role === "tool" && typeof m.content === "string" && /^\s*\{\s*"error"/.test(m.content));
  return { preview, tools, hasError };
}
