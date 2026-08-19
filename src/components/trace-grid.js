/**
 * The trace table's 11-column grid template, shared by the server-rendered
 * header row and the client-rendered data rows. Lives in a plain module so
 * both sides can import it (client-module exports don't cross into RSC).
 */
/* Every column carries a minmax so spare width on wide screens spreads
   across the whole row instead of pooling in two mega-columns; at the
   1220px floor the mins reproduce the original dense layout. */
export const TRACE_GRID =
  "grid grid-cols-[minmax(92px,0.6fr)_minmax(100px,0.7fr)_minmax(118px,0.8fr)_minmax(150px,1.1fr)_minmax(60px,0.5fr)_minmax(80px,0.6fr)_minmax(44px,0.4fr)_minmax(60px,0.5fr)_minmax(66px,0.5fr)_minmax(72px,0.5fr)_minmax(170px,1.1fr)] items-center gap-x-3";
