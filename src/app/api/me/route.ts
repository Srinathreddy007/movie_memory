import { getSessionUserId, ok, unauthorized } from "@/server/http";
import { getMe } from "@/server/services/users";
import type { GetMeResponse } from "@/shared/api-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/me → the signed-in user's profile.
 *
 * 200 { user: { id, name, email, image, favoriteMovie } }   (fields may be null)
 * 401 { error: { code: "UNAUTHORIZED", message } }
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const user = await getMe(userId);
  if (!user) return unauthorized(); // session for a deleted user

  return ok<GetMeResponse>({ user });
}
