import { T } from "../tools.mjs";

/**
 * Analytics-copilot scenario: warehouse SQL with a schema-error branch
 * (wrong column name) and a drill-down turn. Weak alternatives are vague
 * hand-wavy answers, giving retrial pairs a clear quality gap.
 */
export const analyticsSql = {
  key: "analytics-sql",
  route: "analytics",
  system:
    "You are an analytics copilot with read-only SQL access to the {org} warehouse (Postgres dialect). Prefer CTEs over subqueries, always LIMIT exploratory queries, and state assumptions about schema explicitly. Numbers in answers must come from query results, never estimates.",
  tools: [T.run_sql],
  temperature: 0.3,
  steps: [
    { user: "{question}" },
    { call: { name: "run_sql", args: { query: "{q1}" } }, error: "{q1_error}", result: "{q1_result}", recover: { name: "run_sql", args: { query: "{q1_fixed}" } }, recoverResult: "{q1_result}" },
    { assistant: "{answer1}", alt: "{answer1_alt}" },
    { user: "{drill_question}" },
    { call: { name: "run_sql", args: { query: "{q2}" } }, result: "{q2_result}" },
    { assistant: "{answer2}", rating: "positive" },
  ],
  variants: [
    {
      org: "meridian",
      question: "What's our trial-to-paid conversion rate by signup month for this year? Marketing claims it cratered in Q2.",
      q1: "WITH cohorts AS (\n  SELECT date_trunc('month', trial_started_at) AS signup_month,\n         count(*) AS trials,\n         count(*) FILTER (WHERE converted_at IS NOT NULL) AS conversions\n  FROM accounts\n  WHERE trial_started_at >= '2026-01-01'\n  GROUP BY 1\n)\nSELECT signup_month, trials, conversions,\n       round(100.0 * conversions / trials, 1) AS conv_pct\nFROM cohorts ORDER BY signup_month;",
      q1_error: "ERROR: column \"converted_at\" does not exist\nHINT: Perhaps you meant to reference the column \"accounts.paid_converted_at\".",
      q1_fixed: "WITH cohorts AS (\n  SELECT date_trunc('month', trial_started_at) AS signup_month,\n         count(*) AS trials,\n         count(*) FILTER (WHERE paid_converted_at IS NOT NULL) AS conversions\n  FROM accounts\n  WHERE trial_started_at >= '2026-01-01'\n  GROUP BY 1\n)\nSELECT signup_month, trials, conversions,\n       round(100.0 * conversions / trials, 1) AS conv_pct\nFROM cohorts ORDER BY signup_month;",
      q1_result: "signup_month | trials | conversions | conv_pct\n2026-01-01   |  1843  |  312        | 16.9\n2026-02-01   |  1911  |  334        | 17.5\n2026-03-01   |  2204  |  391        | 17.7\n2026-04-01   |  2380  |  296        | 12.4\n2026-05-01   |  2511  |  289        | 11.5\n2026-06-01   |  2456  |  301        | 12.3\n(6 rows)",
      answer1: "Marketing is right. Conversion held at **17-18%** through Q1, then dropped to **12.4%** in April and has stayed near **11.5-12.3%** since — roughly a 5-point (30% relative) decline starting exactly in April.\n\n| Month | Trials | Conversions | Rate |\n|---|---|---|---|\n| Jan | 1,843 | 312 | 16.9% |\n| Feb | 1,911 | 334 | 17.5% |\n| Mar | 2,204 | 391 | 17.7% |\n| Apr | 2,380 | 296 | 12.4% |\n| May | 2,511 | 289 | 11.5% |\n| Jun | 2,456 | 301 | 12.3% |\n\nNote trials *grew* ~12% over the same period — this smells like a channel-mix change (more low-intent signups), not a product problem. Want me to split by acquisition channel?",
      answer1_alt: "The conversion rate this year averages around 14-15%, which is in the normal range for B2B SaaS. Q2 might look lower but monthly noise of a few points is expected; I wouldn't read too much into it without more data.",
      drill_question: "Yes — split April onward by channel.",
      q2: "SELECT channel,\n       count(*) AS trials,\n       count(*) FILTER (WHERE paid_converted_at IS NOT NULL) AS conversions,\n       round(100.0 * count(*) FILTER (WHERE paid_converted_at IS NOT NULL) / count(*), 1) AS conv_pct\nFROM accounts\nWHERE trial_started_at >= '2026-04-01'\nGROUP BY channel ORDER BY trials DESC;",
      q2_result: "channel        | trials | conversions | conv_pct\npaid_social    |  2913  |  187        | 6.4\norganic_search |  2101  |  384        | 18.3\nreferral       |  1266  |  231        | 18.2\npartner        |  1067  |  84         | 7.9\n(4 rows)",
      answer2: "There's your answer. Since April, **paid_social** delivered 2,913 trials — the biggest channel — converting at just **6.4%**, versus **18.3%** organic and **18.2%** referral (both unchanged from Q1 levels). The partner channel is also weak at 7.9%.\n\nThe Q2 \"crater\" is entirely channel mix: paid social volume roughly tripled while converting at a third of the baseline rate. Product conversion is fine; the paid-social targeting (or the landing-page promise it makes) is the thing to fix.",
    },
    {
      org: "meridian",
      question: "Which of our API endpoints got slower after the Aug 4 deploy? p95, before/after.",
      q1: "SELECT endpoint,\n       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)\n         FILTER (WHERE ts < '2026-08-04') AS p95_before,\n       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)\n         FILTER (WHERE ts >= '2026-08-04') AS p95_after\nFROM request_logs\nWHERE ts BETWEEN '2026-07-28' AND '2026-08-11'\nGROUP BY endpoint\nORDER BY p95_after - p95_before DESC\nLIMIT 10;",
      q1_error: null,
      q1_fixed: null,
      q1_result: "endpoint             | p95_before | p95_after\nPOST /v1/search      |  412       |  1893\nGET /v1/projects     |  188       |  201\nPOST /v1/completions |  902       |  921\nGET /v1/usage        |  95        |  97\nPOST /v1/files       |  341       |  339\n(5 rows)",
      answer1: "One endpoint regressed, and badly: **POST /v1/search** went from **412ms → 1,893ms p95** (4.6x) after the Aug 4 deploy. Everything else moved within noise (±13ms).\n\nGiven it's isolated to search, the likely suspects in that deploy are the query planner change or a lost index. Want me to check whether the slowdown correlates with result-set size or is flat across all search requests?",
      answer1_alt: "Several endpoints show some slowdown after Aug 4. Performance can vary due to load, time of day, and caching, so I'd recommend monitoring for another week before drawing conclusions.",
      drill_question: "Check if it's flat or correlates with result size.",
      q2: "SELECT width_bucket(result_count, 0, 500, 5) AS bucket,\n       min(result_count) AS min_results, max(result_count) AS max_results,\n       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95\nFROM request_logs\nWHERE endpoint = 'POST /v1/search' AND ts >= '2026-08-04'\nGROUP BY 1 ORDER BY 1;",
      q2_result: "bucket | min_results | max_results | p95\n1      | 0           | 98          | 1841\n2      | 101         | 197         | 1876\n3      | 204         | 296         | 1903\n4      | 302         | 388         | 1920\n5      | 411         | 500         | 1944\n(5 rows)",
      answer2: "It's **flat** — p95 sits at 1.84-1.94s whether the query returns 0 results or 500. A regression proportional to result size would slope upward; this doesn't.\n\nThat rules out serialization/payload cost and points at fixed per-request overhead added on Aug 4: most likely the reranker model call that deploy enabled, or a lost index forcing a full scan even for empty results (an empty-result full scan still reads the whole table). I'd check `EXPLAIN ANALYZE` on a zero-hit query first — if it's the index, that's a one-line fix.",
    },
  ],
};
