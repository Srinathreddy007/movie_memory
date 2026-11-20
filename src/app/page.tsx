import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { GoogleIcon } from "@/components/GoogleIcon";

const STEPS = [
  { title: "Sign in with Google", body: "One click — no new password to remember." },
  { title: "Pick your favorite movie", body: "The one you could watch a hundred times." },
  { title: "Get a fun fact", body: "Fresh AI-powered trivia every time you visit." },
];

const PRIVACY = ["No password needed", "Only your name, email & photo", "Sign out any time"];

// Auth.js redirects here with ?error=<code> when sign-in fails.
function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "AccessDenied" || code === "access_denied") {
    return "Google sign-in was cancelled or not allowed. Please try again.";
  }
  return "We couldn't sign you in right now. Please try again.";
}

function ClapperIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4Z" />
      <path d="m4 11-.88-2.87a2 2 0 0 1 1.33-2.5l11.48-3.5a2 2 0 0 1 2.5 1.32l.87 2.87L4 11.01Z" />
      <path d="m6.6 4.99 3.38 4.2M11.86 3.38l3.38 4.2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-none text-accent" aria-hidden>
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 flex-none" aria-hidden>
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Signed-in users skip the landing page. /dashboard decides between
  // onboarding (first-time) and the dashboard itself (returning).
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  const errorMessage = authErrorMessage((await searchParams).error);

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-[#0e0c22]/85 shadow-2xl shadow-black/60 backdrop-blur-xl md:grid-cols-[1.1fr_1fr]">
        {/* ── Left: brand + how it works ─────────────────────────────── */}
        <section className="relative border-b border-line p-8 md:border-r md:border-b-0 md:p-10">
          {/* soft amber glow behind the brand */}
          <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-lg shadow-accent/20">
              <ClapperIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Movie <span className="text-accent">Memory</span>
            </span>
          </div>

          <h1 className="relative mt-8 text-3xl leading-tight font-bold tracking-tight md:text-4xl">
            Every film has a story.
            <br />
            <span className="bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">
              Discover yours.
            </span>
          </h1>
          <p className="relative mt-3 max-w-sm text-muted">
            Save your favorite movie and get a new piece of behind-the-scenes trivia every visit.
          </p>

          {/* Stepper */}
          <ol className="relative mt-8 space-y-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative flex gap-4">
                {i < STEPS.length - 1 && (
                  <span className="absolute top-8 left-[15px] h-[calc(100%-12px)] w-px bg-line" aria-hidden />
                )}
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-sm font-semibold text-accent">
                  {i + 1}
                </span>
                <div className="pt-1">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Right: sign-in pane ───────────────────────────────────── */}
        <section className="flex flex-col justify-center p-8 md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Continue to Movie Memory with your Google account.</p>

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              <AlertIcon />
              <span>{errorMessage}</span>
            </div>
          )}

          <form action={signInWithGoogle} className="mt-8">
            {/* Google-branded button: white background, multicolor G, dark text. */}
            <button
              type="submit"
              className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 font-medium text-[#1f1f1f] shadow-lg shadow-black/30 ring-1 ring-black/10 transition hover:-translate-y-px hover:bg-neutral-50 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0c22] active:translate-y-0"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <div className="my-7 flex items-center gap-3 text-xs tracking-wider text-muted uppercase">
            <span className="h-px flex-1 bg-line" />
            Your privacy
            <span className="h-px flex-1 bg-line" />
          </div>

          <ul className="space-y-2.5">
            {PRIVACY.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-muted">
                <CheckIcon />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-8 text-xs leading-relaxed text-muted">
            New here? Signing in creates your account automatically — you&apos;ll pick a movie next.
          </p>
        </section>
      </div>
    </main>
  );
}
