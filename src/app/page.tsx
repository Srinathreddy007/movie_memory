import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { GoogleIcon } from "@/components/GoogleIcon";

const STEPS = [
  { icon: "🔐", title: "Sign in", body: "One click with your Google account." },
  { icon: "🎞️", title: "Pick a movie", body: "Tell us the film you love most." },
  { icon: "✨", title: "Get a fun fact", body: "AI-powered trivia, fresh every visit." },
];

// Auth.js redirects here with ?error=<code> when sign-in fails.
function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "AccessDenied" || code === "access_denied") {
    return "Google sign-in was cancelled or not allowed. Please try again.";
  }
  return "We couldn't sign you in right now. Please try again.";
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
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-line bg-surface p-8 shadow-2xl shadow-violet-950/50 backdrop-blur">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-3xl ring-1 ring-accent/30">
            🎬
          </div>
          <h1 className="mt-5 text-center text-3xl font-bold tracking-tight">
            Movie <span className="text-accent">Memory</span>
          </h1>
          <p className="mt-2 text-center text-muted">
            Your favorite movie, remembered — plus a fun fact about it every time you visit.
          </p>

          {errorMessage && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-center text-sm text-danger"
            >
              {errorMessage}
            </p>
          )}

          <form action={signInWithGoogle} className="mt-8">
            {/* Google-branded button: white background, multicolor G, dark text. */}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-medium text-[#1f1f1f] shadow-sm ring-1 ring-black/10 transition hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </form>
          <p className="mt-3 text-center text-xs text-muted">
            We only use your name, email and profile photo.
          </p>
        </div>

        <ol className="mt-6 grid grid-cols-3 gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-line bg-surface p-3 text-center">
              <div className="text-xl">{step.icon}</div>
              <div className="mt-1 text-sm font-semibold">
                <span className="text-accent">{i + 1}.</span> {step.title}
              </div>
              <div className="mt-1 text-xs leading-snug text-muted">{step.body}</div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
