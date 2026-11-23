import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, resetDb } from "./helpers";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth", () => ({ auth: authMock }));

const { getSignedInUserId } = await import("@/server/session");

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("getSignedInUserId (decides whether / skips to the dashboard)", () => {
  it("returns null without a session", async () => {
    authMock.mockResolvedValue(null);
    expect(await getSignedInUserId()).toBeNull();
  });

  it("returns the id when the session's user exists", async () => {
    const user = await createUser();
    authMock.mockResolvedValue({ user: { id: user.id } });
    expect(await getSignedInUserId()).toBe(user.id);
  });

  it("returns null for a valid cookie whose user was deleted (prevents the / ↔ /dashboard redirect loop)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-that-was-deleted" } });
    expect(await getSignedInUserId()).toBeNull();
  });
});
