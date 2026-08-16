/**
 * Skeleton for the trace explorer while the server filters and renders.
 * Mirrors the real layout so the swap-in doesn't jump.
 */
export default function TracesLoading() {
  return (
    <>
      <div className="flex min-h-[52px] items-center border-b border-edge px-6">
        <div className="skeleton h-4 w-24" />
      </div>
      <div className="flex-1 space-y-3 px-6 py-5">
        <div className="flex gap-2">
          {[224, 72, 108, 88, 76, 84].map((w, i) => (
            <div key={i} className="skeleton h-[30px]" style={{ width: w }} />
          ))}
        </div>
        <div className="-mx-6">
          <div className="h-8 border-y border-edge" />
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-edge/70 px-6 py-2 last:border-b-0">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-4 w-32" />
              <div className="skeleton ml-auto h-3 w-40" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
