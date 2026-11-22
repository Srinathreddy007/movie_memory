import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFactForUser } from "@/server/services/facts";
import { createUser, prisma, resetDb } from "./helpers";

// Mock the two external boundaries of the route: the session and OpenAI.
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth", () => ({ auth: authMock }));
vi.mock("@/server/openai", () => ({
  generateMovieFact: vi.fn(async (movie: string) => `generated fact about ${movie}`),
}));

// Import after mocks are registered.
const { GET, POST } = await import("@/app/api/fact/route");
const { generateMovieFact } = await import("@/server/openai");

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  vi.mocked(generateMovieFact).mockClear();
});

/** User A with a fresh (cached) fact that must never leak to anyone else. */
async function seedUserAWithFact() {
  const userA = await createUser("Inception");
  const factA = await prisma.fact.create({
    data: { userId: userA.id, movie: "Inception", content: "A's private fact" },
  });
  return { userA, factA };
}

describe("authorization: service layer", () => {
  it("never returns another user's fact, even for the same movie", async () => {
    const { factA } = await seedUserAWithFact();
    const userB = await createUser("Inception"); // same title as A
    const generateFact = vi.fn(async () => "B's own fact");

    const result = await getFactForUser(userB.id, { generateFact });

    // A's fresh fact must not count as a cache hit for B.
    expect(result).toMatchObject({ ok: true, source: "fresh" });
    if (!result.ok) throw new Error("expected success");
    expect(result.fact.id).not.toBe(factA.id);
    expect(result.fact.content).toBe("B's own fact");
    expect(generateFact).toHaveBeenCalledTimes(1);
  });

  it("never falls back to another user's fact when OpenAI fails", async () => {
    await seedUserAWithFact();
    const userB = await createUser("Inception");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getFactForUser(userB.id, {
      generateFact: async () => Promise.reject(new Error("down")),
    });

    expect(result).toMatchObject({ ok: false, code: "FACT_UNAVAILABLE" });
  });
});

describe("authorization: POST /api/fact (request a fact)", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Please sign in." },
    });
  });

  it("serves only the session user's facts", async () => {
    const { userA, factA } = await seedUserAWithFact();
    const userB = await createUser("Inception");
    authMock.mockResolvedValue({ user: { id: userB.id } });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fact.id).not.toBe(factA.id);
    expect(body.fact.content).not.toContain("A's private fact");
    // The new fact belongs to B; A's data is untouched.
    const stored = await prisma.fact.findUniqueOrThrow({ where: { id: body.fact.id } });
    expect(stored.userId).toBe(userB.id);
    expect(await prisma.fact.count({ where: { userId: userA.id } })).toBe(1);
  });

  it("returns the session user's own cached fact", async () => {
    const { userA, factA } = await seedUserAWithFact();
    authMock.mockResolvedValue({ user: { id: userA.id } });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ source: "cache", fact: { id: factA.id } });
  });

  it("returns 409 NO_MOVIE for a signed-in user who has not onboarded", async () => {
    const user = await createUser(null);
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await POST();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_MOVIE");
  });
});

describe("GET /api/fact (read-only latest fact)", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns null and never calls OpenAI when no fact exists yet", async () => {
    const user = await createUser("Inception");
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fact: null });
    expect(generateMovieFact).not.toHaveBeenCalled();
    expect(await prisma.fact.count()).toBe(0);
  });

  it("returns the session user's most recent fact without generating, even if it is stale", async () => {
    const user = await createUser("Inception");
    await prisma.fact.create({
      data: { userId: user.id, movie: "Inception", content: "old", createdAt: new Date(Date.now() - 3_600_000) },
    });
    const latest = await prisma.fact.create({
      data: { userId: user.id, movie: "Inception", content: "newest", createdAt: new Date(Date.now() - 600_000) },
    });
    authMock.mockResolvedValue({ user: { id: user.id } });

    const body = await (await GET()).json();

    expect(body.fact).toMatchObject({ id: latest.id, content: "newest" });
    expect(generateMovieFact).not.toHaveBeenCalled();
    expect(await prisma.fact.count()).toBe(2);
  });

  it("never returns another user's fact, even for the same movie", async () => {
    await seedUserAWithFact();
    const userB = await createUser("Inception");
    authMock.mockResolvedValue({ user: { id: userB.id } });

    expect(await (await GET()).json()).toEqual({ fact: null });
  });

  it("returns 409 NO_MOVIE for a user who has not onboarded", async () => {
    const user = await createUser(null);
    authMock.mockResolvedValue({ user: { id: user.id } });
    expect((await GET()).status).toBe(409);
  });
});
