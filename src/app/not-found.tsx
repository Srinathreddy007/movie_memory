import type { Metadata } from "next";
import Link from "next/link";
import { StatusCard, primaryButton } from "@/components/StatusCard";

export const metadata: Metadata = { title: "Page not found · Movie Memory" };

/** Shown for any unknown URL (e.g. /dashbord). */
export default function NotFound() {
  return (
    <StatusCard
      emoji="😢"
      label="404 · Page not found"
      title="This scene isn't in the script"
      message="The page you're looking for doesn't exist or has moved."
    >
      {/* "/" sends signed-in users on to their dashboard automatically. */}
      <Link href="/" className={primaryButton}>
        Back to Movie Memory
      </Link>
    </StatusCard>
  );
}
