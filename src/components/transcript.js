import { CopyButton } from "./copy-button";
import { ModelChip, FinishReason } from "./badges";
import { RichText, ToolUnit, OrphanResult } from "./transcript-blocks";

/**
 * Transcript renderer for the trace detail page. A hairline spine runs down
 * the left with one node per turn — solid for the user, outlined for the
 * assistant, dim for tools, red for this trace's own response — and each
 * assistant turn fuses its tool calls with their matching results.
 */

const NODE_STYLES = {
  system: "bg-edge-strong",
  user: "bg-ink",
  assistant: "border border-ink-dim bg-bg",
  tool: "bg-ink-mute",
  response: "bg-accent-strong",
};

/** One spine-anchored turn: node in the gutter, label row, content. */
function Turn({ kind, label, labelTone = "text-ink-mute", children }) {
  return (
    <div className="relative pb-4">
      <span aria-hidden="true" className={`absolute -left-[21px] top-[3px] size-[7px] ${NODE_STYLES[kind] ?? NODE_STYLES.tool}`} />
      {label ? <div className={`microlabel mb-1.5 ${labelTone}`}>{label}</div> : null}
      {children}
    </div>
  );
}

/** Index tool-result messages by call id so calls can absorb their results. */
function indexResults(messages) {
  const byId = new Map();
  for (const m of messages) {
    if (m?.role === "tool" && m.tool_call_id && !byId.has(m.tool_call_id)) byId.set(m.tool_call_id, m);
  }
  // Only results claimed by an assistant call are consumed; the rest render alone.
  const consumed = new Set();
  for (const m of messages) {
    if (m?.role !== "assistant") continue;
    for (const c of m.tool_calls ?? []) if (c?.id && byId.has(c.id)) consumed.add(c.id);
  }
  return { byId, consumed };
}

/** An assistant turn: prose plus each tool call fused with its result. */
function AssistantTurn({ message, byId }) {
  return (
    <Turn kind="assistant" label="assistant" labelTone="text-ink-dim">
      {message.content ? <RichText text={message.content} className="text-ink" /> : null}
      {(message.tool_calls ?? []).length > 0 ? (
        <div className={`space-y-2 ${message.content ? "mt-2" : ""}`}>
          {message.tool_calls.map((c, i) => (
            <ToolUnit key={c?.id ?? i} call={c} result={c?.id ? byId.get(c.id) : undefined} />
          ))}
        </div>
      ) : null}
    </Turn>
  );
}

/**
 * The full conversation view: collapsible system prompt, replayed history
 * on the spine, and this trace's response emphasized as the payoff.
 */
export function Transcript({ trace }) {
  const { request, response } = trace;
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const { byId, consumed } = indexResults(messages);

  return (
    <div className="relative ml-1 pl-5">
      {/* the spine — stops above the response block, which carries its own bar */}
      <span aria-hidden="true" className="absolute bottom-2 left-[2px] top-1 w-px bg-edge" />

      {request.system ? (
        <div className="relative">
          {/* button lives outside <summary> so copying never toggles the disclosure */}
          <details className="pb-2">
            <summary className="cursor-pointer select-none pr-8 text-[13px] text-ink-mute transition-colors hover:text-ink">
              <span aria-hidden="true" className={`absolute -left-[21px] top-[5px] size-[7px] ${NODE_STYLES.system}`} />
              <span className="microlabel mr-2">system</span>
              {request.system.slice(0, 88)}…
            </summary>
            <div className="pt-1.5">
              <RichText text={request.system} className="text-ink-dim" />
            </div>
          </details>
          <CopyButton text={request.system} className="absolute right-0 top-0.5" />
        </div>
      ) : null}

      {messages.map((m, i) => {
        if (m?.role === "user") {
          return (
            <Turn key={i} kind="user" label="user">
              <RichText text={m.content} className="text-ink-dim" />
            </Turn>
          );
        }
        if (m?.role === "assistant") return <AssistantTurn key={i} message={m} byId={byId} />;
        if (m?.role === "tool" && !consumed.has(m.tool_call_id)) {
          return (
            <Turn key={i} kind="tool" label="tool">
              <OrphanResult message={m} />
            </Turn>
          );
        }
        return null; // consumed results render inside their assistant turn
      })}

      {response?.message ? (
        <div className="relative -ml-5 border-l-2 border-ink pl-[18px] pt-1">
          <div className="mb-1.5 flex items-center gap-2.5">
            <span aria-hidden="true" className={`absolute -left-[5px] top-[7px] size-[7px] ${NODE_STYLES.response}`} />
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
