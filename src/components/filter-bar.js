"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useOptimistic, useRef } from "react";

/**
 * Filter state lives in the URL; the server does the filtering. Every control
 * mutates search params inside a transition, and the pending flag is exposed
 * as data-pending so the table (a server-rendered sibling) can dim via
 * group-has-data-pending.
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

function Popover({ label, active, children }) {
  return (
    <details className="group/pop relative">
      <summary
        className={`flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] transition-colors [&::-webkit-details-marker]:hidden ${
          active
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-edge bg-surface text-ink-dim hover:border-edge-strong hover:text-ink"
        }`}
      >
        {label}
        {active ? <span className="num text-2xs">{active}</span> : null}
        <svg width="8" height="8" viewBox="0 0 8 8" className="opacity-60 transition-transform group-open/pop:rotate-180">
          <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1.5 min-w-52 rounded-lg border border-edge-strong bg-overlay p-2 shadow-xl shadow-black/40">
        {children}
      </div>
    </details>
  );
}

function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] text-ink-dim hover:bg-raised hover:text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="checktick" />
      {children}
    </label>
  );
}

export function FilterBar({ models }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useOptimistic(false);
  const qRef = useRef(null);

  const current = {
    model: searchParams.get("model")?.split(",").filter(Boolean) ?? [],
    status: searchParams.get("status")?.split(",").filter(Boolean) ?? [],
    feedback: searchParams.get("feedback")?.split(",").filter(Boolean) ?? [],
    truncated: searchParams.get("truncated") === "1",
    toolErrors: searchParams.get("tool_errors") === "1",
    q: searchParams.get("q") ?? "",
    costMin: searchParams.get("cost_min") ?? "",
    costMax: searchParams.get("cost_max") ?? "",
    latMin: searchParams.get("lat_min") ?? "",
    latMax: searchParams.get("lat_max") ?? "",
  };
  const rangeActive = [current.costMin, current.costMax, current.latMin, current.latMax].filter(Boolean).length;
  const anyActive =
    current.model.length + current.status.length + current.feedback.length + rangeActive > 0 ||
    current.truncated ||
    current.toolErrors ||
    current.q;

  function apply(mutate) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // any filter change resets pagination
    startTransition(() => {
      setIsPending(true);
      router.replace(`/traces${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  }

  const setList = (key, values) =>
    apply((p) => (values.length ? p.set(key, values.join(",")) : p.delete(key)));
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
          <svg width="13" height="13" viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute">
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
        {STATUS_OPTIONS.map((s) => {
          const on = current.status.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggleIn("status", current.status, s)}
              className={`border-r border-edge px-2.5 py-1 font-mono text-xs transition-colors last:border-r-0 ${
                on
                  ? s === "2xx"
                    ? "bg-good/15 text-good"
                    : s === "5xx"
                      ? "bg-bad/15 text-bad"
                      : "bg-warn/15 text-warn"
                  : "bg-surface text-ink-mute hover:text-ink"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      <Popover label="Feedback" active={current.feedback.length || null}>
        {FEEDBACK_OPTIONS.map(([value, label]) => (
          <CheckRow
            key={value}
            checked={current.feedback.includes(value)}
            onChange={() => toggleIn("feedback", current.feedback, value)}
          >
            {label}
          </CheckRow>
        ))}
      </Popover>

      <button
        onClick={() => setFlag("truncated", !current.truncated)}
        className={`rounded-md border px-2.5 py-1 text-[13px] transition-colors ${
          current.truncated
            ? "border-warn/50 bg-warn/10 text-warn"
            : "border-edge bg-surface text-ink-dim hover:border-edge-strong hover:text-ink"
        }`}
      >
        Truncated
      </button>
      <button
        onClick={() => setFlag("tool_errors", !current.toolErrors)}
        className={`rounded-md border px-2.5 py-1 text-[13px] transition-colors ${
          current.toolErrors
            ? "border-bad/50 bg-bad/10 text-bad"
            : "border-edge bg-surface text-ink-dim hover:border-edge-strong hover:text-ink"
        }`}
      >
        Tool errors
      </button>

      <Popover label="Cost · latency" active={rangeActive || null}>
        <form
          className="space-y-2.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            apply((p) => {
              for (const [key, param] of [
                ["cost_min", "cost_min"],
                ["cost_max", "cost_max"],
                ["lat_min", "lat_min"],
                ["lat_max", "lat_max"],
              ]) {
                const v = String(fd.get(key) ?? "").trim();
                if (v) p.set(param, v);
                else p.delete(param);
              }
            });
          }}
        >
          <div>
            <div className="microlabel mb-1">cost, usd</div>
            <div className="flex items-center gap-1.5">
              <input name="cost_min" defaultValue={current.costMin} placeholder="min" inputMode="decimal" className="h-7 w-20 rounded border border-edge bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-mute focus:border-accent/60 focus:outline-none" />
              <span className="text-ink-mute">–</span>
              <input name="cost_max" defaultValue={current.costMax} placeholder="max" inputMode="decimal" className="h-7 w-20 rounded border border-edge bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-mute focus:border-accent/60 focus:outline-none" />
            </div>
          </div>
          <div>
            <div className="microlabel mb-1">latency, ms</div>
            <div className="flex items-center gap-1.5">
              <input name="lat_min" defaultValue={current.latMin} placeholder="min" inputMode="numeric" className="h-7 w-20 rounded border border-edge bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-mute focus:border-accent/60 focus:outline-none" />
              <span className="text-ink-mute">–</span>
              <input name="lat_max" defaultValue={current.latMax} placeholder="max" inputMode="numeric" className="h-7 w-20 rounded border border-edge bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-mute focus:border-accent/60 focus:outline-none" />
            </div>
          </div>
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
              for (const k of ["model", "status", "feedback", "truncated", "tool_errors", "q", "cost_min", "cost_max", "lat_min", "lat_max"]) {
                p.delete(k);
              }
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
