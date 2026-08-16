/**
 * The model catalog the synthetic router serves: pricing ($ per 1M tokens),
 * latency profiles, per-workload routing preferences, and the fallback map
 * used when a provider fails and the router reroutes.
 */

/* Latency model: base overhead + per-completion-token ms, provider-flavored. */
export const MODELS = {
  "claude-sonnet-4-5":  { provider: "anthropic", in: 3.0,  out: 15.0, base: 620, perTok: 11.0 },
  "claude-haiku-4-5":   { provider: "anthropic", in: 1.0,  out: 5.0,  base: 380, perTok: 4.4 },
  "claude-opus-4-1":    { provider: "anthropic", in: 15.0, out: 75.0, base: 900, perTok: 16.5 },
  "gpt-5":              { provider: "openai",    in: 1.25, out: 10.0, base: 780, perTok: 12.2 },
  "gpt-5-mini":         { provider: "openai",    in: 0.25, out: 2.0,  base: 420, perTok: 5.1 },
  "gemini-2.5-pro":     { provider: "google",    in: 1.25, out: 10.0, base: 850, perTok: 10.4 },
  "gemini-2.5-flash":   { provider: "google",    in: 0.30, out: 2.5,  base: 360, perTok: 3.8 },
  "deepseek-v3-1":      { provider: "deepseek",  in: 0.27, out: 1.1,  base: 1100, perTok: 9.2 },
};

export const MODEL_IDS = Object.keys(MODELS);

/* Router route preferences by workload class; duplicates weight the pick. */
export const ROUTES = {
  coding:   ["claude-sonnet-4-5", "gpt-5", "claude-sonnet-4-5", "claude-opus-4-1", "deepseek-v3-1"],
  support:  ["gpt-5-mini", "claude-haiku-4-5", "gemini-2.5-flash", "gpt-5-mini"],
  analytics:["gpt-5", "gemini-2.5-pro", "claude-sonnet-4-5"],
  chat:     ["claude-haiku-4-5", "gpt-5-mini", "gemini-2.5-flash", "claude-sonnet-4-5"],
  docs:     ["gemini-2.5-flash", "claude-haiku-4-5", "gpt-5-mini"],
  travel:   ["gpt-5", "claude-sonnet-4-5", "gemini-2.5-pro"],
};

/* Where the router falls back when a model's provider is failing. */
export const FALLBACKS = {
  "claude-sonnet-4-5": "gpt-5",
  "claude-haiku-4-5": "gemini-2.5-flash",
  "claude-opus-4-1": "claude-sonnet-4-5",
  "gpt-5": "claude-sonnet-4-5",
  "gpt-5-mini": "claude-haiku-4-5",
  "gemini-2.5-pro": "gpt-5",
  "gemini-2.5-flash": "gpt-5-mini",
  "deepseek-v3-1": "gpt-5-mini",
};
