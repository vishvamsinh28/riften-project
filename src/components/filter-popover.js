"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Popover primitives for the filter bar: a native <details>-based dropdown
 * and a checkbox row. When open, the trigger fuses with the card below it —
 * a tab on a rounded panel, square only where the two meet — and a document
 * listener closes it on any outside click or Escape. Client components.
 */

/** Dropdown shell; `active` shows a count badge and accent styling when set. */
export function Popover({ label, active, children }) {
  const ref = useRef(null);
  const [isOpen, setIsOpen] = useState(false); // mirrors details.open for the scrim
  const [mounted, setMounted] = useState(false); // portals need a client DOM

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on any pointer press outside the popover, and on Escape.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPress = (e) => {
      if (el.open && !el.contains(e.target)) el.open = false;
    };
    const onKey = (e) => {
      if (e.key === "Escape" && el.open) el.open = false;
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  /* The data plane recedes while the popover is open — same light veil as
     the nav stack. Portaled to <body> so the filter bar (z-20) stays crisp
     above it; pressing the veil closes the popover. */
  const scrim = mounted
    ? createPortal(
        <div
          aria-hidden="true"
          onPointerDown={() => {
            if (ref.current) ref.current.open = false;
          }}
          className={`fixed inset-0 z-10 bg-black/25 backdrop-blur-[1.5px] transition-opacity duration-200 ${
            isOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />,
        document.body
      )
    : null;

  return (
    <details ref={ref} onToggle={(e) => setIsOpen(e.currentTarget.open)} className="group/pop relative">
      {scrim}
      <summary
        className={`label relative flex h-[30px] cursor-pointer select-none list-none items-center gap-1.5 border px-2.5 transition-colors duration-150 [&::-webkit-details-marker]:hidden group-open/pop:z-40 group-open/pop:rounded-t-[10px] group-open/pop:border-edge-strong group-open/pop:border-b-transparent group-open/pop:bg-overlay group-open/pop:text-ink ${
          active ? "border-edge-strong text-ink" : "border-edge text-ink-mute hover:text-ink"
        }`}
      >
        {active ? <span className="size-1 rounded-full bg-accent-strong" /> : null}
        {label}
        {active ? <span className="num text-2xs text-ink-mute">{active}</span> : null}
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="opacity-60 transition-transform duration-150 group-open/pop:rotate-180">
          <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </summary>
      {/* Neck: extends the tab down past the trigger row so the card clears
          the neighboring filters — the outline stays one continuous shape. */}
      <div
        aria-hidden="true"
        className="absolute left-0 top-[calc(100%-1px)] z-40 hidden h-[12px] w-full border-x border-edge-strong bg-overlay group-open/pop:block"
      />
      <div className="pop-panel absolute left-0 top-[calc(100%+10px)] z-30 min-w-52 rounded-[14px] rounded-tl-none border border-edge-strong bg-overlay/95 p-2 backdrop-blur">
        {children}
      </div>
    </details>
  );
}

/** One checkbox option row inside a popover. */
export function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-[13px] text-ink-dim transition-colors duration-100 hover:bg-raised hover:text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="checktick" />
      {children}
    </label>
  );
}

/** Min/max input pair for a numeric range facet. */
export function RangeInputs({ label, minName, maxName, minValue, maxValue, inputMode }) {
  const cls =
    "h-7 w-20 border border-edge bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-mute transition-colors duration-150 focus:border-edge-strong";
  return (
    <div>
      <div className="microlabel mb-1">{label}</div>
      <div className="flex items-center gap-1.5">
        <input name={minName} defaultValue={minValue} placeholder="min" inputMode={inputMode} className={cls} />
        <span className="text-ink-mute">–</span>
        <input name={maxName} defaultValue={maxValue} placeholder="max" inputMode={inputMode} className={cls} />
      </div>
    </div>
  );
}
