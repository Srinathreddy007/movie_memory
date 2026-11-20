import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import type { ApiErrorBody, ApiErrorCode } from "@/shared/api-types";

// API responses are per-user: never let a browser or proxy cache them.
const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function apiError(code: ApiErrorCode, message: string, status: number) {
  const body: ApiErrorBody = { error: { code, message } };
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export const unauthorized = () => apiError("UNAUTHORIZED", "Please sign in.", 401);

/**
 * The authenticated user's id, read from the session cookie — or null.
 * This is the ONLY way endpoints learn who the caller is; no endpoint accepts
 * a user id from the URL or body, so users can't target each other's data.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
