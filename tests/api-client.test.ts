import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("typed API client", () => {
  it("returns the typed body on success", async () => {
    mockFetch(() => json(200, { fact: { id: "f1", movie: "Up", content: "c", createdAt: "t" }, source: "cache" }));
    await expect(api.getFact()).resolves.toMatchObject({ source: "cache", fact: { id: "f1" } });
  });

  it("normalizes a 401 into ApiError(UNAUTHORIZED)", async () => {
    mockFetch(() => json(401, { error: { code: "UNAUTHORIZED", message: "Please sign in." } }));
    const err = await api.getMe().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: "UNAUTHORIZED", isUnauthorized: true });
  });

  it("passes through the server's validation message on 400", async () => {
    mockFetch(() => json(400, { error: { code: "VALIDATION_ERROR", message: "Please enter a movie title." } }));
    await expect(api.updateMovie(" ")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Please enter a movie title.",
    });
  });

  it("normalizes a 500 with a non-JSON body into a generic ApiError", async () => {
    mockFetch(() => Promise.resolve(new Response("<html>oops</html>", { status: 500 })));
    await expect(api.getFact()).rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });

  it("normalizes a network failure into ApiError(NETWORK_ERROR)", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api.getFact()).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("sends PUT /api/me/movie with a JSON body", async () => {
    mockFetch(() => json(200, { user: { favoriteMovie: "Up" } }));
    await api.updateMovie("Up");
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/me/movie");
    expect(init).toMatchObject({ method: "PUT", body: JSON.stringify({ movie: "Up" }) });
  });
});
