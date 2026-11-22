import { apiError, getSessionUserId, ok, unauthorized } from "@/server/http";
import { generateMovieFact } from "@/server/openai";
import { getFactForUser, getLatestFact } from "@/server/services/facts";
import type { GetLatestFactResponse, RequestFactResponse } from "@/shared/api-types";

// Per-user, per-request data: never statically cache this route.
export const dynamic = "force-dynamic";

/*
 * There is deliberately no userId parameter on either method: the user is always
 * the session user, so one user can never read or create another user's facts.
 */

/**
 * GET /api/fact → the latest stored fact (read-only, never calls OpenAI).
 * Used on page load, so simply opening or refreshing the dashboard costs nothing.
 *
 * 200 { fact: { id, movie, content, createdAt } | null }   null = none generated yet
 * 401 { error: { code: "UNAUTHORIZED", message } }
 * 409 { error: { code: "NO_MOVIE", message } }
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const result = await getLatestFact(userId);
  if (result.ok) return ok<GetLatestFactResponse>({ fact: result.fact });
  return apiError(result.code, result.message, 409);
}

/**
 * POST /api/fact → request a fact (the "New fact" button). Variant A rules apply:
 * reuse a fact < 60s old, otherwise generate one (single-flight via the lease),
 * falling back to the last stored fact if OpenAI fails.
 *
 * 200 { fact: { id, movie, content, createdAt }, source: "fresh" | "cache" | "fallback" }
 * 401 { error: { code: "UNAUTHORIZED", message } }
 * 409 { error: { code: "NO_MOVIE", message } }
 * 503 { error: { code: "FACT_UNAVAILABLE", message } }   OpenAI failed and no fact exists yet
 */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const result = await getFactForUser(userId, { generateFact: generateMovieFact });
  if (result.ok) return ok<RequestFactResponse>({ fact: result.fact, source: result.source });
  return apiError(result.code, result.message, result.code === "NO_MOVIE" ? 409 : 503);
}
