import { rand, rint, pick, chance } from "./rng.mjs";

/**
 * Event planning: decide which quality events a session exhibits (infra
 * retry, quality retrial, continuation rejection, truncation, stream cut,
 * abandonment, tool errors) and target them at eligible assistant steps.
 */

/**
 * Index a scenario's assistant steps by capability, so events always land
 * on steps that can express them (e.g. retrials need a weak `alt` text).
 */
function stepCapabilities(scenario) {
  let ai = -1;
  const altIdxs = [];
  const contIdxs = [];
  const allIdxs = [];
  for (const s of scenario.steps) {
    if (!s.assistant) continue;
    ai += 1;
    allIdxs.push(ai);
    if (s.alt) altIdxs.push(ai);
    if (s.alt && s.continuation) contIdxs.push(ai);
  }
  return { altIdxs, contIdxs, nAssist: allIdxs.length };
}

/**
 * Roll the event plan for one session. At most one primary event plus an
 * independent continuation-rejection roll; overlapping targets are cleared
 * so no step carries two events. RNG order here is corpus-contract.
 */
export function planFor(scenario) {
  const { altIdxs, contIdxs, nAssist } = stepCapabilities(scenario);
  const p = { infraRetryAt: null, qualityRetryAt: null, contRejectAt: null, truncateAt: null, streamCutAt: null, abandonAt: null, useToolError: false };

  /* continuation rejection rolls independently (only some scenarios support it) */
  if (contIdxs.length > 0 && chance(0.22)) p.contRejectAt = pick(contIdxs);

  const roll = rand();
  if (roll < 0.13) p.infraRetryAt = rint(0, nAssist - 1);
  else if (roll < 0.33 && altIdxs.length > 0) p.qualityRetryAt = pick(altIdxs);
  else if (roll < 0.42) p.truncateAt = rint(Math.max(0, nAssist - 2), nAssist - 1);
  else if (roll < 0.48) p.streamCutAt = rint(0, nAssist - 1);
  else if (roll < 0.52) p.abandonAt = rint(0, nAssist - 1);

  /* don't stack two events on the same step */
  for (const k of ["infraRetryAt", "qualityRetryAt", "truncateAt", "streamCutAt", "abandonAt"]) {
    if (p.contRejectAt !== null && p[k] === p.contRejectAt) p[k] = null;
  }
  if (chance(0.3)) p.useToolError = true;
  return p;
}
