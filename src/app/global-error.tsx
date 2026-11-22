"use client";

import "./globals.css";
import { RefreshIcon } from "@/components/icons";
import { StatusCard, primaryButton } from "@/components/StatusCard";

/**
 * Last-resort boundary: used only if the root layout itself fails, so it must
 * render its own <html> and <body>. Kept minimal and dependency-free.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StatusCard
          emoji="😵"
          label="Something went wrong"
          title="The whole theater went dark"
          message="Movie Memory couldn't load. Please try again in a moment."
        >
          <button type="button" onClick={reset} className={primaryButton}>
            <RefreshIcon />
            Try again
          </button>
        </StatusCard>
      </body>
    </html>
  );
}
