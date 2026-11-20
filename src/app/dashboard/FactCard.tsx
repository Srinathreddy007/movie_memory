"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { FactDTO, FactSource } from "@/shared/api-types";

type State =
  | { status: "loading"; previous?: { fact: FactDTO; source: FactSource } }
  | { status: "ready"; fact: FactDTO; source: FactSource }
  | { status: "error"; message: string };

const SOURCE_LABEL: Record<FactSource, string> = {
  fresh: "Freshly generated",
  cache: "Generated less than a minute ago",
  fallback: "Showing your last fact — we couldn't get a new one right now",
};

export function FactCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState((s) => ({
      status: "loading",
      previous: s.status === "ready" ? { fact: s.fact, source: s.source } : undefined,
    }));
    try {
      const { fact, source } = await api.getFact(); // GET /api/fact
      setState({ status: "ready", fact, source });
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        window.location.href = "/"; // session expired
        return;
      }
      setState({
        status: "error",
        message: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown =
    state.status === "ready" ? state : state.status === "loading" ? state.previous : undefined;

  return (
    <section className="mt-5 rounded-3xl border border-line bg-surface p-6 backdrop-blur" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">✨ Fun fact</p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.status === "loading"}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === "loading" ? "Thinking…" : "New fact"}
        </button>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      ) : shown ? (
        <div className={state.status === "loading" ? "opacity-50 transition" : ""}>
          <p className="mt-4 text-lg leading-relaxed">{shown.fact.content}</p>
          <p className="mt-3 text-xs text-muted">{SOURCE_LABEL[shown.source]}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2" aria-label="Loading fun fact">
          <div className="h-4 w-full animate-pulse rounded bg-surface-strong" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-surface-strong" />
        </div>
      )}
    </section>
  );
}
