import { apiError, getSessionUserId, ok, unauthorized } from "@/server/http";
import { setFavoriteMovie } from "@/server/services/users";
import type { UpdateMovieResponse } from "@/shared/api-types";

export const dynamic = "force-dynamic";

/**
 * PUT /api/me/movie — set the signed-in user's favorite movie.
 *
 * Body: { movie: string }   (trimmed server-side, 1–120 characters)
 *
 * 200 { user: { id, name, email, image, favoriteMovie } }
 * 400 { error: { code: "VALIDATION_ERROR", message } }
 * 401 { error: { code: "UNAUTHORIZED", message } }
 *
 * Only ever updates the session user's own row — there is no user id input.
 */
export async function PUT(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be JSON.", 400);
  }
  const movie = (body as { movie?: unknown } | null)?.movie;

  const result = await setFavoriteMovie(userId, movie);
  if (result.ok) return ok<UpdateMovieResponse>({ user: result.user });
  if (result.code === "VALIDATION_ERROR") return apiError(result.code, result.message, 400);
  return unauthorized(); // NOT_FOUND: session for a deleted user
}
