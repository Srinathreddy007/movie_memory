import { z } from "zod";
import { MOVIE_MAX, MOVIE_MIN } from "./limits";

export { MOVIE_MAX, MOVIE_MIN };

/**
 * Favorite-movie input rule. Always run on the server — client-side checks are
 * only a convenience and can be bypassed.
 * - trims surrounding whitespace and collapses internal runs of whitespace
 * - 1..120 characters after trimming
 */
export const movieSchema = z
  .string({ error: "Please enter a movie title." })
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(MOVIE_MIN, "Please enter a movie title.")
      .max(MOVIE_MAX, `Movie title must be ${MOVIE_MAX} characters or fewer.`),
  );

export type ParseMovieResult = { ok: true; movie: string } | { ok: false; error: string };

/** Validates untrusted input (e.g. a FormData value) into a clean movie title. */
export function parseMovie(input: unknown): ParseMovieResult {
  const result = movieSchema.safeParse(input);
  return result.success
    ? { ok: true, movie: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? "Invalid movie title." };
}
