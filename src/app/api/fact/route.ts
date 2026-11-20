import { apiError, getSessionUserId, ok, unauthorized } from "@/server/http";
import { generateMovieFact } from "@/server/openai";
import { getFactForUser } from "@/server/services/facts";
import type { GetFactResponse } from "@/shared/api-types";

// Per-user, per-request data: never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * GET /api/fact → a fun fact about the signed-in user's favorite movie.
 *
 * 200 { fact: { id, movie, content, createdAt }, source: "fresh" | "cache" | "fallback" }
 * 401 { error: { code: "UNAUTHORIZED", message } }       not signed in
 * 409 { error: { code: "NO_MOVIE", message } }           onboarding not completed
 * 503 { error: { code: "FACT_UNAVAILABLE", message } }   OpenAI failed and no fact exists yet
 *
 * There is deliberately no userId parameter: the user is always the session user,
 * so one user can never request another user's facts.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const result = await getFactForUser(userId, { generateFact: generateMovieFact });
  if (result.ok) return ok<GetFactResponse>({ fact: result.fact, source: result.source });
  return apiError(result.code, result.message, result.code === "NO_MOVIE" ? 409 : 503);
}
