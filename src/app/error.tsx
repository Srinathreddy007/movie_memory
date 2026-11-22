"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshIcon } from "@/components/icons";
import { StatusCard, primaryButton, secondaryButton } from "@/components/StatusCard";

/**
 * Error boundary for every page (e.g. Postgres unreachable while rendering the
 * dashboard). Shows a friendly message only, never the technical error, which
 * could leak internals. In production Next.js strips server error details and
 * passes a `digest` that matches the server log entry.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <StatusCard
      emoji="😞"
      label="Something went wrong"
      title="The projector jammed"
      message="We hit an unexpected problem on our side. Please try again in a moment."
    >
      <button type="button" onClick={reset} className={primaryButton}>
        <RefreshIcon />
        Try again
      </button>
      <Link href="/" className={secondaryButton}>
        Go home
      </Link>
      {error.digest && <p className="w-full pt-1 text-xs text-muted">Reference: {error.digest}</p>}
    </StatusCard>
  );
}
