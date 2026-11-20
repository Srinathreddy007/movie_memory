import { prisma } from "@/server/db";

export { prisma };

/** Empties the test database (facts cascade from users, but be explicit). */
export async function resetDb() {
  await prisma.fact.deleteMany();
  await prisma.user.deleteMany();
}

let seq = 0;
export async function createUser(favoriteMovie: string | null = "Interstellar") {
  seq += 1;
  return prisma.user.create({
    data: {
      googleId: `google-${seq}-${Date.now()}`,
      email: `user${seq}@example.com`,
      name: `User ${seq}`,
      favoriteMovie,
    },
  });
}

/** A controllable clock: `clock.now()` returns the current fake time. */
export function fakeClock(start = new Date("2026-01-01T12:00:00.000Z")) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}
