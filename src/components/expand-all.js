"use client";

import { useState } from "react";

/**
 * Expand/collapse every <details> inside the element with `targetId`.
 * A pragmatic one-way sync: individual rows stay independently usable and
 * the button simply re-asserts the bulk state on each press.
 */
export function ExpandAll({ targetId }) {
  const [open, setOpen] = useState(false);

  /** Apply the next bulk state to every disclosure in the target container. */
  function toggle() {
    const host = document.getElementById(targetId);
    if (!host) return;
    const next = !open;
    for (const d of host.querySelectorAll("details")) d.open = next;
    setOpen(next);
  }

  return (
    <button type="button" onClick={toggle} className="microlabel transition-colors duration-150 hover:text-ink">
      {open ? "collapse all" : "expand all"}
    </button>
  );
}
