import { T } from "../tools.mjs";

/**
 * Coding-agent scenario: a failing CI test gets diagnosed and fixed.
 * Exercises tool loops, a run_command error branch with recovery, and a
 * continuation-eligible plan step with a weak alternative (skip-the-test).
 */
export const codingTestFix = {
  key: "coding-test-fix",
  route: "coding",
  system:
    "You are a coding agent operating on the {repo} repository. You have file and shell tools. Make focused changes, run the test suite to verify, and explain what you changed. Never invent file contents — read before you write.",
  tools: [T.read_file, T.write_file, T.run_command, T.grep_repo],
  temperature: 0.2,
  steps: [
    { user: "CI is red on main. `{test_cmd}` fails with:\n\n```\nFAIL {test_file}\n  ● {suite} › {case}\n  expected {expected}, received {received}\n```\n\nCan you fix it?" },
    { call: { name: "read_file", args: { path: "{src_file}" } }, result: "{src_snippet}" },
    { call: { name: "run_command", args: { command: "{test_cmd}" } }, result: "Command failed with exit code 1:\n{test_error}", error: "Command failed with exit code 1:\n{test_error}", recover: { name: "read_file", args: { path: "{test_file}" } }, recoverResult: "{test_snippet}" },
    {
      assistant:
        "Found it. `{fn_name}` in `{src_file}` {bug_desc}. The test is right — the implementation regressed in the last refactor.\n\nI'll make the minimal fix:\n\n```{lang}\n{fix_snippet}\n```\n\nApplying it now and re-running the suite.",
      alt: "The test seems flaky. I'd suggest adding a retry around the assertion or marking it `.skip` until the team can look at it:\n\n```{lang}\n{skip_snippet}\n```",
      continuation: true,
    },
    { call: { name: "write_file", args: { path: "{src_file}", content: "{fixed_file}" } }, result: "Wrote {src_file} ({bytes} bytes)." },
    { call: { name: "run_command", args: { command: "{test_cmd}" } }, result: "PASS {test_file}\nTests: {n_tests} passed, {n_tests} total\nTime: {test_time}s" },
    {
      assistant:
        "Fixed. `{fn_name}` {fix_desc}. The full suite passes ({n_tests}/{n_tests}).\n\nOne-line summary for the changelog: \"{changelog}\"",
      rating: "positive",
    },
  ],
  variants: [
    {
      repo: "checkout-service", test_cmd: "npm test -- cart.test.js", test_file: "src/cart/cart.test.js",
      suite: "applyDiscount", case: "stacks percentage after fixed coupons", expected: "84.15", received: "83.30",
      src_file: "src/cart/discounts.js", lang: "js",
      src_snippet: "export function applyDiscount(subtotal, coupons) {\n  let total = subtotal;\n  for (const c of coupons.sort(byPriority)) {\n    if (c.kind === 'fixed') total -= c.amount;\n    if (c.kind === 'percent') total = subtotal * (1 - c.rate); // <- uses subtotal\n  }\n  return round2(total);\n}",
      test_error: "expected 84.15, received 83.30\n  at Object.<anonymous> (src/cart/cart.test.js:41:29)",
      test_snippet: "it('stacks percentage after fixed coupons', () => {\n  const coupons = [fixed(1), percent(0.15)];\n  expect(applyDiscount(100, coupons)).toBe(84.15);\n});",
      fn_name: "applyDiscount", bug_desc: "applies percentage coupons to the original subtotal instead of the running total, so fixed coupons applied earlier are ignored",
      fix_snippet: "-    if (c.kind === 'percent') total = subtotal * (1 - c.rate);\n+    if (c.kind === 'percent') total = total * (1 - c.rate);",
      skip_snippet: "it.skip('stacks percentage after fixed coupons', () => { /* flaky? */ });",
      fixed_file: "export function applyDiscount(subtotal, coupons) {\n  let total = subtotal;\n  for (const c of coupons.sort(byPriority)) {\n    if (c.kind === 'fixed') total -= c.amount;\n    if (c.kind === 'percent') total = total * (1 - c.rate);\n  }\n  return round2(total);\n}",
      bytes: 312, n_tests: 47, test_time: "3.8",
      fix_desc: "now applies percentage discounts to the running total, so stacking with fixed coupons is order-correct",
      changelog: "fix(cart): percentage coupons now stack on the discounted total",
    },
    {
      repo: "ingest-pipeline", test_cmd: "pytest tests/test_dedupe.py -q", test_file: "tests/test_dedupe.py",
      suite: "test_dedupe", case: "keeps_latest_by_updated_at", expected: "3 rows", received: "4 rows",
      src_file: "pipeline/dedupe.py", lang: "python",
      src_snippet: "def dedupe(rows):\n    seen = {}\n    for r in rows:\n        key = r[\"id\"]\n        if key not in seen:\n            seen[key] = r  # first wins — wrong for late updates\n    return list(seen.values())",
      test_error: "assert len(result) == 3\nE   assert 4 == 3",
      test_snippet: "def test_keeps_latest_by_updated_at():\n    rows = load_fixture(\"updates.json\")\n    assert len(dedupe(rows)) == 3\n    assert dedupe(rows)[0][\"updated_at\"] == \"2026-07-02\"",
      fn_name: "dedupe", bug_desc: "keeps the *first* row per id, but the contract is last-write-wins by `updated_at`",
      fix_snippet: "-        if key not in seen:\n-            seen[key] = r\n+        prev = seen.get(key)\n+        if prev is None or r[\"updated_at\"] > prev[\"updated_at\"]:\n+            seen[key] = r",
      skip_snippet: "@pytest.mark.skip(reason=\"flaky fixture ordering\")\ndef test_keeps_latest_by_updated_at(): ...",
      fixed_file: "def dedupe(rows):\n    seen = {}\n    for r in rows:\n        key = r[\"id\"]\n        prev = seen.get(key)\n        if prev is None or r[\"updated_at\"] > prev[\"updated_at\"]:\n            seen[key] = r\n    return list(seen.values())",
      bytes: 289, n_tests: 23, test_time: "1.2",
      fix_desc: "now keeps the row with the greatest `updated_at` per id (last-write-wins)",
      changelog: "fix(dedupe): last-write-wins by updated_at instead of first-seen",
    },
  ],
};
