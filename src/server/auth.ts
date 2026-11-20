import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/server/db";

/**
 * Auth.js configuration.
 *
 * - Google is the only provider. AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET
 *   are read from the environment automatically and never reach the client.
 * - JWT sessions: the session is an encrypted, httpOnly cookie holding only our
 *   DB user id. No session/account tables are needed.
 * - On each Google sign-in we upsert the User row keyed by Google's `sub`, so
 *   name/photo stay fresh and returning users map to the same row.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  // Send both the sign-in page and auth errors back to the landing page, which
  // shows a friendly message for ?error=... instead of Auth.js's default page.
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // `account` and `profile` are only present on the sign-in request.
      if (account?.provider === "google" && profile?.sub) {
        const user = await prisma.user.upsert({
          where: { googleId: profile.sub },
          create: {
            googleId: profile.sub,
            email: profile.email ?? null,
            name: profile.name ?? null,
            image: (profile.picture as string | undefined) ?? null,
          },
          update: {
            email: profile.email ?? null,
            name: profile.name ?? null,
            image: (profile.picture as string | undefined) ?? null,
          },
          select: { id: true },
        });
        token.uid = user.id;
      }
      return token;
    },
    // Expose only the DB user id; everything else is loaded from the DB.
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
