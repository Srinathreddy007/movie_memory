import { redirect } from "next/navigation";
import { signOut } from "@/server/auth";
import { Avatar } from "@/components/Avatar";
import { requireUser } from "@/server/session";
import { FactCard } from "./FactCard";

export default async function DashboardPage() {
  const user = await requireUser(); // signed out → "/"
  if (!user.favoriteMovie) redirect("/onboarding"); // first-time user

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">
          🎬 Movie <span className="text-accent">Memory</span>
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:bg-surface-strong"
          >
            Log out
          </button>
        </form>
      </header>

      {/* Profile — name/email/photo come from Google, with graceful fallbacks. */}
      <section className="mt-8 flex items-center gap-5 rounded-3xl border border-line bg-surface p-6 backdrop-blur">
        <Avatar name={user.name} image={user.image} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">
            Hi, {user.name ?? "there"} 👋
          </h1>
          <p className="truncate text-muted">{user.email ?? "No email on file"}</p>
        </div>
      </section>

      {/* Favorite movie — from the DB. */}
      <section className="mt-5 rounded-3xl border border-line bg-surface p-6 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Your favorite movie
        </p>
        <p className="mt-2 text-3xl font-bold text-accent">{user.favoriteMovie}</p>
      </section>

      {/* Fun fact — fetched client-side from GET /api/fact. */}
      <FactCard />
    </main>
  );
}
