import { CopyButton } from "./copy-button";
import { ModelChip, FinishReason } from "./badges";
import { RichText, ToolUnit } from "./transcript-blocks";
import { Node, ExchangeBody, exchangeSummary } from "./transcript-turns";
import { ExpandAll } from "./expand-all";

/**
 * Transcript renderer shaped like the export logic: earlier exchanges are
 * the replayed prefix (collapsed rows), the final exchange and response
 * are the payoff. One hairline thread runs down the left connecting every
 * turn — role nodes sit on it, and it thickens into the response's bar.
 */

/** Group messages into exchanges: each user message opens a new one. */
function toExchanges(messages) {
  const groups = [];
  for (const m of messages) {
    if (m?.role === "user" || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push(m);
  }
  return groups;
}

/** Index tool-result messages by call id so calls can absorb their results. */
function indexResults(messages) {
  const byId = new Map();
  for (const m of messages) {
    if (m?.role === "tool" && m.tool_call_id && !byId.has(m.tool_call_id)) byId.set(m.tool_call_id, m);
  }
  // Consume by message identity, not id — a duplicate result sharing a call
  // id must still render (as an orphan) instead of silently disappearing.
  const consumed = new Set();
  for (const m of messages) {
    if (m?.role !== "assistant") continue;
    for (const c of m.tool_calls ?? []) {
      const r = c?.id ? byId.get(c.id) : undefined;
      if (r) consumed.add(r);
    }
  }
  return { byId, consumed };
}


/** The full conversation: one thread from system prompt to response. */
export function Transcript({ trace }) {
  const { request, response } = trace;
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const { byId, consumed } = indexResults(messages);
  const exchanges = toExchanges(messages);
  const context = exchanges.slice(0, -1);
  const current = exchanges[exchanges.length - 1] ?? [];

  return (
    <div>
      <div className="relative pb-5 pl-6">
        {/* the thread — one continuous hairline the role nodes sit on; it
            runs to the wrapper's bottom, where the response bar takes over.
            Absolute, so the spacing flow lives on the inner div. */}
        <span aria-hidden="true" className="absolute bottom-0 left-[3px] top-1 w-px bg-edge-strong" />
        <div className="space-y-5">

        {request.system ? (
          <div className="relative">
            <Node kind="system" className="-left-[24px] top-[4px]" />
            {/* button lives outside <summary> so copying never toggles the disclosure */}
            <details>
              <summary className="cursor-pointer select-none pr-8 text-[13px] text-ink-mute transition-colors hover:text-ink">
                <span className="microlabel mr-2">system</span>
                {request.system.slice(0, 88)}
                {request.system.length > 88 ? "…" : ""}
              </summary>
              <div className="pt-2">
                <RichText text={request.system} className="text-ink-dim" />
              </div>
            </details>
            <CopyButton text={request.system} className="absolute right-0 top-0.5" />
          </div>
        ) : null}

        {context.length > 0 ? (
          <section id="replayed-context">
            <div className="flex items-baseline gap-3 border-b border-edge pb-1.5">
              <h3 className="label text-ink-dim">Replayed context</h3>
              <span className="text-2xs text-ink-mute">
                {context.length} earlier exchange{context.length === 1 ? "" : "s"} — the prefix the agent client resent
              </span>
              <span className="ml-auto">
                <ExpandAll targetId="replayed-context" />
              </span>
            </div>
            {context.map((group, i) => {
              const s = exchangeSummary(group);
              return (
                <details key={i} className="group/turn relative border-b border-edge/70">
                  <Node kind="tool" className="-left-[23px] top-[13px]" />
                  <summary className="flex cursor-pointer select-none items-center gap-3 py-2 pr-1">
                    <span className="num shrink-0 text-2xs text-ink-mute">{i + 1}</span>
                    <span className="min-w-0 truncate text-[13px] text-ink-mute transition-colors group-hover/turn:text-ink-dim">
                      {s.preview}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {s.hasError ? <span className="microlabel text-bad">tool error</span> : null}
                      {s.tools > 0 ? <span className="microlabel">{s.tools} tool{s.tools === 1 ? "" : "s"}</span> : null}
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="opacity-60 transition-transform duration-150 group-open/turn:rotate-180">
                        <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    </span>
                  </summary>
                  <div className="pb-3 pl-4">
                    <ExchangeBody group={group} byId={byId} consumed={consumed} />
                  </div>
                </details>
              );
            })}
          </section>
        ) : null}

        {current.length > 0 ? (
          <section>
            <div className="border-b border-edge pb-1.5">
              <h3 className="label text-ink-dim">This request</h3>
            </div>
            <div className="pt-3">
              <ExchangeBody group={current} byId={byId} consumed={consumed} threaded />
            </div>
          </section>
        ) : null}
        </div>
      </div>

      {response?.message ? (
        <div className="relative ml-[3px] border-l-2 border-ink pl-[19px]">
          <div className="mb-1.5 flex items-center gap-2.5 pt-0.5">
            <span className="microlabel text-ink">response</span>
            <ModelChip model={trace.model} provider={trace.provider} />
            <FinishReason reason={response.finish_reason} />
            {trace.derived.truncated ? (
              <span className="bg-warn-tint px-1.5 py-px font-mono text-2xs uppercase tracking-[0.04em] text-warn">truncated</span>
            ) : null}
            {/* prose when present, otherwise the raw message (tool-call-only responses) */}
            <CopyButton text={response.message.content ?? JSON.stringify(response.message, null, 2)} className="ml-auto" />
          </div>
          {response.message.content ? <RichText text={response.message.content} className="text-ink" /> : null}
          {(response.message.tool_calls ?? []).length > 0 ? (
            <div className={`space-y-2 ${response.message.content ? "mt-2" : ""}`}>
              {response.message.tool_calls.map((c, i) => (
                <ToolUnit key={c?.id ?? i} call={c} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
