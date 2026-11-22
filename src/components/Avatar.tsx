import Image from "next/image";

const SIZES = {
  sm: { px: 32, box: "h-8 w-8 text-xs ring-1" },
  lg: { px: 80, box: "h-20 w-20 text-2xl ring-2" },
} as const;

/** Google profile photo, or initials when the user has no photo. */
export function Avatar({
  name,
  image,
  size = "lg",
}: {
  name: string | null;
  image: string | null;
  size?: keyof typeof SIZES;
}) {
  const { px, box } = SIZES[size];

  if (image) {
    return (
      <Image
        src={image}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        width={px}
        height={px}
        className={`${box} flex-none rounded-full object-cover ring-accent/60`}
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
      className={`${box} flex flex-none items-center justify-center rounded-full bg-accent/15 font-bold text-accent ring-accent/60`}
    >
      {initials}
    </div>
  );
}
