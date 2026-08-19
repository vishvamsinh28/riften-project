import { BrandMark } from "./brand-mark";

/**
 * Full-screen gate shown instead of the app on small viewports — the trace
 * tables and transcript views need desktop room, so phones get a quiet
 * brand moment and one instruction rather than a broken layout.
 */
export function MobileGate() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-8 text-center md:hidden">
      <BrandMark size={56} />
      <p className="label mt-6 text-ink">Riften</p>
      <p className="label mt-4 text-ink-dim">Built for desktop</p>
      <p className="mt-2 max-w-[240px] text-xs leading-5 text-ink-mute">
        Trace tables and transcripts need a wider screen. Open this on a desktop browser.
      </p>
    </div>
  );
}
