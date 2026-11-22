"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { FactDTO, FactSource } from "@/shared/api-types";
import { FACT_CACHE_WINDOW_MS } from "@/shared/limits";
import { AlertIcon, RefreshIcon, SparklesIcon } from "@/components/icons";

/**
 * Fun-fact card.
 * - On load it only READS the last stored fact (GET /api/fact) — opening or
 *   refreshing the dashboard never calls OpenAI.
 * - A fact is requested only when the user clicks the button (POST /api/fact),
 *   where the server applies the 60s cache, burst lock and fallback.
 */

/** The fact on screen. `source` is set only when it came from a button request. */
type Shown = { fact: FactDTO; source?: FactSource };

type State =
  | { status: "loading" } // first GET in flight
  | { status: "idle"; shown: Shown | null } // null = no fact generated yet
  | { status: "requesting"; shown: Shown | null } // button clicked, POST in flight
  | { status: "error"; shown: Shown | null; message: string };

const BADGE: Record<FactSource, { label: string; className: string }> = {
  fresh: { label: "Fresh", className: "border-accent/40 bg-accent/15 text-accent" },
  cache: { label: "Cached", className: "border-line bg-surface-strong text-muted" },
  fallback: { label: "Saved fact", className: "border-danger/40 bg-danger/10 text-danger" },
};

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Session expired: send the user back to sign in. Returns true if handled. */
function handleUnauthorized(err: unknown) {
  if (err instanceof ApiError && err.isUnauthorized) {
    window.location.href = "/?notice=signin-required";
    return true;
  }
  return false;
}

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

// Cross-tab sync: every dashboard tab of this browser shares the latest fact,
// so two tabs never show different facts for the same user + movie.
const CHANNEL = "movie-memory:fact";
type SyncMessage = { userId: string; movie: string; fact: FactDTO };

export function FactCard({ userId, movie }: { userId: string; movie: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Latest fact on screen, readable from callbacks without stale closures.
  const shownRef = useRef<Shown | null>(null);
  useEffect(() => {
    shownRef.current = state.status === "loading" ? null : state.shown;
  }, [state]);

  // Page load: read the last stored fact. Never generates.
  useEffect(() => {
    let cancelled = false;
    api
      .getLatestFact() // GET /api/fact
      .then(({ fact }) => {
        if (cancelled) return;
        setState((s) => (s.status === "loading" ? { status: "idle", shown: fact ? { fact } : null } : s));
      })
      .catch((err) => {
        if (cancelled || handleUnauthorized(err)) return;
        setState({ status: "error", shown: null, message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Button: request a fact. The server decides cache vs. new vs. fallback.
  const requestFact = useCallback(async () => {
    const previous = shownRef.current;
    setState({ status: "requesting", shown: previous });
    try {
      const { fact, source } = await api.requestFact(); // POST /api/fact
      setState({ status: "idle", shown: { fact, source } });
      setNow(Date.now());
      channelRef.current?.postMessage({ userId, movie, fact } satisfies SyncMessage);
    } catch (err) {
      if (handleUnauthorized(err)) return;
      setState({ status: "error", shown: previous, message: errorMessage(err) });
    }
  }, [userId, movie]);

  // Listen for facts requested in other tabs; adopt one if it's newer than ours.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent<SyncMessage>) => {
      const msg = e.data;
      if (msg?.userId !== userId || msg.movie !== movie) return; // other account / old movie
      setState((s) => {
        const current = s.status === "loading" ? null : s.shown?.fact;
        if (current && new Date(current.createdAt) >= new Date(msg.fact.createdAt)) return s;
        // Another tab produced it, so for this tab it is a reused (cached) fact.
        const shown: Shown = { fact: msg.fact, source: "cache" };
        return s.status === "requesting" ? { status: "requesting", shown } : { status: "idle", shown };
      });
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [userId, movie]);

  // Tick once a second so "12s ago" and the unlock countdown stay current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loading = state.status === "loading";
  const requesting = state.status === "requesting";
  const shown = state.status === "loading" ? null : state.shown;

  // Seconds until the server will generate a brand-new fact (Variant A cache).
  const secondsLeft = shown
    ? Math.ceil((new Date(shown.fact.createdAt).getTime() + FACT_CACHE_WINDOW_MS - now) / 1000)
    : 0;
  const progress = shown ? Math.min(1, Math.max(0, 1 - secondsLeft / (FACT_CACHE_WINDOW_MS / 1000))) : 0;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-line bg-[#0e0c22]/85 p-6 backdrop-blur-xl md:p-8"
      aria-live="polite"
      aria-busy={loading || requesting}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/30">
            <SparklesIcon />
          </div>
          <div>
            <p className="text-sm font-semibold">Fun fact</p>
            <p className="max-w-56 truncate text-xs text-muted">about {movie}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {shown?.source && (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE[shown.source].className}`}>
              {BADGE[shown.source].label}
            </span>
          )}
          <button
            type="button"
            onClick={() => void requestFact()}
            disabled={loading || requesting}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink shadow-lg shadow-accent/10 transition hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0c22] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon className={`h-4 w-4 ${requesting ? "animate-spin" : ""}`} />
            {requesting ? "Thinking…" : shown ? "New fact" : "Get a fun fact"}
          </button>
        </div>
      </div>

      {/* Error banner (keeps any fact that was already on screen) */}
      {state.status === "error" && (
        <div role="alert" className="mt-6 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertIcon />
          <span>{state.message}</span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="mt-6 space-y-3" aria-label="Loading fun fact">
          <div className="h-5 w-full animate-pulse rounded bg-surface-strong" />
          <div className="h-5 w-11/12 animate-pulse rounded bg-surface-strong" />
          <div className="h-5 w-3/5 animate-pulse rounded bg-surface-strong" />
        </div>
      ) : shown ? (
        <div className={requesting ? "opacity-50 transition" : "transition"}>
          <blockquote className="relative mt-6 border-l-2 border-accent/60 pl-5">
            <span aria-hidden className="absolute -top-4 -left-1 font-serif text-6xl leading-none text-accent/20">
              &ldquo;
            </span>
            <p className="text-lg leading-relaxed md:text-xl">{shown.fact.content}</p>
          </blockquote>

          {/* Footer: age + unlock countdown */}
          <div className="mt-6 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>Generated {timeAgo(shown.fact.createdAt, now)}</span>
              {shown.source === "fallback" ? (
                <span>Couldn&apos;t reach the AI — try again in a moment.</span>
              ) : secondsLeft > 0 ? (
                <span>
                  New fact unlocks in <span className="font-semibold text-foreground tabular-nums">{secondsLeft}s</span>
                </span>
              ) : (
                <span className="font-medium text-accent">Click “New fact” for a brand-new one</span>
              )}
            </div>
            {shown.source !== "fallback" && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      ) : state.status !== "error" ? (
        // Empty state: nothing generated yet for this movie
        <div className="mt-6 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="font-medium">{requesting ? "Asking the AI…" : "No fun fact yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {requesting
              ? `Finding something surprising about ${movie}.`
              : `Click “Get a fun fact” to discover something about ${movie}.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
