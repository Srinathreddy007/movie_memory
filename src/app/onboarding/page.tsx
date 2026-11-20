import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await requireUser(); // signed out → "/"
  if (user.favoriteMovie) redirect("/dashboard"); // onboarding is first-time only

  const firstName = user.name?.split(" ")[0];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-2xl shadow-violet-950/50 backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-3xl ring-1 ring-accent/30">
          🍿
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold tracking-tight">
          Welcome{firstName ? `, ${firstName}` : ""}!
        </h1>
        <p className="mt-2 text-center text-muted">
          What&apos;s your all-time <span className="text-accent">favorite movie</span>?
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
