"use client";

/**
 * Popover primitives for the filter bar: a native <details>-based dropdown
 * (no outside-click library needed) and a checkbox row. Client components.
 */

/** Dropdown shell; `active` shows a count badge and accent styling when set. */
export function Popover({ label, active, children }) {
  return (
    <details className="group/pop relative">
      <summary
        className={`label flex h-[30px] cursor-pointer select-none list-none items-center gap-1.5 border px-2.5 transition-colors duration-150 [&::-webkit-details-marker]:hidden ${
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
      <div className="pop-panel absolute left-0 top-full z-30 mt-1.5 min-w-52 border border-edge bg-overlay p-1.5">
        {children}
      </div>
    </details>
  );
}

/** One checkbox option row inside a popover. */
export function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-2 py-[5px] text-[13px] text-ink-dim transition-colors duration-100 hover:bg-raised hover:text-ink">
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
