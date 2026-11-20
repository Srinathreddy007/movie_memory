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
const { GET } = await import("@/app/api/fact/route");

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
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

describe("authorization: GET /api/fact", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Please sign in." },
    });
  });

  it("serves only the session user's facts", async () => {
    const { userA, factA } = await seedUserAWithFact();
    const userB = await createUser("Inception");
    authMock.mockResolvedValue({ user: { id: userB.id } });

    const res = await GET();
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

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ source: "cache", fact: { id: factA.id } });
  });

  it("returns 409 NO_MOVIE for a signed-in user who has not onboarded", async () => {
    const user = await createUser(null);
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await GET();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_MOVIE");
  });
});
