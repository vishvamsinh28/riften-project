import Link from "next/link";

/**
 * 404 boundary — reached mostly via stale trace ids after a re-seed,
 * so the copy points back at the trace explorer.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-surface py-24 text-center">
      <p className="font-mono text-sm text-ink-mute">404</p>
      <h1 className="mt-2 text-[15px] font-semibold text-ink">Nothing at this address</h1>
      <p className="mt-1 text-[13px] text-ink-mute">The trace may have been re-seeded, or the id is off.</p>
      <Link
        href="/traces"
        className="mt-5 rounded-md border border-edge bg-surface px-3 py-1.5 text-[13px] text-ink-dim transition-colors duration-150 hover:border-edge-strong hover:text-ink"
      >
        Back to traces
      </Link>
    </div>
  );
}
