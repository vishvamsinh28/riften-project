import { CopyButton } from "./copy-button";

/**
 * Transcript building blocks: fenced-code prose rendering and the fused
 * tool-call unit (call + its matching result in one bordered container).
 */

/** Pretty-print when the payload is JSON; non-JSON renders as-is by design. */
export function prettyJson(str) {
  if (typeof str !== "string") return String(str ?? "");
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str; // plain-text tool output is legitimate — show it untouched
  }
}

/** Split content on ``` fences so code renders as code without a markdown lib. */
export function RichText({ text, className = "" }) {
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

/** Borderless code body used inside a ToolUnit (the unit carries the frame). */
function UnitPre({ children, tone = "text-ink-dim" }) {
  return (
    <pre className={`overflow-x-auto whitespace-pre px-3 py-2 font-mono text-xs leading-5 ${tone}`}>{children}</pre>
  );
}

/**
 * One tool exchange as a single unit: the call header + arguments, and —
 * when the transcript carries it — the matching result below an internal
 * divider. Error results frame the whole unit red. `result` is optional
 * (the response's own calls have no result yet); `orphan` marks a result
 * whose call is missing from the transcript, rendered as such.
 */
export function ToolUnit({ call, result, orphan = false }) {
  const args = prettyJson(call?.function?.arguments);
  const content = result ? prettyJson(result.content) : null;
  const isError = typeof result?.content === "string" && /^\s*\{\s*"error"/.test(result.content);
  const long = (content?.length ?? 0) > 800;

  return (
    <div className={`border bg-surface ${isError ? "border-bad/40" : "border-edge"}`}>
      {/* headers carry no bottom border; each following section owns one top
          hairline, so skipped sections never stack a doubled line */}
      {!orphan ? (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-ink-mute">→</span>
          <span className="min-w-0 truncate font-mono text-xs text-ink">{call?.function?.name ?? "unknown tool"}</span>
          <span className="ml-auto min-w-0 truncate font-mono text-2xs text-ink-mute" title={call?.id}>
            {call?.id}
          </span>
          {call?.function?.arguments != null ? <CopyButton text={args} className="shrink-0" /> : null}
        </div>
      ) : null}
      {!orphan && call?.function?.arguments != null ? (
        <div className="border-t border-edge">
          <UnitPre>{args}</UnitPre>
        </div>
      ) : null}

      {result ? (
        <div className={!orphan ? `border-t ${isError ? "border-bad/40" : "border-edge"}` : ""}>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className={isError ? "text-bad" : "text-ink-mute"}>←</span>
            <span className={`min-w-0 truncate font-mono text-xs ${isError ? "text-bad" : "text-ink"}`}>
              {result.name ?? "result"}
            </span>
            {isError ? (
              <span className="shrink-0 bg-bad-tint px-1.5 py-px font-mono text-2xs uppercase tracking-[0.04em] text-bad">error</span>
            ) : null}
            {orphan ? <span className="microlabel shrink-0">call not in transcript</span> : null}
            <span className="ml-auto min-w-0 truncate font-mono text-2xs text-ink-mute" title={result.tool_call_id}>
              {result.tool_call_id}
            </span>
            <CopyButton text={content} className="shrink-0" />
          </div>
          <div className={`border-t ${isError ? "border-bad/40" : "border-edge"}`}>
            {long ? (
              <details>
                <summary className="num cursor-pointer px-3 py-1.5 text-2xs text-ink-mute hover:text-ink">
                  {content.length.toLocaleString()} chars — expand
                </summary>
                <UnitPre tone={isError ? "text-bad" : "text-ink-dim"}>{content}</UnitPre>
              </details>
            ) : (
              <UnitPre tone={isError ? "text-bad" : "text-ink-dim"}>{content}</UnitPre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A tool result whose call isn't in the transcript — labeled as exactly that. */
export function OrphanResult({ message }) {
  return <ToolUnit orphan result={message} />;
}
