/**
 * Typed browser client for the Movie Memory API.
 *
 * The frontend talks to the backend ONLY through this module. Every function
 * either resolves with the typed response body or throws an `ApiError` —
 * HTTP errors, malformed responses and network failures are all normalized
 * to that one shape, so UI code handles errors in a single way.
 */
import type {
  ApiErrorBody,
  ApiErrorCode,
  GetFactResponse,
  GetMeResponse,
  UpdateMovieRequest,
  UpdateMovieResponse,
} from "@/shared/api-types";

export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR";

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 for network failures
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  const err = (value as ApiErrorBody | null)?.error;
  return typeof err?.code === "string" && typeof err?.message === "string";
}

async function request<T>(method: "GET" | "PUT", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin", // send the session cookie
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Network error. Check your connection and try again.");
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (isErrorBody(data)) throw new ApiError(res.status, data.error.code, data.error.message);
    throw new ApiError(
      res.status,
      res.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
    );
  }
  if (data === null) {
    throw new ApiError(res.status, "INTERNAL_ERROR", "Unexpected response from the server.");
  }
  return data as T;
}

export const api = {
  /** GET /api/me */
  getMe: () => request<GetMeResponse>("GET", "/api/me"),

  /** PUT /api/me/movie — server trims and validates (1–120 chars). */
  updateMovie: (movie: string) =>
    request<UpdateMovieResponse>("PUT", "/api/me/movie", { movie } satisfies UpdateMovieRequest),

  /** GET /api/fact */
  getFact: () => request<GetFactResponse>("GET", "/api/fact"),
};
