"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small copy-to-clipboard affordance for ids and code blocks. Renders a
 * quiet icon button (plus optional label) that flashes a tick on success.
 * Pass the exact string to copy via `text`.
 */
export function CopyButton({ text, label, className = "" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Write to the clipboard; failure just skips the tick (no clipboard API). */
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      console.warn("[copy-button] clipboard unavailable");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      aria-label={label ? `Copy ${label}` : "Copy"}
      className={`inline-flex shrink-0 items-center gap-1 font-mono text-2xs text-ink-mute transition-colors duration-150 hover:text-ink ${className}`}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="var(--color-good)" strokeWidth="1.4" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="4" y="4" width="6" height="6.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M2.5 8V2.8A1.3 1.3 0 0 1 3.8 1.5H8" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      )}
      {label ? <span>{copied ? "copied" : label}</span> : null}
    </button>
  );
}
