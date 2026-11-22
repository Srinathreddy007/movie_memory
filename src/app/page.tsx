import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { GoogleIcon } from "@/components/GoogleIcon";
import { AlertIcon, CheckIcon, ClapperIcon, InfoIcon } from "@/components/icons";

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

// Why the user was sent here (set by our own redirects).
const NOTICES: Record<string, string> = {
  "signin-required": "Please sign in to view your dashboard.",
  "signed-out": "You've been signed out. See you next time!",
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  // Signed-in users skip the landing page. /dashboard decides between
  // onboarding (first-time) and the dashboard itself (returning).
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  const params = await searchParams;
  const errorMessage = authErrorMessage(params.error);
  const notice = !errorMessage && params.notice ? NOTICES[params.notice] : undefined;

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-[#0e0c22]/85 shadow-2xl shadow-black/60 backdrop-blur-xl md:grid-cols-[1.1fr_1fr]">
        {/* ── Left: brand + how it works ─────────────────────────────── */}
        <section className="relative border-b border-line p-8 md:border-r md:border-b-0 md:p-10">
          {/* soft gold glow behind the brand */}
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
            <span className="bg-gradient-to-r from-accent to-[#c99a3e] bg-clip-text text-transparent">
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

          {notice && (
            <div
              role="status"
              className="mt-6 flex gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent"
            >
              <InfoIcon />
              <span>{notice}</span>
            </div>
          )}

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
              Sign in with Google
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
