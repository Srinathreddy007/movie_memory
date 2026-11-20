import Image from "next/image";

/** Google profile photo, or initials when the user has no photo. */
export function Avatar({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        width={72}
        height={72}
        className="h-18 w-18 rounded-full ring-2 ring-accent/60"
      />
    );
  }

  const initials =
    name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?";

  return (
    <div
      aria-label="Profile photo placeholder"
      className="flex h-18 w-18 items-center justify-center rounded-full bg-accent/15 text-2xl font-bold text-accent ring-2 ring-accent/60"
    >
      {initials}
    </div>
  );
}
