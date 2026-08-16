/**
 * The trace table's 11-column grid template, shared by the server-rendered
 * header row and the client-rendered data rows. Lives in a plain module so
 * both sides can import it (client-module exports don't cross into RSC).
 */
export const TRACE_GRID =
  "grid grid-cols-[92px_100px_118px_minmax(150px,1fr)_60px_80px_44px_60px_66px_72px_minmax(170px,1.1fr)] items-center gap-x-3";
