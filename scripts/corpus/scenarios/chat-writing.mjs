/**
 * Plain chat scenario — no tools. Writing help, explanation, and cooking,
 * each with a revision turn. Weak alternatives are curt or jargon-heavy
 * versions of the good answers, giving retrial pairs realistic contrast.
 */
export const chatWriting = {
  key: "chat-writing",
  route: "chat",
  system: "You are a helpful assistant.",
  tools: null,
  temperature: 0.8,
  steps: [
    { user: "{ask}" },
    { assistant: "{answer}", alt: "{answer_alt}" },
    { user: "{revise}" },
    { assistant: "{answer2}", rating: "positive" },
  ],
  variants: [
    {
      ask: "Write a short email to my landlord asking them to fix the bathroom exhaust fan. It's been broken for three weeks and I've mentioned it twice in person. Polite but firm, and mention mold risk.",
      answer: "Subject: Bathroom exhaust fan — third request, repair needed this week\n\nHi Daniel,\n\nFollowing up in writing on the bathroom exhaust fan, which has now been out for three weeks. I've mentioned it in person twice (July 28 and Aug 6) but haven't heard back on a repair date.\n\nWithout ventilation the bathroom isn't drying out, and I'm starting to see condensation lingering on the ceiling — I want to flag mold risk before it becomes a bigger (and more expensive) problem for both of us.\n\nCould you confirm by Friday when a repair is scheduled? Happy to coordinate access any weekday after 5pm.\n\nThanks,\nSam",
      answer_alt: "Subject: Fan\n\nHi, the fan in my bathroom is still broken. Please fix it as soon as possible, it could cause mold which would be a violation of the habitability code and I may have to consider further action.\n\nRegards,\nSam",
      revise: "Good, but drop the exact dates (I don't remember them exactly) and make the deadline gentler.",
      answer2: "Subject: Bathroom exhaust fan — following up in writing\n\nHi Daniel,\n\nFollowing up on the bathroom exhaust fan, which has now been out for about three weeks. I've mentioned it in person a couple of times but we haven't landed on a repair date yet.\n\nWithout ventilation the bathroom isn't drying out between showers, and condensation is starting to linger on the ceiling — I'd love to get ahead of any mold risk before it becomes a bigger problem for both of us.\n\nCould you let me know this week when a repair could be scheduled? Happy to coordinate access any weekday after 5pm.\n\nThanks,\nSam",
    },
    {
      ask: "Explain to a non-technical exec why we can't just 'add more servers' to fix our database being slow. One paragraph, no jargon.",
      answer: "Adding servers helps when the problem is too many customers waiting in line — you open more checkout lanes. But our database is slow for a different reason: it's like one filing cabinet that every lane has to walk back to for every order. Adding lanes doesn't speed up the cabinet; it actually makes the crowd around it worse. The real fixes are making fewer trips to the cabinet (smarter queries), keeping copies of the most-used files at each lane (caching), or reorganizing the cabinet so lookups are faster (indexing). Those are engineering changes, not purchasing decisions — cheaper than servers, but they take focused time from the team.",
      answer_alt: "Because the database is a bottleneck and adding servers only scales the stateless tier. The database has vertical scaling limits and adding read replicas introduces replication lag and consistency tradeoffs, while sharding requires application-level changes. So horizontal scaling isn't directly applicable to the primary.",
      revise: "Love the filing cabinet metaphor. Can you end it with a one-line ask for two engineer-weeks?",
      answer2: "Adding servers helps when the problem is too many customers waiting in line — you open more checkout lanes. But our database is slow for a different reason: it's like one filing cabinet that every lane has to walk back to for every order. Adding lanes doesn't speed up the cabinet; it actually makes the crowd around it worse. The real fixes are making fewer trips to the cabinet (smarter queries), keeping copies of the most-used files at each lane (caching), or reorganizing the cabinet so lookups are faster (indexing). Those are engineering changes, not purchasing decisions — cheaper than servers, but they take focused time. **The ask: two engineer-weeks now to fix the cabinet, instead of a five-figure server bill that won't.**",
    },
    {
      ask: "I have chicken thighs, a lemon, feta, orzo, and a sad-looking zucchini. 30 minutes. What do I make?",
      answer: "One-pan lemon chicken orzo — perfect for exactly that inventory.\n\n1. **Sear** (8 min): Salt the thighs, sear skin-side down in an oven-safe pan until deep golden. Flip, 2 min, remove. Don't wash the pan — that fond is the flavor.\n2. **Toast** (2 min): Half-moon the zucchini, brown it in the chicken fat, then stir in the orzo (about 1 cup) for 30 seconds.\n3. **Simmer** (12 min): Add 2 cups of water or stock, juice of half the lemon, scrape the bottom. Nestle the thighs back on top, lid on, medium-low until the orzo is tender.\n4. **Finish**: Off heat — crumble feta over, zest the lemon on top, squeeze the rest of the juice, black pepper.\n\nThe orzo drinks the chicken juices and the feta half-melts into a sauce. The sad zucchini will not be recognized.",
      answer_alt: "You could make a chicken and orzo dish. Cook the chicken, boil the orzo separately according to package directions, sauté the zucchini, and combine everything with lemon juice and feta. Season to taste.",
      revise: "No stock, and my partner hates zucchini skin. Adjust?",
      answer2: "Easy on both counts:\n\n- **No stock**: water works fine here — the seared-chicken fond plus the rendered fat basically makes stock in the pan. Add an extra pinch of salt and, if you have it, a knob of butter with the water.\n- **Zucchini skin**: peel it before slicing (a Y-peeler takes 20 seconds), and cut slightly thicker half-moons so the peeled flesh doesn't go mushy. Browning them well in step 2 also builds enough texture that the skin won't be missed.\n\nEverything else — timing, order, the feta finish — stays exactly the same.",
    },
  ],
};
