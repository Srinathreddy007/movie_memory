"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { MOVIE_MAX } from "@/shared/limits";

export function OnboardingForm() {
  const router = useRouter();
  const [movie, setMovie] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // ignore double submits
    setPending(true);
    setError(null);
    try {
      // PUT /api/me/movie — the server trims + validates; it is the source of truth.
      await api.updateMovie(movie);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        window.location.href = "/?notice=signin-required"; // session expired
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3" noValidate>
      <label htmlFor="movie" className="block text-sm font-medium">
        Favorite movie
      </label>
      <input
        id="movie"
        name="movie"
        type="text"
        value={movie}
        onChange={(e) => setMovie(e.target.value)}
        maxLength={MOVIE_MAX}
        placeholder="e.g. Interstellar"
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "movie-error" : undefined}
        className="w-full rounded-xl border border-line bg-surface-strong px-4 py-3 text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {error && (
        <p id="movie-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
