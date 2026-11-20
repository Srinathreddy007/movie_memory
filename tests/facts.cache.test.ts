import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFactForUser, CACHE_WINDOW_MS } from "@/server/services/facts";
import { createUser, fakeClock, prisma, resetDb } from "./helpers";

beforeEach(resetDb);

/** Generator that returns "fact #1", "fact #2", ... and records calls. */
function countingGenerator() {
  let n = 0;
  return vi.fn(async (movie: string) => `${movie} fact #${++n}`);
}

describe("60-second cache window", () => {
  it("generates and stores a fact when none exists", async () => {
    const user = await createUser("Interstellar");
    const clock = fakeClock();
    const generateFact = countingGenerator();

    const result = await getFactForUser(user.id, { generateFact, now: clock.now });

    expect(result).toMatchObject({ ok: true, source: "fresh" });
    expect(generateFact).toHaveBeenCalledTimes(1);
    expect(generateFact).toHaveBeenCalledWith("Interstellar");
    expect(await prisma.fact.count({ where: { userId: user.id } })).toBe(1);
  });

  it("returns the cached fact while it is less than 60 seconds old", async () => {
    const user = await createUser();
    const clock = fakeClock();
    const generateFact = countingGenerator();

    const first = await getFactForUser(user.id, { generateFact, now: clock.now });
    clock.advance(CACHE_WINDOW_MS - 1_000); // 59s later
    const second = await getFactForUser(user.id, { generateFact, now: clock.now });

    expect(second).toMatchObject({ ok: true, source: "cache" });
    if (!first.ok || !second.ok) throw new Error("expected success");
    expect(second.fact.id).toBe(first.fact.id);
    expect(generateFact).toHaveBeenCalledTimes(1);
    expect(await prisma.fact.count()).toBe(1);
  });

  it("generates a new fact once the latest one is 60 seconds old", async () => {
    const user = await createUser();
    const clock = fakeClock();
    const generateFact = countingGenerator();

    const first = await getFactForUser(user.id, { generateFact, now: clock.now });
    clock.advance(CACHE_WINDOW_MS); // exactly 60s: no longer "less than 60s old"
    const second = await getFactForUser(user.id, { generateFact, now: clock.now });

    expect(second).toMatchObject({ ok: true, source: "fresh" });
    if (!first.ok || !second.ok) throw new Error("expected success");
    expect(second.fact.id).not.toBe(first.fact.id);
    expect(generateFact).toHaveBeenCalledTimes(2);
    expect(await prisma.fact.count()).toBe(2); // old facts are kept as history
  });

  it("scopes the cache to the movie: changing the movie bypasses it", async () => {
    const user = await createUser("Interstellar");
    const clock = fakeClock();
    const generateFact = countingGenerator();

    await getFactForUser(user.id, { generateFact, now: clock.now });
    await prisma.user.update({ where: { id: user.id }, data: { favoriteMovie: "Arrival" } });
    clock.advance(5_000);
    const result = await getFactForUser(user.id, { generateFact, now: clock.now });

    expect(result).toMatchObject({ ok: true, source: "fresh", fact: { movie: "Arrival" } });
    expect(generateFact).toHaveBeenLastCalledWith("Arrival");
  });

  it("returns NO_MOVIE for a user who has not onboarded", async () => {
    const user = await createUser(null);
    const generateFact = countingGenerator();

    const result = await getFactForUser(user.id, { generateFact });

    expect(result).toMatchObject({ ok: false, code: "NO_MOVIE" });
    expect(generateFact).not.toHaveBeenCalled();
  });
});

describe("burst / idempotency protection", () => {
  it("runs a single generation for 5 simultaneous requests and returns the same fact to all", async () => {
    const user = await createUser();
    // Slow generator so all 5 requests overlap while it runs.
    const generateFact = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return "the one fact";
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => getFactForUser(user.id, { generateFact })),
    );

    expect(generateFact).toHaveBeenCalledTimes(1);
    expect(await prisma.fact.count()).toBe(1);
    const ids = new Set(results.map((r) => (r.ok ? r.fact.id : r.code)));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.ok && r.source === "fresh")).toHaveLength(1);
    // The lock is released afterwards.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.factLockedUntil).toBeNull();
  });

  it("recovers from an expired lock left behind by a crashed request", async () => {
    const user = await createUser();
    const clock = fakeClock();
    await prisma.user.update({
      where: { id: user.id },
      data: { factLockedUntil: new Date(clock.now().getTime() - 1_000) }, // expired
    });
    const generateFact = countingGenerator();

    const result = await getFactForUser(user.id, { generateFact, now: clock.now });

    expect(result).toMatchObject({ ok: true, source: "fresh" });
    expect(generateFact).toHaveBeenCalledTimes(1);
  });

  it("does not generate while another request holds the lock; falls back when it frees without a fact", async () => {
    const user = await createUser();
    const clock = fakeClock();
    // Stale fact from 2 minutes ago, and a live lock held by "another request".
    const stale = await prisma.fact.create({
      data: {
        userId: user.id,
        movie: "Interstellar",
        content: "old fact",
        createdAt: new Date(clock.now().getTime() - 120_000),
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { factLockedUntil: new Date(clock.now().getTime() + 1_000) },
    });
    const generateFact = countingGenerator();
    // Each poll advances the fake clock instead of really sleeping.
    const sleep = async (ms: number) => clock.advance(ms);

    const result = await getFactForUser(user.id, { generateFact, now: clock.now, sleep });

    expect(generateFact).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, source: "fallback", fact: { id: stale.id } });
  });
});

describe("OpenAI failure handling", () => {
  const failing = () => vi.fn(async () => Promise.reject(new Error("OpenAI timeout")));

  it("returns the most recent stored fact when generation fails", async () => {
    const user = await createUser();
    const clock = fakeClock();
    const first = await getFactForUser(user.id, { generateFact: countingGenerator(), now: clock.now });
    clock.advance(CACHE_WINDOW_MS + 1_000);

    const result = await getFactForUser(user.id, { generateFact: failing(), now: clock.now });

    if (!first.ok) throw new Error("expected success");
    expect(result).toMatchObject({ ok: true, source: "fallback", fact: { id: first.fact.id } });
    expect(await prisma.fact.count()).toBe(1); // nothing new stored
  });

  it("returns a friendly error when generation fails and no fact exists", async () => {
    const user = await createUser();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getFactForUser(user.id, { generateFact: failing() });

    expect(result).toMatchObject({ ok: false, code: "FACT_UNAVAILABLE" });
    if (result.ok) throw new Error("expected failure");
    expect(result.message).toMatch(/try again/i);
    // The lock is released even on failure.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.factLockedUntil).toBeNull();
  });
});
