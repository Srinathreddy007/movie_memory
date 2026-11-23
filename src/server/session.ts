import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

/**
 * Loads the signed-in user's row, or redirects to the landing page.
 * The user id comes only from the server-side session — never from the request.
 */
export async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/?notice=signin-required"); // logged out → sign-in page

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, favoriteMovie: true, createdAt: true },
  });
  // Session points at a deleted user: treat as signed out.
  if (!user) redirect("/?notice=signin-required");
  return user;
}

/**
 * The signed-in user's id, but only if that user still exists in the database.
 * A valid session cookie can outlive its user row (e.g. the account was
 * deleted), so the cookie alone is not proof of being signed in. Pages that
 * decide "signed in or not" must use this, so they agree with requireUser()
 * and can never bounce the browser between each other in a redirect loop.
 */
export async function getSignedInUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user?.id ?? null;
}
