"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic, useRef } from "react";
import { Popover, CheckRow, RangeInputs } from "./filter-popover";

/**
 * The trace-explorer filter bar. Filter state lives in the URL; the server
 * does the filtering. Every control mutates search params inside a
 * transition, and pending state is exposed as data-pending so the table
 * (a server-rendered sibling) can dim via group-has-data-pending.
 */

const FEEDBACK_OPTIONS = [
  ["strong", "rated strong"],
  ["ok", "rated ok"],
  ["weak", "rated weak"],
  ["unrated", "unrated"],
  ["cont_accepted", "continuation accepted"],
  ["cont_rejected", "continuation rejected"],
  ["retried", "was retried away"],
  ["retry", "is a retry"],
];

const STATUS_OPTIONS = ["2xx", "4xx", "5xx"];
const STATUS_ACTIVE_STYLES = {
  "2xx": "bg-good/15 text-good",
  "4xx": "bg-warn/15 text-warn",
  "5xx": "bg-bad/15 text-bad",
};
const RANGE_KEYS = ["cost_min", "cost_max", "lat_min", "lat_max"];
const ALL_FILTER_KEYS = ["model", "status", "feedback", "truncated", "tool_errors", "q", ...RANGE_KEYS];

/** Read the current filter state out of the URL search params. */
function readCurrent(searchParams) {
  const list = (key) => searchParams.get(key)?.split(",").filter(Boolean) ?? [];
  return {
    model: list("model"),
    status: list("status"),
    feedback: list("feedback"),
    truncated: searchParams.get("truncated") === "1",
    toolErrors: searchParams.get("tool_errors") === "1",
    q: searchParams.get("q") ?? "",
    ranges: RANGE_KEYS.map((k) => searchParams.get(k) ?? ""),
  };
}

/** Toggle-style chip button used for the boolean facets. */
function FlagChip({ on, activeClass, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[13px] transition-colors ${
        on ? activeClass : "border-edge bg-surface text-ink-dim hover:border-edge-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The filter bar itself: search, model/feedback popovers, status chips,
 * boolean toggles, range popover, and clear-all. Receives the model list
 * from the server page; everything else derives from the URL.
 */
export function FilterBar({ models }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useOptimistic(false);
  const qRef = useRef(null);

  const current = readCurrent(searchParams);
  const rangeActive = current.ranges.filter(Boolean).length;
  const anyActive =
    current.model.length + current.status.length + current.feedback.length + rangeActive > 0 ||
    current.truncated || current.toolErrors || Boolean(current.q);

  /** Apply a mutation to the URL params inside a transition; resets paging. */
  function apply(mutate) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // any filter change resets pagination
    startTransition(() => {
      setIsPending(true);
      router.replace(`/traces${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  }

  const setList = (key, values) => apply((p) => (values.length ? p.set(key, values.join(",")) : p.delete(key)));
  const toggleIn = (key, list, value) =>
    setList(key, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const setFlag = (key, on) => apply((p) => (on ? p.set(key, "1") : p.delete(key)));

  return (
    <div data-pending={isPending ? "" : undefined} className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply((p) => {
            const v = qRef.current?.value.trim();
            if (v) p.set("q", v);
            else p.delete("q");
          });
        }}
      >
        <div className="relative">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={qRef}
            name="q"
            defaultValue={current.q}
            placeholder="Search content, ids…"
            className="h-[30px] w-56 rounded-md border border-edge bg-surface pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-mute focus:border-accent/60 focus:outline-none"
          />
        </div>
      </form>

      <Popover label="Model" active={current.model.length || null}>
        {models.map((m) => (
          <CheckRow key={m} checked={current.model.includes(m)} onChange={() => toggleIn("model", current.model, m)}>
            <span className="font-mono text-xs">{m}</span>
          </CheckRow>
        ))}
      </Popover>

      <div className="flex overflow-hidden rounded-md border border-edge">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleIn("status", current.status, s)}
            className={`border-r border-edge px-2.5 py-1 font-mono text-xs transition-colors last:border-r-0 ${
              current.status.includes(s) ? STATUS_ACTIVE_STYLES[s] : "bg-surface text-ink-mute hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Popover label="Feedback" active={current.feedback.length || null}>
        {FEEDBACK_OPTIONS.map(([value, label]) => (
          <CheckRow key={value} checked={current.feedback.includes(value)} onChange={() => toggleIn("feedback", current.feedback, value)}>
            {label}
          </CheckRow>
        ))}
      </Popover>

      <FlagChip on={current.truncated} activeClass="border-warn/50 bg-warn/10 text-warn" onClick={() => setFlag("truncated", !current.truncated)}>
        Truncated
      </FlagChip>
      <FlagChip on={current.toolErrors} activeClass="border-bad/50 bg-bad/10 text-bad" onClick={() => setFlag("tool_errors", !current.toolErrors)}>
        Tool errors
      </FlagChip>

      <Popover label="Cost · latency" active={rangeActive || null}>
        <form
          className="space-y-2.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            apply((p) => {
              for (const key of RANGE_KEYS) {
                const v = String(fd.get(key) ?? "").trim();
                if (v) p.set(key, v);
                else p.delete(key);
              }
            });
          }}
        >
          <RangeInputs label="cost, usd" minName="cost_min" maxName="cost_max" minValue={current.ranges[0]} maxValue={current.ranges[1]} inputMode="decimal" />
          <RangeInputs label="latency, ms" minName="lat_min" maxName="lat_max" minValue={current.ranges[2]} maxValue={current.ranges[3]} inputMode="numeric" />
          <button type="submit" className="w-full rounded border border-edge bg-raised py-1 text-xs text-ink hover:bg-overlay">
            Apply
          </button>
        </form>
      </Popover>

      {anyActive ? (
        <button
          onClick={() => {
            if (qRef.current) qRef.current.value = "";
            apply((p) => {
              for (const k of ALL_FILTER_KEYS) p.delete(k);
            });
          }}
          className="px-1.5 py-1 text-[13px] text-ink-mute underline decoration-edge-strong underline-offset-4 transition-colors hover:text-ink"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
