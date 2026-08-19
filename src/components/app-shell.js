"use client";

import { useEffect, useState } from "react";

/**
 * Client shell owning the sidebar collapse state. The sidebar's content is
 * server-rendered and passed in as a prop; collapse is expressed as a
 * data-collapsed attribute so children restyle themselves via group-data
 * variants while the width animates.
 */

const STORAGE_KEY = "riften-sidebar-collapsed";

/** Clean panel-left glyph: outer frame plus one divider, nothing else. */
function PanelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.25 2.75v10.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** The bicone mark from riften.ai — its own asset, black ground built in. */
export function BrandMark({ size = 22, className = "" }) {
  return (
    <img
      src="/riften-mark.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}

/**
 * The shell itself: brand + toggle header, the animated sidebar rail, and
 * the content column. Restores the saved collapse preference after mount.
 */
export function AppShell({ sidebar, children }) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved preference after mount (server always renders expanded).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setCollapsed(false); // storage unavailable (private mode) — default open
    }
  }, []);

  /** Flip and persist; persistence failure only loses the preference. */
  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        console.warn("[app-shell] could not persist sidebar preference");
      }
      return next;
    });
  }

  return (
    <>
      <aside
        data-collapsed={collapsed ? "" : undefined}
        className={`group/side sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-edge transition-[width] duration-200 ease-out md:flex ${
          collapsed ? "w-[52px]" : "w-56"
        }`}
      >
        {collapsed ? (
          <div className="flex shrink-0 flex-col items-center gap-1.5 py-3">
            <BrandMark size={20} />
            <button
              onClick={toggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex size-7 items-center justify-center text-ink-mute transition-colors duration-150 hover:bg-raised hover:text-ink"
            >
              <PanelIcon />
            </button>
          </div>
        ) : (
          <div className="flex h-14 shrink-0 items-center gap-2.5 pl-4 pr-2">
            <BrandMark />
            <span className="label whitespace-nowrap text-ink">Riften</span>
            <button
              onClick={toggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="ml-auto flex size-7 items-center justify-center text-ink-mute transition-colors duration-150 hover:bg-raised hover:text-ink"
            >
              <PanelIcon />
            </button>
          </div>
        )}
        {sidebar}
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">{children}</div>
    </>
  );
}
