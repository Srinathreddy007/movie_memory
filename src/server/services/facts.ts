import "server-only";
import { prisma } from "@/server/db";
import type { FactDTO, FactSource } from "@/shared/api-types";
import { FACT_CACHE_WINDOW_MS } from "@/shared/limits";

/**
 * Fact service — Variant A (caching + correctness).
 *
 * Guarantees:
 *  1. Cache window: if the latest fact for (user, movie) is < 60s old, it is
 *     returned and OpenAI is not called.
 *  2. Burst protection: at most one OpenAI generation runs per user at a time,
 *     across tabs, requests and server instances (the lock lives in Postgres).
 *  3. Failure handling: if OpenAI fails, the most recent fact is returned as a
 *     fallback; if there is none, a friendly error.
 *
 * Authorization: `userId` must come from the authenticated session. Every
 * query below is scoped by it — there is no code path that reads or writes
 * another user's facts.
 */

export const CACHE_WINDOW_MS = FACT_CACHE_WINDOW_MS; // shared with the UI countdown
/** Lease length. Must exceed the worst-case OpenAI call (8s timeout x 2 attempts). */
export const LOCK_TTL_MS = 30_000;
/** How long a request that lost the lock race waits for the winner's fact. */
const WAIT_FOR_LOCK_MS = 20_000;
const POLL_INTERVAL_MS = 250;

export type FactResult =
  | { ok: true; fact: FactDTO; source: FactSource }
  | { ok: false; code: "NO_MOVIE" | "FACT_UNAVAILABLE"; message: string };

export type FactDeps = {
  /** Produces fact text for a movie. Injected so tests don't call OpenAI. */
  generateFact: (movie: string) => Promise<string>;
  /** Clock. Injected so tests can move time without sleeping. */
  now?: () => Date;
  /** Delay between polls while waiting on another request's lock. */
  sleep?: (ms: number) => Promise<void>;
};

const UNAVAILABLE = {
  ok: false,
  code: "FACT_UNAVAILABLE",
  message: "We couldn't come up with a fun fact right now. Please try again in a moment.",
} as const;

type FactRow = { id: string; movie: string; content: string; createdAt: Date };

function toDTO(f: FactRow): FactDTO {
  return { id: f.id, movie: f.movie, content: f.content, createdAt: f.createdAt.toISOString() };
}

function isFresh(fact: FactRow | null, now: Date): fact is FactRow {
  return fact !== null && now.getTime() - fact.createdAt.getTime() < CACHE_WINDOW_MS;
}

/** Latest fact for this user + movie (served by the (userId, movie, createdAt DESC) index). */
function latestFact(userId: string, movie: string) {
  return prisma.fact.findFirst({
    where: { userId, movie },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Atomically claims the per-user generation lease. A single conditional UPDATE:
 * Postgres row-locks the user, so concurrent callers serialize and exactly one
 * sees the lease as free. Returns the lease expiry (our ownership token) or null.
 */
async function tryAcquireLock(userId: string, now: Date): Promise<Date | null> {
  const leaseUntil = new Date(now.getTime() + LOCK_TTL_MS);
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ factLockedUntil: null }, { factLockedUntil: { lt: now } }],
    },
    data: { factLockedUntil: leaseUntil },
  });
  return count === 1 ? leaseUntil : null;
}

/** Releases the lease only if we still own it (it may have expired and been re-taken). */
async function releaseLock(userId: string, leaseUntil: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, factLockedUntil: leaseUntil },
    data: { factLockedUntil: null },
  });
}

export async function getFactForUser(userId: string, deps: FactDeps): Promise<FactResult> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteMovie: true },
  });
  const movie = user?.favoriteMovie;
  if (!movie) {
    return { ok: false, code: "NO_MOVIE", message: "Add a favorite movie first." };
  }

  // 1. Cache hit: no lock, no OpenAI.
  const cached = await latestFact(userId, movie);
  if (isFresh(cached, now())) {
    return { ok: true, fact: toDTO(cached), source: "cache" };
  }

  // 2. Cache miss: only the request holding the lease may generate.
  const lease = await tryAcquireLock(userId, now());
  if (!lease) {
    return waitForOtherGeneration(userId, movie, cached, now, sleep);
  }

  try {
    // Double-check: another request may have finished between our cache read
    // and acquiring the lock.
    const recheck = await latestFact(userId, movie);
    if (isFresh(recheck, now())) {
      return { ok: true, fact: toDTO(recheck), source: "cache" };
    }

    let content: string;
    try {
      content = await deps.generateFact(movie);
    } catch (err) {
      // 3. OpenAI failed: serve the most recent fact if we have one.
      console.error("[facts] generation failed", err);
      return recheck ? { ok: true, fact: toDTO(recheck), source: "fallback" } : UNAVAILABLE;
    }

    // createdAt comes from the same clock the cache window is measured with.
    // Every generated fact is stored (1:many); the newest is the "current" one.
    const fact = await prisma.fact.create({
      data: { userId, movie, content, createdAt: now() },
    });
    return { ok: true, fact: toDTO(fact), source: "fresh" };
  } finally {
    await releaseLock(userId, lease);
  }
}

/**
 * Another request owns the lease. Poll until its fact lands (→ "cache"), or the
 * lease frees/expires without a new fact (owner failed → last fact or error).
 */
async function waitForOtherGeneration(
  userId: string,
  movie: string,
  stale: FactRow | null,
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
): Promise<FactResult> {
  const deadline = now().getTime() + WAIT_FOR_LOCK_MS;
  while (now().getTime() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const latest = await latestFact(userId, movie);
    if (isFresh(latest, now())) {
      return { ok: true, fact: toDTO(latest), source: "cache" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { factLockedUntil: true },
    });
    const lockHeld = user?.factLockedUntil && user.factLockedUntil > now();
    if (!lockHeld) break; // owner finished without producing a fresh fact
  }
  return stale ? { ok: true, fact: toDTO(stale), source: "fallback" } : UNAVAILABLE;
}

export type LatestFactResult =
  | { ok: true; fact: FactDTO | null }
  | { ok: false; code: "NO_MOVIE"; message: string };

/**
 * Read-only: the user's most recent stored fact for their current movie, or
 * null if none exists yet. Never calls OpenAI, never takes the lock — used to
 * show the last fact on page load. Generation only happens via getFactForUser.
 */
export async function getLatestFact(userId: string): Promise<LatestFactResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteMovie: true },
  });
  const movie = user?.favoriteMovie;
  if (!movie) return { ok: false, code: "NO_MOVIE", message: "Add a favorite movie first." };

  const latest = await latestFact(userId, movie);
  return { ok: true, fact: latest ? toDTO(latest) : null };
}
