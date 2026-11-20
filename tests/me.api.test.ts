import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, prisma, resetDb } from "./helpers";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth", () => ({ auth: authMock }));

const { GET: getMe } = await import("@/app/api/me/route");
const { PUT: putMovie } = await import("@/app/api/me/movie/route");

function putRequest(body: unknown) {
  return new Request("http://localhost/api/me/movie", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("GET /api/me", () => {
  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await getMe();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns the session user's profile, with null-safe fields", async () => {
    const user = await prisma.user.create({
      data: { googleId: "g-no-photo", email: "a@example.com", name: null, image: null },
    });
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await getMe();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: user.id, name: null, email: "a@example.com", image: null, favoriteMovie: null },
    });
  });
});

describe("PUT /api/me/movie", () => {
  it("returns 401 without a session and changes nothing", async () => {
    authMock.mockResolvedValue(null);
    const res = await putMovie(putRequest({ movie: "Arrival" }));
    expect(res.status).toBe(401);
  });

  it("trims and saves the movie for the session user", async () => {
    const user = await createUser(null);
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await putMovie(putRequest({ movie: "   The   Matrix  " }));

    expect(res.status).toBe(200);
    expect((await res.json()).user.favoriteMovie).toBe("The Matrix");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.favoriteMovie).toBe("The Matrix");
  });

  it.each([
    ["blank", { movie: "   " }],
    ["too long", { movie: "x".repeat(121) }],
    ["missing", {}],
    ["wrong type", { movie: 42 }],
  ])("rejects a %s movie with 400 VALIDATION_ERROR", async (_label, body) => {
    const user = await createUser(null);
    authMock.mockResolvedValue({ user: { id: user.id } });

    const res = await putMovie(putRequest(body));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.favoriteMovie).toBeNull();
  });

  it("rejects a non-JSON body with 400", async () => {
    const user = await createUser(null);
    authMock.mockResolvedValue({ user: { id: user.id } });
    const res = await putMovie(putRequest("not json"));
    expect(res.status).toBe(400);
  });

  it("ignores any user id in the body: only the session user's row changes", async () => {
    const victim = await createUser("Inception");
    const attacker = await createUser("Up");
    authMock.mockResolvedValue({ user: { id: attacker.id } });

    await putMovie(putRequest({ movie: "Hacked", userId: victim.id, id: victim.id }));

    const v = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    const a = await prisma.user.findUniqueOrThrow({ where: { id: attacker.id } });
    expect(v.favoriteMovie).toBe("Inception");
    expect(a.favoriteMovie).toBe("Hacked");
  });
});
