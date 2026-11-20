# 🎬 Movie Memory

Sign in with Google, save your favorite movie, and get an AI-generated fun fact about it.

Built for the SWE full-stack take-home: the **base implementation**, plus **Variant A, Backend-Focused (caching & correctness)**.

**Stack:** TypeScript · Next.js 15 (App Router) · React 19 · TailwindCSS 4 · Postgres · Prisma 6 · Auth.js v5 (Google OAuth) · OpenAI API · Vitest

---

## Contents
1. [Quick start](#1-quick-start)
2. [Environment variables](#2-environment-variables)
3. [Database & migrations](#3-database--migrations)
4. [Running tests](#4-running-tests)
5. [Architecture overview](#5-architecture-overview)
6. [Variant choice: A (Backend)](#6-variant-choice-a-backend)
7. [Key tradeoffs](#7-key-tradeoffs)
8. [With 2 more hours](#8-with-2-more-hours)
9. [AI usage](#9-ai-usage)

---

## 1. Quick start

**Prerequisites:** Node.js 22+, pnpm, PostgreSQL 14+ running locally.

```bash
# 1. Install dependencies
pnpm install
#    (pnpm-workspace.yaml already allows Prisma's postinstall scripts, which
#     download its query engine. No other package is allowed to run scripts.)

# 2. Create a database user and two databases: dev + test.
#    Run as your Postgres superuser.
psql -U postgres -c "CREATE ROLE moviememory LOGIN PASSWORD 'moviememory' CREATEDB;" \
                 -c "CREATE DATABASE moviememory OWNER moviememory;" \
                 -c "CREATE DATABASE moviememory_test OWNER moviememory;"

# 3. Configure environment
cp .env.example .env        # then fill in the values (see section 2)

# 4. Apply migrations and generate the Prisma client
pnpm prisma migrate deploy
pnpm prisma generate

# 5. Run the app (frontend and backend in one Node.js process)
pnpm dev                    # → http://localhost:3000
```

### Google OAuth setup
In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services**:
1. **OAuth consent screen:** choose External, and add your Google account under **Test users** (otherwise Google returns `access_denied`).
2. **Credentials → Create OAuth client ID → Web application:**
   - Authorized JavaScript origin: `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Copy the client ID and secret into `.env`.

---

## 2. Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string for the app (dev DB) |
| `TEST_DATABASE_URL` | for tests | A **separate** Postgres DB. Tests wipe its tables; the test config refuses to run if it equals `DATABASE_URL` |
| `AUTH_SECRET` | ✅ | Encrypts the session cookie. Generate with `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | ✅ | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | ✅ | Google OAuth client secret |
| `OPENAI_API_KEY` | ✅ | OpenAI API key. Without it the app still runs, and the fact card shows a friendly error |
| `OPENAI_MODEL` | optional | Defaults to `gpt-4o-mini` |

None of these use the `NEXT_PUBLIC_` prefix, so Next.js never bundles them into browser code. Every module that touches a secret also imports `server-only`, so the build fails if one of them is ever imported into client code.

---

## 3. Database & migrations

```bash
pnpm prisma migrate deploy     # apply committed migrations (setup / CI / prod)
pnpm prisma migrate dev        # during development: create + apply a migration after editing schema.prisma
pnpm prisma studio             # browse data at http://localhost:5555
```

Migrations live in `prisma/migrations/`. There is one migration, `init`. The test suite applies migrations to `TEST_DATABASE_URL` automatically before running.

---

## 4. Running tests

```bash
pnpm test          # 32 tests, ~2s, against the real Postgres test DB
pnpm lint
pnpm exec tsc --noEmit
```

The tests run against **real Postgres**, not a mocked ORM, so the concurrency lock is exercised with real concurrent SQL. Only the two external boundaries are mocked: the session (`auth()`) and OpenAI.

| File | Covers |
|---|---|
| `tests/facts.cache.test.ts` | 60s window (59s → cache, 60s → regenerate), movie-scoped cache, 5 concurrent requests → 1 generation, expired-lock recovery, waiting on a held lock, OpenAI failure → fallback / friendly error, lock always released |
| `tests/facts.auth.test.ts` | User B never receives user A's fact, even for the **same movie title**, from either the cache or the fallback path. `GET /api/fact` returns 401 without a session and only serves the session user's facts |
| `tests/me.api.test.ts` | `GET /api/me` and `PUT /api/me/movie`: 401, null-safe profile fields, trimming, invalid input (blank, too long, missing, wrong type, non-JSON). A `userId` sent in the body is ignored |
| `tests/api-client.test.ts` | The typed client normalizes 401 / 400 / 500 (non-JSON) / network failures into a single `ApiError` |

I confirmed the burst tests actually guard the lock: when I temporarily made the lock always succeed, both lock tests failed.

---

## 5. Architecture overview

### 5.1 Shape of the system

One Next.js app, running as **one Node.js process**, with the frontend and backend separated by folder and connected only through a typed REST contract:

```
src/
├── app/                     FRONTEND: pages + UI (React, Tailwind)
│   ├── page.tsx                 landing ("Sign in with Google")
│   ├── onboarding/              first-time favorite-movie form
│   ├── dashboard/               profile, movie, FactCard, logout
│   └── api/                     HTTP LAYER: thin route handlers
│       ├── auth/[...nextauth]/      /api/auth/*  (Auth.js: Google OAuth)
│       ├── me/route.ts              GET  /api/me
│       ├── me/movie/route.ts        PUT  /api/me/movie
│       └── fact/route.ts            GET  /api/fact
├── lib/api.ts               typed browser client: the UI's only way to call the backend
├── shared/                  CONTRACT: request/response types + validation (no secrets)
└── server/                  BACKEND: Node-only, guarded by `server-only`
    ├── auth.ts                  Auth.js config (Google, JWT session, user upsert)
    ├── http.ts                  session → userId; JSON / error helpers
    ├── db.ts, openai.ts
    └── services/                business logic, with no HTTP or Next.js concepts
        ├── facts.ts                 cache + lock + fallback (Variant A)
        └── users.ts                 profile, set favorite movie
```

**Layering rule:** route handlers only authenticate, parse input, call a service, and map the result to HTTP. Services contain all business logic and take `userId` as an argument. That keeps them unit-testable, and they could move to a standalone Node/Express server unchanged.

### 5.2 Auth flow

```
/  ──"Sign in with Google"──▶  Google  ──▶  /api/auth/callback/google
                                              │ Auth.js verifies the OAuth response (state, PKCE)
                                              │ jwt callback: prisma.user.upsert({ where: { googleId: sub } })
                                              │ sets an encrypted, httpOnly session cookie { uid }
                                              ▼
                                         /dashboard
                                              ├── favoriteMovie IS NULL → /onboarding  (first-time user)
                                              └── otherwise           → dashboard     (returning user)
```

- **First-time vs returning** is decided by data, not by a flag: `User.favoriteMovie IS NULL` means the user hasn't onboarded. `/onboarding` redirects users who already have a movie back to `/dashboard`.
- **Route protection** happens in server components (`requireUser()` → redirect to `/`) and in every API route (`401`). It isn't done in edge middleware, so every check reads the same server-side session.
- Users are keyed by Google's **`sub`** (a stable account id), not email, since a Google account's email can change.

### 5.3 Data model: two tables

```prisma
model User {
  id              String    @id @default(cuid())
  googleId        String    @unique      // Google `sub`
  email           String?                // Google may omit these, so the UI has fallbacks
  name            String?
  image           String?
  favoriteMovie   String?                // NULL ⇒ not onboarded
  factLockedUntil DateTime?              // burst-protection lease (see 5.4)
  facts           Fact[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Fact {
  id        String   @id @default(cuid())
  userId    String                        // FK → User, ON DELETE CASCADE
  movie     String                        // snapshot of the title this fact is about
  content   String   @db.Text
  createdAt DateTime @default(now())
  @@index([userId, movie, createdAt(sort: Desc)])
}
```

Why this schema:
- **Every table maps to a requirement.** `User` holds the Google profile and the favorite movie, and `Fact` holds the stored facts. With JWT sessions there's no need for the Auth.js `Account`, `Session` or `VerificationToken` tables (see the tradeoffs in section 7).
- **`favoriteMovie` is a column, not a `Movie` table.** The product stores one free-text title per user, and a separate table would add a join for no benefit.
- **`Fact.movie` is a snapshot.** It makes the cache key exactly what the spec describes, *user + movie*. If the favorite movie changes, the old facts no longer match, so the next request generates a new fact for the new title, while the old facts stay as history.
- **The composite index `(userId, movie, createdAt DESC)`** makes the hot query, "latest fact for this user and movie", a single index lookup.
- **The lock lives on `User`.** A user has exactly one favorite movie at a time, so a per-user lease is equivalent to a per-(user, movie) lease without needing another table.

### 5.4 Fact generation (Variant A): `src/server/services/facts.ts`

```
GET /api/fact
  │
  ├─ 1. latest Fact for (userId, movie) is < 60s old? ───────────────▶ return it        source: "cache"
  │
  ├─ 2. try to claim the lease (one atomic statement):
  │       UPDATE "User" SET "factLockedUntil" = now + 30s
  │       WHERE id = $me AND ("factLockedUntil" IS NULL OR "factLockedUntil" < now)
  │
  ├─ 3a. claimed (1 row updated):
  │       check again for a fresh fact (another request may have just finished)
  │       → call OpenAI (8s timeout, 1 retry) → INSERT Fact ───────────▶ source: "fresh"
  │       → OpenAI failed? return the latest stored fact ──────────────▶ source: "fallback"
  │                         or none exists ─────────────────────────────▶ 503 FACT_UNAVAILABLE
  │       finally: release the lease (only if we still own it)
  │
  └─ 3b. not claimed (0 rows: another request is already generating):
          poll every 250ms for the winner's fact ──────────────────────▶ source: "cache"
          lease freed or expired without a new fact ───────────────────▶ "fallback" or 503
```

**Why this is correct under concurrency:**
- Claiming the lease is a **single conditional `UPDATE`**. Postgres takes a row lock, and under READ COMMITTED a second concurrent `UPDATE` re-evaluates its `WHERE` after the first commits. It then sees the lease as taken and updates 0 rows. Exactly one caller wins, with no read-then-write race.
- **The lock lives in Postgres, not in memory,** so it holds across browser tabs, rapid refreshes, and multiple server instances.
- **It's a lease, not a flag.** It expires after 30s (longer than the worst-case OpenAI call of 8s × 2 attempts), so a crashed process can't leave a user stuck.
- **Ownership-checked release** (`WHERE factLockedUntil = <my lease>`) means a slow request whose lease expired can't release a lock that someone else has since taken.
- **The double-checked cache read** after acquiring the lease closes the gap between the first cache check and the lock.
- **No transaction is held open during the OpenAI call,** so a slow upstream doesn't tie up a DB connection.
- **One clock:** `Fact.createdAt` is written from the same injectable clock that measures the 60s window. That avoids skew between the app and DB clocks, and lets tests move time instead of sleeping.

**Boundary:** a fact exactly 60s old is *not* "less than 60 seconds old", so it gets regenerated. A test pins this down.

### 5.5 API contract

All responses are JSON with `Cache-Control: no-store`. Errors always have the shape `{ "error": { "code", "message" } }`.

| Endpoint | Success | Errors |
|---|---|---|
| `GET /api/me` | `200 { user: { id, name, email, image, favoriteMovie } }` | `401 UNAUTHORIZED` |
| `PUT /api/me/movie`, body `{ movie }` | `200 { user }` | `400 VALIDATION_ERROR`, `401` |
| `GET /api/fact` | `200 { fact: { id, movie, content, createdAt }, source: "fresh" \| "cache" \| "fallback" }` | `401`, `409 NO_MOVIE`, `503 FACT_UNAVAILABLE` |

The types live in `src/shared/api-types.ts` and are used both by the route handlers and by `src/lib/api.ts`.

### 5.6 Security

| Requirement | How it's met |
|---|---|
| Validate movie input server-side | A zod schema in `src/shared/validation.ts` trims, collapses whitespace, and requires 1–120 characters. It runs in `services/users.ts`, and the client-side `maxLength` is only a convenience |
| Users can't access or modify other users' data | **No endpoint accepts a user id.** The user is always taken from the encrypted session cookie, and every query is scoped by it. There are tests for B-can't-see-A (same movie title included) and for a `userId` smuggled in the body being ignored |
| No secrets exposed to the client | No `NEXT_PUBLIC_` secrets; `server-only` imports on `db`, `openai`, `auth`, `http` and the services; the session cookie is httpOnly and encrypted |
| Missing Google photo or name | Fields are nullable end-to-end. The UI shows initials (or "?") instead of a photo, "Hi, there" instead of a name, and "No email on file" if the email is missing |
| Safe OpenAI usage | Server-only; 8s timeout, 1 retry, capped output tokens. The movie title is passed as **data** in `input`, the rules live in `instructions`, and the model is told to ignore instructions inside the title (basic prompt-injection hygiene) |
| CSRF | Auth.js uses CSRF tokens on sign-in and sign-out. API mutations rely on `SameSite=Lax` cookies and a JSON body |

---

## 6. Variant choice: A (Backend)

I chose **Variant A** because its core problems (a correct time-window cache, preventing duplicate work under concurrency, and degrading gracefully when an upstream fails) are the ones where subtle bugs hide. They're also the ones that benefit most from being tested against a real database. It also plays to the parts of the stack that carry the correctness guarantees: Postgres and Prisma.

Of the burst-protection options the spec lists, I used a **"generation in progress" flag implemented as an expiring lease** in Postgres:

| Option | Why not |
|---|---|
| In-memory lock | Breaks with more than one server instance or serverless invocation |
| Transaction / advisory lock held during generation | Holds a DB connection open for the duration of a slow network call |
| Unique constraint per 60s window | Bucketed windows don't match "the most recent fact is < 60s old". A request at 0:59 and one at 1:01 fall in different buckets |

The app also has a typed REST layer and client (`/api/me`, `/api/me/movie`, `lib/api.ts`). I added these to keep the frontend and backend cleanly separated, not to implement Variant B. Variant B's inline editing, optimistic UI and client-side cache are **not** implemented.

---

## 7. Key tradeoffs

| Decision | Benefit | Cost / limitation |
|---|---|---|
| **JWT sessions (no session table)** | Two-table schema; no DB read just to check a session | Logout clears the cookie, but a stolen cookie stays valid until it expires (Auth.js default: 30 days). Fix: database sessions or a `sessionVersion` column on `User` |
| **One Next.js app, not a separate Express server** | One process, same-origin cookies (no CORS), shared types | Frontend and backend scale and deploy together. The separation is by folder, enforced by `server-only` |
| **Waiting requests poll (250ms)** | Simple and portable, works on any Postgres | A few cheap queries per waiting request. Postgres `LISTEN/NOTIFY` would push the result instead |
| **Waiting requests wait up to 20s** | Several tabs get the *same* fresh fact instead of an error | A request can take as long as the slowest OpenAI call |
| **Cache key is the exact title string** | Precise and predictable | "Inception" and "inception" are different keys. Normalizing (e.g. lowercasing) would need a decision about how titles are displayed |
| **All facts kept as history** | Supports fallback and auditing; the index keeps lookups fast | Unbounded growth. Needs a retention policy in production |
| **App clock as the single time source** | Consistent window math; deterministic tests | Assumes server clocks are roughly in sync (true with NTP) |
| **OpenAI failure with a stored fact returns `200` + `source: "fallback"`** | The UI always has something to show and can label it honestly | Clients must read `source` to know the fact isn't new |

---

## 8. With 2 more hours

1. **Server-revocable sessions:** add a `sessionVersion` column checked in the `jwt` callback, so "log out everywhere" actually works.
2. **Per-user rate limiting** on `GET /api/fact`. The 60s cache already caps OpenAI calls at about 1 per minute per user, but the endpoint itself isn't throttled.
3. **End-to-end tests (Playwright)** for the full sign-in → onboarding → dashboard flow, with a mocked OAuth provider.
4. **CI:** a GitHub Actions workflow with a Postgres service container running lint, type-check, tests and build on every PR.
5. **Edit the favorite movie from the dashboard.** `PUT /api/me/movie` already supports it; only the UI is missing.
6. **Observability:** structured logs for cache hits, misses, fallbacks and lock waits, plus OpenAI latency and error-rate metrics.
7. **Replace polling with `LISTEN/NOTIFY`,** and normalize movie titles for the cache key.

---

## 9. AI usage

- **Assistant used:** Claude Code (Anthropic) in VS Code, as a pair programmer throughout.
- **Planning:** turned the take-home PDF into a step-by-step build plan (base → Variant A → tests → README) and reviewed it before any code was written.
- **Decisions were mine:** the AI proposed options with tradeoffs and I chose: Variant A; reducing the schema from the Auth.js-adapter design (6 tables) to 2 tables with JWT sessions; and restructuring into `src/server` / `src/shared` / `src/lib/api.ts` with REST endpoints to keep the frontend and backend separate.
- **Code generation:** the AI wrote first drafts of the files. I reviewed each step as it was built, ran the app locally, and asked for changes (for example, the visual theme and the Google-branded sign-in button).
- **Debugging:** used the AI to diagnose the Google OAuth errors (`client_id` missing → `redirect_uri_mismatch` → `access_denied` for a non-test user) and pnpm 11's blocked install scripts.
- **Verification:** every step was checked with the type-checker, lint, and tests against a real Postgres database. The burst-protection tests were validated by deliberately breaking the lock and confirming the tests fail.
- **Secrets:** API keys and OAuth credentials were entered directly into `.env` and are not committed.
