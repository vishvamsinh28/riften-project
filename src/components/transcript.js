import { CopyButton } from "./copy-button";
import { ModelChip, FinishReason } from "./badges";

/**
 * Transcript renderer for the trace detail page: system prompt, user and
 * assistant turns, tool calls/results (errors flagged), and the response.
 * Content is rendered truthfully — code fences styled, no markdown engine.
 */

/** Split content on ``` fences so code renders as code without a markdown lib. */
function RichText({ text, className = "" }) {
  if (typeof text !== "string" || !text) return null;
  const parts = text.split(/```(\w*)\n?/);
  // parts alternates: prose, lang, code, prose, lang, code...
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 3 === 1) continue; // language tag — consumed by the code segment
    if (i % 3 === 2) {
      const code = parts[i].replace(/\n$/, "");
      out.push(
        // relative wrapper carries the margin so the copy button pins to the block
        <div key={i} className="relative my-2">
          <pre className="codeblock text-ink-dim">{code}</pre>
          <CopyButton text={code} className="absolute right-2 top-2 bg-surface pl-1" />
        </div>
      );
      continue;
    }
    if (!parts[i].trim()) continue;
    out.push(
      <p key={i} className={`whitespace-pre-wrap text-[13px] leading-relaxed ${className}`}>
        {parts[i].replace(/\n{3,}/g, "\n\n").trim()}
      </p>
    );
  }
  return <div className="space-y-2">{out}</div>;
}

/** Uppercase micro-label naming the speaker of a transcript block. */
function RoleLabel({ children, tone = "text-ink-mute" }) {
  return <div className={`microlabel mb-1.5 ${tone}`}>{children}</div>;
}

/** Pretty-print when the payload is JSON; non-JSON renders as-is by design. */
function prettyJson(str) {
  if (typeof str !== "string") return String(str ?? "");
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str; // plain-text tool output is legitimate — show it untouched
  }
}

/** Tool-call blocks. Ingested data may be malformed, so every field is optional. */
function ToolCalls({ calls }) {
  const list = Array.isArray(calls) ? calls : [];
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      {list.map((c, i) => {
        const args = prettyJson(c?.function?.arguments);
        return (
          <div key={c?.id ?? i}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-ink-mute">→</span>
              <span className="font-mono text-xs text-ink">{c?.function?.name ?? "unknown tool"}</span>
              <span className="ml-auto font-mono text-2xs text-ink-mute">{c?.id}</span>
              <CopyButton text={args} />
            </div>
            <pre className="codeblock text-ink-dim">{args}</pre>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One tool-result block. Error payloads get red framing and an "error" tag;
 * long outputs collapse behind a character count so transcripts stay scannable.
 */
function ToolResult({ message }) {
  const isError = typeof message.content === "string" && /^\s*\{\s*"error"/.test(message.content);
  const content = prettyJson(message.content);
  const long = content.length > 800;
  const body = (
    <pre className={`codeblock ${isError ? "border-bad/40 text-bad" : "text-ink-dim"}`}>{content}</pre>
  );
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className={isError ? "text-bad" : "text-ink-mute"}>←</span>
        <span className="font-mono text-xs text-ink">{message.name ?? "tool result"}</span>
        {isError ? (
          <span className="bg-bad-tint px-1.5 py-px font-mono text-2xs uppercase tracking-[0.04em] text-bad">error</span>
        ) : null}
        <span className="ml-auto font-mono text-2xs text-ink-mute">{message.tool_call_id}</span>
        <CopyButton text={content} />
      </div>
      {long ? (
        <details>
          <summary className="num cursor-pointer py-0.5 text-2xs text-ink-mute hover:text-ink">
            {content.length.toLocaleString()} chars — expand
          </summary>
          {body}
        </details>
      ) : (
        body
      )}
    </div>
  );
}

/** Dispatch one historical message to its role-specific rendering. */
function Message({ message }) {
  if (message.role === "user") {
    return (
      <div className="border-t border-edge pt-3">
        <RoleLabel>user</RoleLabel>
        <RichText text={message.content} className="text-ink-dim" />
      </div>
    );
  }
  if (message.role === "assistant") {
    return (
      <div className="border-t border-edge pt-3">
        <RoleLabel tone="text-ink-dim">assistant</RoleLabel>
        {message.content ? <RichText text={message.content} className="text-ink" /> : null}
        {message.tool_calls ? <div className={message.content ? "mt-2" : ""}><ToolCalls calls={message.tool_calls} /></div> : null}
      </div>
    );
  }
  if (message.role === "tool") {
    return (
      <div className="border-t border-edge pt-3">
        <ToolResult message={message} />
      </div>
    );
  }
  return null;
}

/**
 * The full conversation view: collapsible system prompt, replayed history,
 * and this trace's response emphasized with model + finish metadata.
 */
export function Transcript({ trace }) {
  const { request, response } = trace;
  return (
    <div className="space-y-3">
      {request.system ? (
        // button lives outside <summary> so copying never toggles the disclosure
        <div className="relative">
          <details className="border-t border-edge">
            <summary className="cursor-pointer select-none py-2.5 pr-8 text-[13px] text-ink-mute transition-colors hover:text-ink">
              <span className="microlabel mr-2">system</span>
              {request.system.slice(0, 88)}…
            </summary>
            <div className="pb-2">
              <RichText text={request.system} className="text-ink-dim" />
            </div>
          </details>
          <CopyButton text={request.system} className="absolute right-0 top-3" />
        </div>
      ) : null}

      {request.messages.map((m, i) => (
        <Message key={i} message={m} />
      ))}

      {response?.message ? (
        <div className="border-t border-edge-strong pt-3">
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="microlabel text-ink-dim">response</span>
            <ModelChip model={trace.model} provider={trace.provider} />
            <FinishReason reason={response.finish_reason} />
            {trace.derived.truncated ? (
              <span className="bg-warn-tint px-1.5 py-px font-mono text-2xs uppercase tracking-[0.04em] text-warn">truncated</span>
            ) : null}
            {/* prose when present, otherwise the raw message (tool-call-only responses) */}
            <CopyButton
              text={response.message.content ?? JSON.stringify(response.message, null, 2)}
              className="ml-auto"
            />
          </div>
          {response.message.content ? <RichText text={response.message.content} className="text-ink" /> : null}
          {response.message.tool_calls ? (
            <div className={response.message.content ? "mt-2" : ""}>
              <ToolCalls calls={response.message.tool_calls} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
