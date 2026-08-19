import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

/**
 * 404 boundary — reached mostly via stale trace ids after a re-seed,
 * so the copy points back at the trace explorer.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-bg py-24 text-center">
      <BrandMark size={56} />
      <p className="mt-6 font-doto text-[34px] font-bold leading-none text-ink">404</p>
      <h1 className="label mt-3 text-ink">Nothing at this address</h1>
      <p className="mt-2 text-xs text-ink-mute">The trace may have been re-seeded, or the id is off.</p>
      <Link href="/traces" className="ulink mt-6 text-xs">
        Back to traces
      </Link>
    </div>
  );
}
