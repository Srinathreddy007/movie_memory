import { redirect } from "next/navigation";
import { signOut } from "@/server/auth";
import { requireUser } from "@/server/session";
import { Avatar } from "@/components/Avatar";
import { GoogleIcon } from "@/components/GoogleIcon";
import { CalendarIcon, ClapperIcon, LogoutIcon, MailIcon } from "@/components/icons";
import { FactCard } from "./FactCard";

// Poster tile colour schemes — picked deterministically from the title so the
// same movie always gets the same "poster".
const POSTERS = [
  "from-[#3b1d6e] via-[#1e1446] to-[#0e0c22]",
  "from-[#5a3a12] via-[#2a1a0c] to-[#0e0c22]",
  "from-[#5b1630] via-[#2a0f22] to-[#0e0c22]",
  "from-[#123a4a] via-[#0f1f33] to-[#0e0c22]",
];

function posterFor(title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POSTERS[h % POSTERS.length];
}

function initialsOf(title: string) {
  const words = title.replace(/^(the|a|an)\s+/i, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export default async function DashboardPage() {
  const user = await requireUser(); // signed out → "/"
  if (!user.favoriteMovie) redirect("/onboarding"); // first-time user

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/?notice=signed-out" });
  }

  const firstName = user.name?.trim().split(/\s+/)[0] || "there";
  const movie = user.favoriteMovie;
  const memberSince = user.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-line bg-[#0b0a1a]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <ClapperIcon className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">
              Movie <span className="text-accent">Memory</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <Avatar name={user.name} image={user.image} size="sm" />
              <span className="max-w-40 truncate text-sm text-muted">{user.name?.trim() || user.email || "Signed in"}</span>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-accent/40 hover:bg-surface-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <LogoutIcon />
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Welcome back, <span className="text-accent">{firstName}</span>
        </h1>
        <p className="mt-1 text-muted">Here&apos;s your movie and today&apos;s piece of trivia.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* ── Left: now showing + fun fact ──────────────────────────── */}
          <div className="space-y-6 lg:col-span-2">
            {/* Favorite movie, styled like a cinema marquee */}
            <section className="relative overflow-hidden rounded-3xl border border-line bg-[#0e0c22]/85 p-6 backdrop-blur-xl md:p-8">
              <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
                {/* Generated poster */}
                <div
                  aria-hidden
                  className={`relative flex aspect-[2/3] w-28 flex-none flex-col items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${posterFor(movie)} shadow-2xl shadow-black/60 ring-1 ring-white/10`}
                >
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
                  <ClapperIcon className="h-6 w-6 text-accent/80" />
                  <span className="mt-2 text-2xl font-black tracking-tight text-foreground/90">
                    {initialsOf(movie)}
                  </span>
                </div>

                <div className="min-w-0">
                  {/* Marquee label with bulb lights */}
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1">
                    <span className="flex gap-1" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="marquee-bulb h-1.5 w-1.5 rounded-full bg-accent"
                          style={{ animationDelay: `${i * 0.3}s` }}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-semibold tracking-widest text-accent uppercase">
                      Now showing
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-medium tracking-wider text-muted uppercase">
                    Your favorite movie
                  </p>
                  <h2 className="mt-1 text-3xl leading-tight font-bold tracking-tight break-words md:text-4xl">
                    {movie}
                  </h2>
                </div>
              </div>
            </section>

            {/* Fun fact — last one shown via GET /api/fact; new ones only on click (POST) */}
            <FactCard userId={user.id} movie={movie} />
          </div>

          {/* ── Right: profile ────────────────────────────────────────── */}
          <aside className="h-fit rounded-3xl border border-line bg-[#0e0c22]/85 p-6 backdrop-blur-xl">
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">Your profile</p>

            <div className="mt-5 flex flex-col items-center text-center">
              <Avatar name={user.name} image={user.image} size="lg" />
              <p className="mt-4 max-w-full truncate text-lg font-semibold">{user.name?.trim() || "Movie fan"}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted">
                <GoogleIcon className="h-3.5 w-3.5" />
                Signed in with Google
              </span>
            </div>

            <dl className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
              <div className="flex items-center gap-3">
                <dt className="text-accent">
                  <MailIcon />
                  <span className="sr-only">Email</span>
                </dt>
                <dd className="min-w-0 truncate text-muted">{user.email ?? "No email on file"}</dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="text-accent">
                  <CalendarIcon />
                  <span className="sr-only">Member since</span>
                </dt>
                <dd className="text-muted">Member since {memberSince}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </main>
    </div>
  );
}
