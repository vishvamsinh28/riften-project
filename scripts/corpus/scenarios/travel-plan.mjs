import { T } from "../tools.mjs";

/**
 * Travel-booking scenario: flight + hotel search with a budget constraint,
 * a continuation-eligible recommendation step, and a refinement turn. The
 * weak alternative quotes prices without searching — against system policy.
 */
export const travelPlan = {
  key: "travel-plan",
  route: "travel",
  system:
    "You are a travel booking assistant with flight and hotel search tools. Always search before quoting prices — never invent fares. Present at most 3 options, lead with the best value, and state total trip cost. Prices from tools are final.",
  tools: [T.search_flights, T.search_hotels],
  temperature: 0.5,
  steps: [
    { user: "{ask}" },
    { call: { name: "search_flights", args: { origin: "{origin}", destination: "{dest}", depart: "{depart}", return: "{ret}" } }, result: "{flights}" },
    { call: { name: "search_hotels", args: { city: "{city}", checkin: "{depart}", checkout: "{ret}", max_usd: "{hotel_cap}" } }, result: "{hotels}" },
    { assistant: "{answer}", alt: "{answer_alt}", continuation: true },
    { user: "{tweak}" },
    { call: { name: "search_hotels", args: { city: "{city}", checkin: "{depart}", checkout: "{ret}", max_usd: "{hotel_cap2}" } }, result: "{hotels2}" },
    { assistant: "{answer2}", rating: "positive" },
  ],
  variants: [
    {
      ask: "Long weekend in Lisbon for two, flying out of Boston Oct 9-13. Keep the whole thing under $2500 if you can.",
      origin: "BOS", dest: "LIS", depart: "2026-10-09", ret: "2026-10-13", city: "Lisbon", hotel_cap: 220,
      flights: "[{\"carrier\":\"TAP\",\"flight\":\"TP218\",\"depart\":\"2026-10-09 21:55\",\"return\":\"2026-10-13 12:40\",\"nonstop\":true,\"per_person_usd\":648},{\"carrier\":\"Azores/SATA\",\"flight\":\"S4 224\",\"depart\":\"2026-10-09 17:30\",\"return\":\"2026-10-13 15:10\",\"nonstop\":false,\"stops\":\"PDL 1h50m\",\"per_person_usd\":511},{\"carrier\":\"United\",\"flight\":\"UA88→UA967\",\"depart\":\"2026-10-09 16:10\",\"return\":\"2026-10-13 09:00\",\"nonstop\":false,\"stops\":\"EWR 2h15m\",\"per_person_usd\":574}]",
      hotels: "[{\"name\":\"Hotel da Baixa\",\"area\":\"Baixa\",\"rating\":9.1,\"per_night_usd\":198,\"breakfast\":true},{\"name\":\"Lisboa Pessoa\",\"area\":\"Chiado\",\"rating\":8.9,\"per_night_usd\":176,\"breakfast\":false},{\"name\":\"Browns Central\",\"area\":\"Baixa\",\"rating\":8.6,\"per_night_usd\":149,\"breakfast\":true}]",
      answer: "Comes in well under budget. Best-value combination:\n\n**Flights — TAP nonstop, $1,296 for two.** TP218 out Oct 9 at 9:55pm (overnight, land mid-morning), return Oct 13 at 12:40pm. The Azores option saves $274 total but costs you 4+ hours each way — not worth it for a 4-day trip.\n\n**Hotel — Browns Central, $596 for 4 nights.** 8.6-rated, in Baixa so you're walking distance to everything, breakfast included ($149/night).\n\n**Total: $1,892** — about $600 under your cap. If you want to spend some of that headroom, Hotel da Baixa (9.1, also with breakfast) brings the total to $2,088 and is the best hotel in the search. Want me to hold either?",
      answer_alt: "Lisbon in October is lovely. Flights from Boston typically run $500-700 per person and decent central hotels around $150-200 a night, so a long weekend for two should land around $2,300-2,600 — right at your budget. Would you like me to search specific dates?",
      tweak: "Let's splurge a bit — anything with a rooftop pool under $300/night?",
      hotel_cap2: 300,
      hotels2: "[{\"name\":\"Memmo Príncipe Real\",\"area\":\"Príncipe Real\",\"rating\":9.3,\"per_night_usd\":289,\"breakfast\":true,\"pool\":\"rooftop\"},{\"name\":\"EPIC SANA Marquês\",\"area\":\"Marquês de Pombal\",\"rating\":8.8,\"per_night_usd\":244,\"breakfast\":true,\"pool\":\"rooftop\"},{\"name\":\"Hotel Mundial\",\"area\":\"Baixa\",\"rating\":8.2,\"per_night_usd\":205,\"breakfast\":false,\"pool\":\"rooftop\"}]",
      answer2: "Two great rooftop-pool options under $300:\n\n1. **Memmo Príncipe Real — $289/night** ($1,156 for 4 nights). 9.3 rating, breakfast included, and the rooftop looks over the whole city down to the river. Príncipe Real is the best neighborhood in Lisbon for a relaxed trip: 10 minutes' walk to Chiado, surrounded by the good restaurants.\n2. **EPIC SANA Marquês — $244/night** ($976). Bigger, more polished-corporate, proper heated rooftop pool.\n\nWith the TAP flights, Memmo puts the trip at **$2,452** — still under $2,500. That's the one I'd book. Shall I hold it?",
    },
  ],
};
