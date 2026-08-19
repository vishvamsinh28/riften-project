import { corpusStats } from "@/lib/stats";
import { fmtCount, fmtUsd } from "@/lib/format";
import { NavLinks, MobileNav } from "./nav";
import { BrandMark } from "./app-shell";

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
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-xs text-ink-dim">{fmtCount(stats.traces)}</span>
          <span className="microlabel">traces</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-xs text-ink-dim">{stats.sessions}</span>
          <span className="microlabel">sessions</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-xs text-ink-dim">{fmtUsd(stats.cost, { coarse: true })}</span>
          <span className="microlabel">router spend</span>
        </div>
        <p className="mt-2.5 whitespace-normal border-t border-edge pt-2 text-2xs leading-4 text-ink-mute">
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
      <BrandMark size={20} />
      <MobileNav />
    </div>
  );
}
