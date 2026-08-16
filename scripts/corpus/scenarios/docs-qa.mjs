import { T } from "../tools.mjs";

/**
 * RAG doc-QA scenario: retrieval via search_docs, answers grounded in the
 * returned passages with citation slugs. Weak alternatives answer from
 * vibes without grounding — the classic RAG failure mode.
 */
export const docsQa = {
  key: "docs-qa",
  route: "docs",
  system:
    "You answer developer questions about the Meridian API using the search_docs tool. Ground every claim in retrieved passages and cite the doc slug like [rate-limits]. If the docs don't cover it, say so — never guess.",
  tools: [T.search_docs],
  temperature: 0.2,
  steps: [
    { user: "{q}" },
    { call: { name: "search_docs", args: { query: "{search_q}", top_k: 4 } }, result: "{passages}" },
    { assistant: "{answer}", alt: "{answer_alt}", rating: "positive" },
  ],
  variants: [
    {
      q: "Do webhook deliveries retry, and can I make them idempotent on my side?",
      search_q: "webhook delivery retries idempotency",
      passages: "[webhooks-retries] Failed deliveries (non-2xx or >10s timeout) retry on an exponential schedule: 1m, 5m, 30m, 2h, 8h, then dropped. Each attempt is logged in the dashboard.\n[webhooks-headers] Every delivery includes `X-Meridian-Delivery-Id` (stable across retries of the same event) and `X-Meridian-Signature`.\n[webhooks-ordering] Delivery order is not guaranteed across events; consumers must not assume sequence.\n[events-schema] Event payloads carry `event.id`, unique per event.",
      answer: "Yes to both.\n\n**Retries**: a delivery that returns non-2xx or takes >10s retries on an exponential schedule — 1m, 5m, 30m, 2h, 8h — then is dropped. Each attempt shows in the dashboard [webhooks-retries].\n\n**Idempotency**: dedupe on `X-Meridian-Delivery-Id`, which stays stable across retries of the same event [webhooks-headers] — or on `event.id` in the payload if you'd rather key on the event itself [events-schema]. Store processed ids and skip repeats.\n\nOne caveat worth designing for: ordering across *different* events is not guaranteed, so idempotency alone isn't enough if your handler assumes sequence [webhooks-ordering].",
      answer_alt: "Webhooks generally retry a few times if delivery fails, which is standard practice. For idempotency you can usually use some kind of unique ID in the request — check the headers your provider sends. Most webhook systems include one.",
    },
    {
      q: "What happens to in-flight requests when I rotate an API key? Is there a grace period?",
      search_q: "API key rotation grace period revocation",
      passages: "[auth-rotation] Rotating a key creates a new secret immediately; the previous secret remains valid for 24 hours by default (configurable 0-72h via `grace_period_hours`).\n[auth-revoke] Revoking (as opposed to rotating) invalidates the secret immediately; in-flight requests already authenticated are allowed to complete.\n[auth-audit] Key events (created, rotated, revoked, expired) appear in the audit log within 60 seconds.",
      answer: "There's a grace period for **rotation**, not for revocation:\n\n- **Rotate**: the new secret works immediately and the old one keeps working for 24 hours by default — tunable from 0 to 72 hours with `grace_period_hours` [auth-rotation]. So a rolling deploy can swap secrets with zero downtime.\n- **Revoke**: immediate invalidation. Requests already authenticated and in flight complete; new ones fail [auth-revoke].\n\nBoth actions land in the audit log within a minute if you need to verify [auth-audit].",
      answer_alt: "When you rotate a key, there's typically a transition window where both keys work so your services don't break. Check your dashboard settings for the exact duration — it's usually configurable.",
    },
  ],
};
