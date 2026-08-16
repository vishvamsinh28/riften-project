import { T } from "../tools.mjs";

/**
 * Customer-support scenario: refund eligibility, tooling against the order
 * backend, and a lookup_error branch (typo'd order id) in variant 2. The
 * eligibility answer carries a weak alternative for retrial events.
 */
export const supportRefund = {
  key: "support-refund",
  route: "support",
  system:
    "You are the support agent for Lumen Audio's online store. Use tools to look up real order state before promising anything. Policy: full refund within 30 days of delivery; partial (80%) refund for opened items 31-60 days; nothing after 60 days without a manager escalation. Be warm and concise; confirm irreversible actions before running them.",
  tools: [T.lookup_order, T.issue_refund, T.send_email],
  temperature: 0.6,
  steps: [
    { user: "{opening}" },
    { call: { name: "lookup_order", args: { order_id: "{order_id}" } }, result: "{order_json}", error: "{lookup_error}", recover: { name: "lookup_order", args: { order_id: "{order_id_fixed}" } }, recoverResult: "{order_json}" },
    { assistant: "{eligibility_answer}", alt: "{eligibility_alt}" },
    { user: "{confirm_msg}" },
    { call: { name: "issue_refund", args: { order_id: "{order_id_fixed}", amount_usd: "{refund_amount}", reason: "{refund_reason}" } }, result: "{refund_result}" },
    { call: { name: "send_email", args: { order_id: "{order_id_fixed}", template: "refund_confirmation" } }, result: "{email_result}" },
    { assistant: "{closing_answer}", rating: "positive" },
  ],
  variants: [
    {
      opening: "Hi — I bought the Arc 2 headphones about three weeks ago and the right driver started crackling at low volume. Order LU-88412. Can I get my money back?",
      order_id: "LU-88412", order_id_fixed: "LU-88412",
      lookup_error: null,
      order_json: "{\"order_id\":\"LU-88412\",\"item\":\"Arc 2 Wireless Headphones\",\"price_usd\":249.00,\"delivered\":\"2026-07-26\",\"status\":\"delivered\",\"customer\":\"m.okafor@gmail.com\"}",
      eligibility_answer: "Thanks for the order number — I can see your Arc 2s were delivered on July 26th, so you're at 21 days, comfortably inside our 30-day full-refund window. A crackling driver is a defect on us.\n\nI can refund the full **$249.00** to your original payment method (3-5 business days), and you'll get a prepaid return label by email. Want me to go ahead?",
      eligibility_alt: "You're within the window so a refund should be possible. Do you have the receipt? I may also need the serial number from the box before I can process anything.",
      confirm_msg: "Yes please, full refund. The label by email works.",
      refund_amount: 249.0, refund_reason: "defective unit - right driver crackling, within 30-day window",
      refund_result: "{\"refund_id\":\"rf_9k2m4\",\"status\":\"processed\",\"amount_usd\":249.00,\"eta_days\":\"3-5\"}",
      email_result: "{\"sent\":true,\"to\":\"m.okafor@gmail.com\",\"template\":\"refund_confirmation\"}",
      closing_answer: "All done! Your $249.00 refund is processed (refund id rf_9k2m4) and lands in 3-5 business days. The confirmation email with the prepaid return label just went out to m.okafor@gmail.com — drop the headphones at any carrier point within 14 days.\n\nSorry the Arc 2s let you down. Anything else I can help with?",
    },
    {
      opening: "Order LU-73301 — the Slate desk speaker I got in June just isn't for me, honestly. Too bassy for a small room. What are my options?",
      order_id: "LU-7331O", order_id_fixed: "LU-73301",
      lookup_error: "ORDER_NOT_FOUND: no order matches id 'LU-7331O'",
      order_json: "{\"order_id\":\"LU-73301\",\"item\":\"Slate Desk Speaker\",\"price_usd\":179.00,\"delivered\":\"2026-06-29\",\"status\":\"delivered\",\"customer\":\"j.reyes@proton.me\"}",
      eligibility_answer: "Found it (the last character is a 1, not an O — happens all the time). Your Slate was delivered June 29th, which puts you at 48 days: past the 30-day full-refund window, but inside the 31-60 day partial window since it's opened.\n\nThat means I can offer **$143.20** back (80% of $179.00). Alternatively I can do a full-value store credit if you'd rather try the smaller Slate Mini. Which sounds better?",
      eligibility_alt: "I couldn't find that exact order, but based on a June delivery you'd likely be past the full refund window. You could try contacting billing directly, or check whether the retailer you bought from has its own policy.",
      confirm_msg: "The 80% works, let's do that.",
      refund_amount: 143.2, refund_reason: "customer preference, opened item in 31-60 day partial window",
      refund_result: "{\"refund_id\":\"rf_2x8p1\",\"status\":\"processed\",\"amount_usd\":143.20,\"eta_days\":\"3-5\"}",
      email_result: "{\"sent\":true,\"to\":\"j.reyes@proton.me\",\"template\":\"refund_confirmation\"}",
      closing_answer: "Done — $143.20 is on its way back to your card (refund id rf_2x8p1, 3-5 business days), and the confirmation with a return label is in your inbox.\n\nFor a small room, honestly, the Slate Mini or the Arc 2 in wired mode are the moves. Happy listening!",
    },
  ],
};
