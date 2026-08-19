"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sidebar navigation items with active-route highlighting and small inline
 * icons. Client component because active state depends on usePathname.
 */

const ICONS = {
  dashboard: <path d="M2 8.5 8 3l6 5.5M3.5 7.5V13h9V7.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
  traces: <path d="M2.5 4h11M2.5 8h11M2.5 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
  exports: <path d="M8 2.5v7M5 6.5 8 9.5l3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
  ingest: <path d="M8 9.5v-7M5 5.5l3-3 3 3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />,
};

const LINKS = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/traces", label: "Traces", icon: "traces" },
  { href: "/exports", label: "Exports", icon: "exports" },
  { href: "/ingest", label: "Ingest", icon: "ingest" },
];

/** True when the link owns the current path (exact for "/", prefix otherwise). */
function isActive(href, pathname) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

/** Vertical nav list for the sidebar. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mt-1 flex flex-col gap-px px-2">
      {LINKS.map(({ href, label, icon }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={label}
            className={`label flex items-center gap-2.5 overflow-hidden whitespace-nowrap px-2 py-[7px] transition-colors duration-150 ${
              active ? "text-ink shadow-[inset_2px_0_0_var(--color-accent-strong)] hover:bg-raised" : "text-ink-dim hover:bg-raised hover:text-ink"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${active ? "text-ink" : "text-ink-mute"}`}>
              {ICONS[icon]}
            </svg>
            <span className="group-data-collapsed/side:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact horizontal nav for narrow viewports where the sidebar is hidden. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`label whitespace-nowrap px-2.5 py-1 transition-colors ${
            isActive(href, pathname) ? "text-ink underline decoration-accent-strong underline-offset-4" : "text-ink-dim hover:text-ink"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
