import "server-only";
import { prisma } from "@/server/db";
import { parseMovie } from "@/shared/validation";
import type { MeDTO } from "@/shared/api-types";

const ME_SELECT = { id: true, name: true, email: true, image: true, favoriteMovie: true } as const;

/** The user's own profile, or null if the row no longer exists. */
export function getMe(userId: string): Promise<MeDTO | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: ME_SELECT });
}

export type SetMovieResult =
  | { ok: true; user: MeDTO }
  | { ok: false; code: "VALIDATION_ERROR"; message: string }
  | { ok: false; code: "NOT_FOUND" };

/**
 * Validates (trim, 1–120 chars) and saves the favorite movie for `userId`.
 * `userId` must come from the session; the update is scoped to that row only.
 */
export async function setFavoriteMovie(userId: string, input: unknown): Promise<SetMovieResult> {
  const parsed = parseMovie(input);
  if (!parsed.ok) return { ok: false, code: "VALIDATION_ERROR", message: parsed.error };

  const { count } = await prisma.user.updateMany({
    where: { id: userId },
    data: { favoriteMovie: parsed.movie },
  });
  if (count === 0) return { ok: false, code: "NOT_FOUND" };

  const user = await getMe(userId);
  return user ? { ok: true, user } : { ok: false, code: "NOT_FOUND" };
}
