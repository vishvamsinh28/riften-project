import { codingTestFix } from "./coding-test-fix.mjs";
import { codingFeature } from "./coding-feature.mjs";
import { supportRefund } from "./support-refund.mjs";
import { analyticsSql } from "./analytics-sql.mjs";
import { chatWriting } from "./chat-writing.mjs";
import { docsQa } from "./docs-qa.mjs";
import { travelPlan } from "./travel-plan.mjs";

/**
 * The scenario library. A scenario is a session script: system prompt,
 * tools, and steps —
 *   { user }                                   a new user turn
 *   { assistant, alt?, rating?, continuation? }  a model answer (alt = weak
 *                                              variant used by retrial and
 *                                              continuation-rejection events)
 *   { call, result, error?, recover?, recoverResult? }  a tool round-trip;
 *                                              the error branch fires only
 *                                              when the plan asks for it AND
 *                                              the variant resolves the text
 * Variants substitute {placeholders} in every string.
 *
 * ORDER MATTERS: pick(SCENARIOS) consumes the shared RNG stream, so
 * reordering this array changes the generated corpus.
 */
export const SCENARIOS = [
  codingTestFix,
  codingFeature,
  supportRefund,
  analyticsSql,
  chatWriting,
  docsQa,
  travelPlan,
];
