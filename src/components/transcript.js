import { ModelChip, FinishReason } from "./badges";

/** Split content on ``` fences so code renders as code without a markdown lib. */
function RichText({ text, className = "" }) {
  if (typeof text !== "string" || !text) return null;
  const parts = text.split(/```(\w*)\n?/);
  // parts alternates: prose, lang, code, prose, lang, code...
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 3 === 0) {
      if (parts[i].trim()) {
        out.push(
          <p key={i} className={`whitespace-pre-wrap text-[13px] leading-6 ${className}`}>
            {parts[i].replace(/\n{3,}/g, "\n\n").trim()}
          </p>
        );
      }
    } else if (i % 3 === 2) {
      out.push(
        <pre key={i} className="codeblock my-2 text-ink-dim">
          {parts[i].replace(/\n$/, "")}
        </pre>
      );
    }
  }
  return <div className="space-y-2">{out}</div>;
}

function RoleLabel({ children, tone = "text-ink-mute" }) {
  return <div className={`microlabel mb-1.5 ${tone}`}>{children}</div>;
}

function prettyJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function ToolCalls({ calls }) {
  return (
    <div className="space-y-2">
      {calls.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-md border border-edge bg-bg">
          <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
            <span className="text-accent">→</span>
            <span className="font-mono text-xs text-ink">{c.function.name}</span>
            <span className="ml-auto font-mono text-2xs text-ink-mute">{c.id}</span>
          </div>
          <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-5 text-ink-dim">{prettyJson(c.function.arguments)}</pre>
        </div>
      ))}
    </div>
  );
}

function ToolResult({ message }) {
  const isError = typeof message.content === "string" && /^\s*\{\s*"error"/.test(message.content);
  const content = prettyJson(message.content);
  const long = content.length > 800;
  const body = (
    <pre className={`overflow-x-auto px-3 py-2 font-mono text-xs leading-5 ${isError ? "text-bad/90" : "text-ink-dim"}`}>
      {content}
    </pre>
  );
  return (
    <div className={`overflow-hidden rounded-md border bg-bg ${isError ? "border-bad/40" : "border-edge"}`}>
      <div className={`flex items-center gap-2 border-b px-3 py-1.5 ${isError ? "border-bad/30" : "border-edge"}`}>
        <span className={isError ? "text-bad" : "text-ink-mute"}>←</span>
        <span className="font-mono text-xs text-ink">{message.name ?? "tool result"}</span>
        {isError ? (
          <span className="rounded border border-bad/40 px-1.5 font-mono text-2xs text-bad">error</span>
        ) : null}
        <span className="ml-auto font-mono text-2xs text-ink-mute">{message.tool_call_id}</span>
      </div>
      {long ? (
        <details>
          <summary className="cursor-pointer px-3 py-1.5 text-xs text-ink-mute hover:text-ink">
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

function Message({ message }) {
  if (message.role === "user") {
    return (
      <div className="rounded-lg border border-edge bg-raised px-4 py-3">
        <RoleLabel>user</RoleLabel>
        <RichText text={message.content} className="text-ink" />
      </div>
    );
  }
  if (message.role === "assistant") {
    return (
      <div className="px-4 py-1">
        <RoleLabel>assistant</RoleLabel>
        {message.content ? <RichText text={message.content} className="text-ink-dim" /> : null}
        {message.tool_calls ? <div className={message.content ? "mt-2" : ""}><ToolCalls calls={message.tool_calls} /></div> : null}
      </div>
    );
  }
  if (message.role === "tool") {
    return (
      <div className="px-4 py-1">
        <ToolResult message={message} />
      </div>
    );
  }
  return null;
}

export function Transcript({ trace }) {
  const { request, response } = trace;
  return (
    <div className="space-y-3">
      {request.system ? (
        <details className="rounded-lg border border-edge bg-surface">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[13px] text-ink-mute transition-colors hover:text-ink">
            <span className="microlabel mr-2">system</span>
            {request.system.slice(0, 88)}…
          </summary>
          <div className="border-t border-edge px-4 py-3">
            <RichText text={request.system} className="text-ink-dim" />
          </div>
        </details>
      ) : null}

      {request.messages.map((m, i) => (
        <Message key={i} message={m} />
      ))}

      {response?.message ? (
        <div className="rounded-lg border border-accent/25 bg-surface px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="microlabel text-accent/80">response</span>
            <ModelChip model={trace.model} provider={trace.provider} />
            <FinishReason reason={response.finish_reason} />
            {trace.derived.truncated ? (
              <span className="rounded border border-warn/40 px-1.5 font-mono text-2xs text-warn">truncated</span>
            ) : null}
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
