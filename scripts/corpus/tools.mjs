/**
 * Tool schemas available to the synthetic agents, in OpenAI function-tool
 * format. Scenario scripts reference these by key; `fn` wraps a schema into
 * the {type:"function", function} envelope requests carry.
 */

export const T = {
  read_file: { name: "read_file", description: "Read a file from the repository.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  write_file: { name: "write_file", description: "Create or overwrite a file with the given content.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  run_command: { name: "run_command", description: "Run a shell command in the project root and return stdout/stderr.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  grep_repo: { name: "grep_repo", description: "Search the repository for a pattern.", parameters: { type: "object", properties: { pattern: { type: "string" }, glob: { type: "string" } }, required: ["pattern"] } },
  lookup_order: { name: "lookup_order", description: "Fetch an order by id from the commerce backend.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
  issue_refund: { name: "issue_refund", description: "Issue a full or partial refund for an order.", parameters: { type: "object", properties: { order_id: { type: "string" }, amount_usd: { type: "number" }, reason: { type: "string" } }, required: ["order_id", "amount_usd", "reason"] } },
  send_email: { name: "send_email", description: "Send a transactional email to the customer on file.", parameters: { type: "object", properties: { order_id: { type: "string" }, template: { type: "string" } }, required: ["order_id", "template"] } },
  run_sql: { name: "run_sql", description: "Execute a read-only SQL query against the analytics warehouse.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  search_docs: { name: "search_docs", description: "Semantic search over the product documentation corpus.", parameters: { type: "object", properties: { query: { type: "string" }, top_k: { type: "number" } }, required: ["query"] } },
  search_flights: { name: "search_flights", description: "Search airline inventory for one-way or round-trip flights.", parameters: { type: "object", properties: { origin: { type: "string" }, destination: { type: "string" }, depart: { type: "string" }, return: { type: "string" } }, required: ["origin", "destination", "depart"] } },
  search_hotels: { name: "search_hotels", description: "Search hotel availability for a city and date range.", parameters: { type: "object", properties: { city: { type: "string" }, checkin: { type: "string" }, checkout: { type: "string" }, max_usd: { type: "number" } }, required: ["city", "checkin", "checkout"] } },
};

/** Wrap a tool schema in the request envelope: {type:"function", function}. */
export const fn = (t) => ({ type: "function", function: t });
