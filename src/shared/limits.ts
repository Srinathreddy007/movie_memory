// Plain constants, safe to import from browser code without pulling in zod.
export const MOVIE_MIN = 1;
export const MOVIE_MAX = 120;

/** A user's latest fact is reused (not regenerated) while younger than this. */
export const FACT_CACHE_WINDOW_MS = 60_000;
