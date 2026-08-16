import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="font-mono text-sm text-ink-mute">404</p>
      <h1 className="mt-2 text-lg font-semibold text-ink">Nothing at this address</h1>
      <p className="mt-1 text-[13px] text-ink-mute">The trace may have been re-seeded, or the id is off.</p>
      <Link
        href="/traces"
        className="mt-5 rounded-md border border-edge bg-surface px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-edge-strong"
      >
        Back to traces
      </Link>
    </div>
  );
}
