"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";

/**
 * The only persistent chrome: brand at left plus the active section as plain
 * label text with the red underline. Hovering (or tapping) it fans the other
 * sections out below as bordered boxes in a diamond — left, right, and
 * below-center — while the page behind blurs out. Leaving the whole cluster
 * folds it; clicking a box navigates.
 */

const SECTIONS = [
  { key: "dashboard", href: "/", label: "Dashboard" },
  { key: "traces", href: "/traces", label: "Traces" },
  { key: "exports", href: "/exports", label: "Exports" },
  { key: "ingest", href: "/ingest", label: "Ingest" },
];

/* The stack, hand-tuned: uniform boxes drop straight below the trigger with
   a whisper of arc — each drifts a little further right and tilts a touch,
   like cards laid along a curve. Offsets are px from the cluster's left
   edge / the bar's bottom edge. */
const STACK = [
  { left: 4, top: 12, rot: 1.5 },
  { left: 14, top: 58, rot: 3 },
  { left: 28, top: 104, rot: 4.5 },
];

/** True when the link owns the current path (exact for "/", prefix otherwise). */
function isActive(href, pathname) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

/** The top navigation bar with the blur-backed diamond-fan section switcher. */
export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const closeTimer = useRef(null);
  const triggerRef = useRef(null);

  const current = SECTIONS.find((s) => isActive(s.href, pathname)) ?? SECTIONS[0];
  const others = SECTIONS.filter((s) => s.key !== current.key);

  // Hover unfurls only on pointer hardware; touch taps the trigger instead.
  useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover)").matches);
  }, []);

  // Route change means the user landed somewhere — fold the fan away.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** Open now and cancel any pending close. */
  function unfurl() {
    if (!canHover) return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  }

  /** Grace period before folding, so a slip off the edge survives. */
  function scheduleClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }

  /** Close when focus leaves the cluster (keyboard users tabbing away). */
  function onBlur(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }

  /** Escape folds the fan; focus returns to the trigger, never to body. */
  function onKeyDown(e) {
    if (e.key !== "Escape" || !open) return;
    triggerRef.current?.focus();
    setOpen(false);
  }

  return (
    <>
      {/* The page blurs out while the fan is open. Lives OUTSIDE the header:
          its backdrop-blur would otherwise trap this fixed layer inside the
          48px bar (backdrop-filter creates a containing block). */}
      <div
        aria-hidden="true"
        onPointerDown={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/25 backdrop-blur-[1.5px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <header className="sticky top-0 z-50 border-b border-edge bg-bg/95 backdrop-blur">
      <div className="relative z-50 flex h-12 items-center gap-6 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <BrandMark size={20} />
          <span className="label text-ink">Riften</span>
        </Link>

        <nav
          aria-label="Primary"
          onPointerEnter={unfurl}
          onPointerLeave={scheduleClose}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="relative flex h-full items-center"
        >
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="label flex h-full items-center px-2 text-ink shadow-[inset_0_-2px_0_var(--color-accent-strong)]"
          >
            {current.label}
          </button>

          {/* Invisible bridge so the cursor can cross the gaps of the stack
              without ever "leaving" the cluster. */}
          {open ? <div aria-hidden="true" className="absolute left-[-14px] top-full h-[152px] w-[210px]" /> : null}

          {/* The stack: mounted always so open/close both animate. */}
          {others.map((s, i) => (
            <Link
              key={s.key}
              href={s.href}
              inert={!open}
              tabIndex={open ? 0 : -1}
              style={{
                left: `${STACK[i]?.left ?? 0}px`,
                top: `calc(100% + ${STACK[i]?.top ?? 0}px)`,
                transform: open ? `rotate(${STACK[i]?.rot ?? 0}deg)` : "translateY(-10px) rotate(0deg)",
                transitionDelay: open ? `${i * 40}ms` : "0ms",
              }}
              className={`label absolute z-50 block w-[132px] origin-left whitespace-nowrap border border-ink/60 bg-bg px-5 py-2 text-center text-ink shadow-pop transition-all duration-300 ease-out hover:border-ink hover:bg-ink hover:text-black ${
                open ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        <span className="microlabel ml-auto hidden shrink-0 lg:block">Synthetic corpus</span>
      </div>
      </header>
    </>
  );
}
