import { readFileSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeTrace } from "./normalize.js";
import { buildIndex } from "./derive.js";

/**
 * Trace store. Source of truth is data/traces.ndjson; rows ingested at
 * runtime are appended to the file when the filesystem allows it and kept
 * in memory otherwise (read-only deploys). Reloads whenever the file changes.
 */

const DATA_FILE = join(process.cwd(), "data", "traces.ndjson");

/** Fresh, empty store state (also the shape the cache always has). */
function freshState() {
  return { mtimeMs: -1, traces: [], extras: [], index: null };
}

// Module-level cache; globalThis keeps it stable across dev HMR re-evaluation.
const state = (globalThis.__riftenStore ??= freshState());

/**
 * Parse the corpus NDJSON into normalized traces. Corrupt or invalid lines
 * are counted and reported once — never silently swallowed.
 */
function parseCorpus(text) {
  const traces = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      skipped += 1; // malformed JSON line; counted and reported below
      continue;
    }
    const { trace } = normalizeTrace(raw);
    if (trace) traces.push(trace);
    else skipped += 1;
  }
  if (skipped > 0) {
    console.warn(`[store] skipped ${skipped} corrupt or invalid line(s) in ${DATA_FILE}`);
  }
  return traces;
}

/** Rebuild the read index from file-backed traces plus memory-only extras. */
function rebuild() {
  state.index = buildIndex([...state.traces, ...state.extras]);
}

/**
 * Load (or reload) the corpus if the backing file changed since last read.
 * A missing file is fine — the store may still hold ingested extras.
 */
function ensureLoaded() {
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(DATA_FILE).mtimeMs;
  } catch {
    mtimeMs = -1; // no corpus file yet; treated as an empty base corpus
  }
  if (state.mtimeMs === mtimeMs && state.index) return;

  state.mtimeMs = mtimeMs;
  state.traces = [];
  if (mtimeMs !== -1) {
    try {
      state.traces = parseCorpus(readFileSync(DATA_FILE, "utf8"));
    } catch (err) {
      throw new Error(`Failed to read trace corpus at ${DATA_FILE}: ${err.message}`, { cause: err });
    }
  }
  rebuild();
}

/** The full read index: { all, byId, sessions, retriedBy }. */
export function getStore() {
  ensureLoaded();
  return state.index;
}

/** Look up one trace by id, or null when unknown. */
export function getTrace(id) {
  return getStore().byId.get(id) ?? null;
}

/** All traces of a session in conversation order, or null when unknown. */
export function getSession(sessionId) {
  return getStore().sessions.get(sessionId) ?? null;
}

/**
 * Persist accepted rows: append to the corpus file when writable, otherwise
 * keep them in memory for the life of the process. Never loses rows.
 */
function persistAccepted(accepted) {
  const payload = accepted.map((t) => JSON.stringify(t)).join("\n") + "\n";
  try {
    appendFileSync(DATA_FILE, payload);
    state.mtimeMs = -2; // force reload from file on next read
  } catch (err) {
    console.warn(`[store] corpus file not writable (${err.code ?? err.message}); holding rows in memory`);
    state.extras = [...state.extras, ...accepted];
    rebuild();
  }
}

/**
 * Ingest raw rows (already-parsed objects). Every row is validated; the
 * result reports each acceptance and rejection with its reason.
 */
export function ingestRows(rows) {
  if (!Array.isArray(rows)) return { accepted: 0, rejected: [], total: 0 };
  ensureLoaded();

  const existingIds = new Set(getStore().byId.keys());
  const accepted = [];
  const rejected = [];
  rows.forEach((raw, i) => {
    const { trace, error } = normalizeTrace(raw, existingIds);
    if (error) {
      rejected.push({ row: i + 1, id: typeof raw?.id === "string" ? raw.id : null, error });
      return;
    }
    existingIds.add(trace.id);
    accepted.push(trace);
  });

  if (accepted.length > 0) persistAccepted(accepted);
  return { accepted: accepted.length, rejected, total: rows.length };
}
