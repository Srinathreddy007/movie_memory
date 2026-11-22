import type { ReactNode } from "react";

/** Shared themed card for full-page states: 404 and unexpected errors. */
export function StatusCard({
  emoji,
  label,
  title,
  message,
  children,
}: {
  emoji: string;
  label: string;
  title: string;
  message: string;
  children: ReactNode; // action buttons
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-line bg-[#0e0c22]/85 p-8 text-center shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div aria-hidden className="status-emoji text-7xl leading-none">
          {emoji}
        </div>
        <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-accent uppercase">{label}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">{message}</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">{children}</div>
      </div>
    </main>
  );
}

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-ink transition hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0c22]";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-2.5 font-medium transition hover:border-accent/40 hover:bg-surface-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
