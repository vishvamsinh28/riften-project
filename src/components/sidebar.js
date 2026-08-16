import { corpusStats } from "@/lib/stats";
import { fmtCount, fmtUsd } from "@/lib/format";
import { NavLinks, MobileNav } from "./nav";

/**
 * Sidebar content (server component): navigation and the live corpus
 * footer. Rendered inside the client AppShell, which owns the brand row and
 * exposes collapse state via a group/side data attribute.
 */

/** Everything below the AppShell's brand row inside the collapsible rail. */
export function SidebarContent() {
  const stats = corpusStats();
  return (
    <>
      <NavLinks />

      <div className="mt-auto whitespace-nowrap border-t border-edge px-4 py-3 group-data-collapsed/side:hidden">
        <div className="flex items-baseline justify-between gap-3 text-2xs text-ink-mute">
          <span className="num text-xs text-ink-dim">{fmtCount(stats.traces)}</span>
          <span>traces</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-2xs text-ink-mute">
          <span className="num text-xs text-ink-dim">{stats.sessions}</span>
          <span>sessions</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-2xs text-ink-mute">
          <span className="num text-xs text-ink-dim">{fmtUsd(stats.cost, { coarse: true })}</span>
          <span>router spend</span>
        </div>
        <p className="mt-2.5 border-t border-edge pt-2 text-2xs leading-4 text-ink-mute">
          Synthetic corpus — no production traffic.
        </p>
      </div>
    </>
  );
}

/** Top bar replacement for the sidebar on narrow viewports. */
export function MobileBar() {
  return (
    <div className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-edge bg-bg/95 px-4 backdrop-blur md:hidden">
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-accent-strong font-mono text-[12px] font-semibold text-white">
        r
      </span>
      <MobileNav />
    </div>
  );
}
