/**
 * Seeded PRNG shared by every corpus module. All randomness flows through
 * this single stream, so the generator is deterministic: same seed, same
 * corpus, byte for byte. Import order must not consume the stream.
 */

export const SEED = 20260816;

/** Mulberry32 — small, fast, good-enough PRNG for synthetic data. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The one shared random stream. Never create a second instance. */
export const rand = mulberry32(SEED);

/** Uniform integer in [lo, hi], inclusive on both ends. */
export const rint = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/** Uniform pick from a non-empty array. */
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];

/** Bernoulli trial with probability p. */
export const chance = (p) => rand() < p;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random id like "tr_9k2m4wq1ax" — prefix + base36 suffix of given length. */
export const uid = (prefix, len = 10) =>
  prefix + "_" + Array.from({ length: len }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
