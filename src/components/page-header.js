/**
 * Standard page header: title + optional subtitle on the left, actions on
 * the right, closed by a hairline. Every page uses this so the app keeps
 * one consistent header rhythm on the single dark surface.
 */
export function PageHeader({ title, sub, actions }) {
  return (
    <header className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-edge px-6 py-2.5">
      <div>
        <h1 className="label text-ink">{title}</h1>
        {sub ? <p className="mt-0.5 text-xs text-ink-mute">{sub}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Content wrapper under a PageHeader: consistent padding, gentle rise-in. */
export function PageBody({ children, className = "" }) {
  return <div className={`page-enter flex-1 px-6 py-5 ${className}`}>{children}</div>;
}
