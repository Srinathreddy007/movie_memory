# 🎬 Movie Memory

Sign in with Google, save your favorite movie, and get an AI-generated fun fact about it.

Built for the SWE full-stack take-home: the **base implementation** plus **Variant A, Backend-Focused (caching & correctness)**.

**Stack:** TypeScript · Next.js 15 (App Router) · React 19 · TailwindCSS 4 · Postgres · Prisma 6 · Auth.js v5 (Google OAuth) · OpenAI API · Vitest

### At a glance

| Spec area | Status | Where |
|---|---|---|
| Google sign-in; first-time users go to onboarding, returning users to the dashboard | ✅ | `src/server/auth.ts`, `src/app/dashboard/page.tsx` |
| Onboarding with server-side validation (trim, 1–120 chars), stored in Postgres | ✅ | `src/shared/validation.ts`, `src/server/services/users.ts` |
| Dashboard: name, email, photo (with fallbacks), movie, logout; logged-out users are redirected | ✅ | `src/app/dashboard/page.tsx`, `src/server/session.ts` |
| Fun fact from OpenAI, stored in the DB | ✅ | `src/server/openai.ts`, `src/server/services/facts.ts` |
| **A1:** 60-second cache window per user + movie | ✅ | `facts.ts` (tested at 59s and 60s) |
| **A2:** burst / idempotency protection | ✅ | `facts.ts`, Postgres lease (5 concurrent requests → 1 generation) |
| **A3:** OpenAI failure → last fact, else a friendly error | ✅ | `facts.ts`, `openai.ts` |
| **A4:** tests for the cache logic and authorization | ✅ | `tests/` (39 tests, real Postgres) |

---

## Contents
1. [Quick start](#1-quick-start)
2. [Environment variables](#2-environment-variables)
3. [Database & migrations](#3-database--migrations)
4. [Tests](#4-tests)
5. [Architecture overview](#5-architecture-overview)
6. [Variant choice and how I read it](#6-variant-choice-and-how-i-read-it)
7. [Key tradeoffs](#7-key-tradeoffs)
8. [With 2 more hours](#8-with-2-more-hours)
9. [AI usage](#9-ai-usage)

---

## 1. Quick start

**Prerequisites:** Node.js 22+, pnpm, PostgreSQL 14+ running locally.

```bash
# 1. Install dependencies
pnpm install
#    (pnpm-workspace.yaml allows only Prisma's postinstall scripts, which
#     download its query engine.)

# 2. Create a database user and two databases (dev + test). Run as a Postgres superuser.
psql -U postgres -c "CREATE ROLE moviememory LOGIN PASSWORD 'moviememory' CREATEDB;" \
                 -c "CREATE DATABASE moviememory OWNER moviememory;" \
                 -c "CREATE DATABASE moviememory_test OWNER moviememory;"

# 3. Configure environment
cp .env.example .env        # then fill in the values (section 2)

# 4. Create the tables and generate the Prisma client
pnpm db:setup               # = prisma migrate deploy && prisma generate

# 5. Run the app (frontend and backend in one Node.js process)
pnpm dev                    # → http://localhost:3000
#    (dev also applies any pending migrations first, so the tables are
#     created or updated automatically. Safe to run repeatedly.)
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
| `TEST_DATABASE_URL` | for tests | A **separate** database. Tests wipe its tables, and the test config refuses to run if it equals `DATABASE_URL` |
| `AUTH_SECRET` | ✅ | Encrypts the session cookie. Generate with `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | ✅ | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | ✅ | Google OAuth client secret |
| `OPENAI_API_KEY` | ✅ | OpenAI API key. Without it the app still runs, and the fact card shows a friendly error |
| `OPENAI_MODEL` | optional | Defaults to `gpt-4o-mini` |
| `AUTH_TRUST_HOST` | for `pnpm start` | Set to `true` when running the **production build** locally (`pnpm build && pnpm start`). Auth.js otherwise rejects the host with `UntrustedHost`. Not needed for `pnpm dev`, and set automatically on Vercel |

`.env.example` has every variable with comments. None of them use the `NEXT_PUBLIC_` prefix, so Next.js never bundles them into browser code. Every module that touches a secret imports `server-only`, so the build fails if one is ever imported into client code.

---

## 3. Database & migrations

```bash
pnpm db:setup                  # create/update tables + generate the Prisma client (first-time setup)
pnpm prisma migrate deploy     # apply committed migrations only (CI / prod)
pnpm prisma migrate dev        # development: create + apply a migration after editing schema.prisma
pnpm prisma studio             # browse data at http://localhost:5555
```

**Tables are created automatically:** `pnpm dev` runs `prisma migrate deploy` before starting Next.js, and `pnpm test` does the same for the test database. Only the empty databases themselves (Quick start, step 2) must be created by hand. `migrate deploy` only applies migrations that haven't run yet, so it never drops data.

Migrations live in `prisma/migrations/`. There is one, `init`: it creates `User` and `Fact`, the `UNIQUE (googleId)` constraint, the `(userId, movie, createdAt DESC)` index, and the cascading foreign key.

The test suite applies migrations to `TEST_DATABASE_URL` automatically before it runs.

---

## 4. Tests

```bash
pnpm test                  # 39 tests, ~1.5s, against the real Postgres test DB
pnpm lint
pnpm exec tsc --noEmit
```

The tests run against **real Postgres**, not a mocked ORM, so the lock is exercised with real concurrent SQL. Only the two external boundaries are mocked: the session (`auth()`) and OpenAI. Time is controlled with an injected clock, so tests move time instead of sleeping.

| File | Tests | Covers |
|---|---|---|
| `tests/facts.cache.test.ts` | 11 | **Cache window:** 59s → cached, exactly 60s → a new fact is generated and stored alongside the old one, a movie change bypasses the cache, and a fact about a previous movie is never served (not even as a fallback). **Burst:** 5 concurrent requests → 1 generation and the same fact for all, expired-lock recovery, waiting on a held lock. **Failure:** OpenAI error → last fact, or a friendly error; the lock is always released |
| `tests/facts.auth.test.ts` | 11 | **Authorization:** user B never receives user A's fact, even for the **same movie title**, through the cache, the fallback or either endpoint. `GET`/`POST /api/fact` return 401 without a session. `GET` is read-only: it returns the newest fact (even a stale one) or `null`, and never calls OpenAI |
| `tests/me.api.test.ts` | 10 | `GET /api/me` and `PUT /api/me/movie`: 401, null-safe profile fields, trimming, invalid input (blank, too long, missing, wrong type, non-JSON). A `userId` sent in the body is ignored |
| `tests/api-client.test.ts` | 7 | The typed client normalizes 401 / 400 / 500 (non-JSON) / network failures into one `ApiError`, and uses the right HTTP methods |

**Checking the tests themselves:** I temporarily made the lock always succeed, and the burst tests failed, so they really guard the lock. I also ran the flows end to end against the running app with real HTTP requests: sign-in redirects, onboarding validation, a smuggled `userId` being ignored, and 5 parallel fact requests producing exactly one OpenAI call and one stored fact.

---

## 5. Architecture overview

### 5.1 Shape of the system

One Next.js app, running as **one Node.js process**. It serves the React pages and acts as the backend-for-frontend: it's the only part that talks to Postgres, Google and OpenAI. Frontend and backend are separated by folder and connected only through a typed REST contract.

```
src/
├── app/                     FRONTEND: pages + UI (React, Tailwind)
│   ├── page.tsx                 landing ("Sign in with Google")
│   ├── onboarding/              first-time favorite-movie form
│   ├── dashboard/               profile, favorite movie, FactCard, logout
│   └── api/                     HTTP LAYER: thin route handlers
│       ├── auth/[...nextauth]/      /api/auth/*   Auth.js (Google OAuth)
│       ├── me/route.ts              GET  /api/me
│       ├── me/movie/route.ts        PUT  /api/me/movie
│       └── fact/route.ts            GET  /api/fact (read latest) · POST /api/fact (request a fact)
├── lib/api.ts               typed browser client: the UI's only way to call the backend
├── shared/                  CONTRACT: API types, validation, limits (no secrets)
└── server/                  BACKEND: Node-only, guarded by `server-only`
    ├── auth.ts                  Auth.js config (Google, JWT session, user upsert)
    ├── session.ts               requireUser() for pages
    ├── http.ts                  session → userId; JSON and error helpers
    ├── db.ts, openai.ts         Prisma client, OpenAI wrapper
    └── services/                business logic, with no HTTP or Next.js concepts
        ├── facts.ts                 cache + lease + fallback (Variant A)
        └── users.ts                 profile, set favorite movie
```

**Layering rule:** route handlers only authenticate, parse input, call a service, and map the result to HTTP. Services hold all the business logic and take `userId` as an argument, so they can be tested directly and could move to a standalone server unchanged.

### 5.2 Auth flow

```
/  ──"Sign in with Google"──▶  Google  ──▶  /api/auth/callback/google
                                              │ Auth.js checks state + PKCE, exchanges the code (server to server)
                                              │ jwt callback: prisma.user.upsert({ where: { googleId: sub } })
                                              │ sets an encrypted, httpOnly session cookie holding only { uid }
                                              ▼
                                         /dashboard ── requireUser()
                                              ├── no session              → /?notice=signin-required  (sign-in page + "Please sign in")
                                              ├── favoriteMovie IS NULL   → /onboarding  (first-time user)
                                              └── otherwise               → dashboard    (returning user)
```

- **First-time vs returning is decided by data, not a flag:** `favoriteMovie IS NULL` means not onboarded. `/onboarding` sends users who already have a movie back to `/dashboard`.
- **Users are keyed by Google's `sub`** (a permanent account id), not email, because email can change. Name, email and photo are refreshed from Google on every sign-in.
- **Route protection** happens in server components (redirect before any HTML is sent) and in every API route (`401`). A logged-out visit to `/dashboard` or `/onboarding`, or a session expiring mid-use, lands on the sign-in page with "Please sign in to view your dashboard."; logging out lands there with "You've been signed out."

### 5.3 Data model: two tables, User 1:many Fact

```prisma
model User {
  id              String    @id @default(cuid())
  googleId        String    @unique     // Google `sub`
  email           String?               // Google may omit these, so the UI has fallbacks
  name            String?
  image           String?
  favoriteMovie   String?               // NULL ⇒ not onboarded yet
  factLockedUntil DateTime?             // burst-protection lease (5.4)
  facts           Fact[]                // 1:many: every generated fact
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Fact {
  id        String   @id @default(cuid())
  userId    String                      // FK → User (ON DELETE CASCADE)
  movie     String                      // snapshot of the title this fact is about
  content   String   @db.Text
  createdAt DateTime @default(now())    // drives the 60s window
  @@index([userId, movie, createdAt(sort: Desc)])
}
```

Why this schema:
- **One user, one movie, many facts over time.** The movie is a plain column, since a user has one at a time and a `Movie` table would add a join for no benefit. Facts are a **1:many** table because a new one is generated on every request after the 60s window, and the spec says to *"store generated facts"* and to use *"the most recent fact"*. Every generated fact is inserted and never overwritten, so "most recent" is simply the newest row.
- **Insert-only writes:** facts are never updated, so concurrent writers can't conflict, and the history supports the fallback, auditing, and features like "don't repeat a fact".
- **`Fact.movie` is a snapshot** of the title the fact was generated for, so the cache key is exactly the spec's *user + movie*. After a movie change, the old facts no longer match: the next request generates one for the new title, and a fact about the old movie is never served, not even as a fallback.
- **The composite index `(userId, movie, createdAt DESC)`** makes the hot query, "newest fact for this user + movie", a single index seek.
- **The lock lives on `User`.** A user has one movie at a time, so a per-user lease equals a per-(user, movie) lease without another table.
- **No Auth.js `Account`/`Session`/`VerificationToken` tables:** with JWT sessions they aren't needed (tradeoff in section 7).

### 5.4 Fact generation (Variant A)

**When facts are generated.** Facts are generated **only when the user asks for one** (the button):
- **Opening or refreshing the dashboard** calls `GET /api/fact`, which only reads the stored fact (or `null`) and never calls OpenAI.
- **The button** calls `POST /api/fact`, which runs the logic below.

**Caching strategy at a glance**

| Pattern | Implementation |
|---|---|
| Read-through cache | check the stored fact first; call OpenAI only on a miss, then store the result |
| Cache key | `(userId, movie)` |
| Expiry (TTL) | rolling 60 seconds from `Fact.createdAt`; strictly `< 60s` is a hit |
| Stampede protection (single-flight) | an expiring lease, so only one request generates and the others reuse its result |
| Stale-if-error | if OpenAI fails, serve the stored fact (`source: "fallback"`) |
| Store | the Postgres `Fact` table. Facts must be stored there anyway, so it doubles as the cache (no Redis; see section 7) |

**Flow** (`src/server/services/facts.ts`):

```
POST /api/fact
  │
  ├─ 1. stored fact for (userId, movie) is < 60s old? ─────────────────▶ return it         "cache"
  │
  ├─ 2. claim the lease (one atomic statement):
  │       UPDATE "User" SET "factLockedUntil" = now + 30s
  │       WHERE id = $me AND ("factLockedUntil" IS NULL OR "factLockedUntil" < now)
  │
  ├─ 3a. claimed (1 row updated):
  │       re-check the cache (another request may have just finished)
  │       → OpenAI (8s timeout, 1 retry) → INSERT Fact ──────────────────▶ return it         "fresh"
  │       → OpenAI failed: stored fact for this movie ───────────────────▶ return it         "fallback"
  │                        none ───────────────────────────────────────▶ 503 FACT_UNAVAILABLE
  │       finally: release the lease, only if we still own it
  │
  └─ 3b. not claimed (0 rows: another request is generating):
          poll every 250ms (up to 20s) for the winner's fact ──────────▶ same fact         "cache"
          lease freed or expired without a new fact ───────────────────▶ "fallback" or 503
```

**Why it's correct under concurrency:**
- **One conditional `UPDATE` claims the lease.** Postgres row-locks the user, and a concurrent `UPDATE` re-checks its `WHERE` after the first commits, sees the lease taken, and updates 0 rows. Exactly one caller wins, with no read-then-write gap.
- **It's in Postgres, not memory,** so it holds across tabs, rapid clicks, devices and multiple server instances.
- **It's a lease, not a boolean.** It expires after 30s (longer than the worst-case OpenAI call of 8s × 2 attempts), so a crashed process can't block a user forever.
- **Ownership-checked release** (`WHERE factLockedUntil = <my lease>`) stops a slow request from releasing a lease someone else has since taken.
- **The re-check after claiming** closes the gap between the first cache read and the lock.
- **No transaction is held during the OpenAI call,** so a slow upstream never ties up a DB connection.
- **One clock:** `createdAt` is written by the same injectable clock that measures the window. That avoids app/DB clock skew and makes tests deterministic.
- **Boundary:** a fact exactly 60s old is not "less than 60 seconds old", so it gets regenerated (tested).

**Multiple clients, same user.** Every request returns the server's current fact, so all clients converge on the same one:
- Within 60s, everyone gets the stored fact.
- Simultaneous requests after 60s produce one generation that they all share.
- In the UI, tabs in the same browser sync instantly over `BroadcastChannel`. Other browsers or devices show the same fact on their next load or click. This is display-only; duplicate prevention is entirely the server-side lease.

**On the dashboard** (`FactCard.tsx`, which only displays what the server decides):
- A badge shows the source: **Fresh**, **Cached** or **Saved fact**.
- A countdown shows when a new fact unlocks. The 60s window is one shared constant, `FACT_CACHE_WINDOW_MS` in `src/shared/limits.ts`, so the UI and backend can't drift apart.

### 5.5 API contract

All responses are JSON with `Cache-Control: no-store`. Errors always have the shape `{ "error": { "code", "message" } }`. **No endpoint accepts a user id:** the user always comes from the session cookie. Types live in `src/shared/api-types.ts` and are shared by the route handlers and the typed client `src/lib/api.ts`.

| Endpoint | Success | Errors |
|---|---|---|
| `GET /api/me` | `200 { user: { id, name, email, image, favoriteMovie } }` | `401` |
| `PUT /api/me/movie` body `{ movie }` | `200 { user }` | `400 VALIDATION_ERROR`, `401` |
| `GET /api/fact` | `200 { fact: { id, movie, content, createdAt } \| null }`: read-only, never generates | `401`, `409 NO_MOVIE` |
| `POST /api/fact` | `200 { fact, source: "fresh" \| "cache" \| "fallback" }`: request a fact | `401`, `409 NO_MOVIE`, `503 FACT_UNAVAILABLE` |

### 5.6 Error handling

| Situation | What the user sees |
|---|---|
| OpenAI fails, a fact exists | that fact, badged **Saved fact**, with "Couldn't reach the AI, try again in a moment" |
| OpenAI fails, no fact yet | `503`, shown as "We couldn't come up with a fun fact right now. Please try again in a moment." |
| Invalid movie title | the server's message under the input ("Please enter a movie title." / "…120 characters or fewer.") |
| Google sign-in cancelled or denied | a banner on the landing page instead of Auth.js's error page |
| Session expired | redirected to sign in |
| Network failure | "Network error. Check your connection and try again." |
| Unknown URL | a themed 404 page 😢 "This scene isn't in the script", with a link home (`app/not-found.tsx`) |
| Unexpected crash (e.g. database unreachable) | HTTP 500 and a themed page 😞 "The projector jammed", with **Try again** and **Go home** (`app/error.tsx`). Technical details go only to the server log, never to the user. `app/global-error.tsx` covers a crash in the root layout itself |

The typed client turns every failure (HTTP error, non-JSON body, network error) into one `ApiError`, so the UI handles errors in a single way.

### 5.7 Security

| Requirement | How it's met |
|---|---|
| Validate movie input server-side | A zod schema trims, collapses whitespace and requires 1–120 characters, in `services/users.ts`. The client-side `maxLength` is only a convenience |
| Users can't access or modify others' data | No endpoint takes a user id. Every query is scoped by the session user, and tests cover B-can't-see-A (including the same movie title) and a smuggled `userId` being ignored |
| No secrets exposed to the client | No `NEXT_PUBLIC_` secrets; `server-only` on `db`, `openai`, `auth`, `http`, `session` and the services; the session cookie is httpOnly and encrypted |
| Missing Google photo or name | Nullable end to end. The UI shows initials (or "?") for a missing photo, "there" / "Movie fan" for a missing name, and "No email on file" for a missing email |
| Safe OpenAI usage | Server-only, 8s timeout, 1 retry, capped output tokens. The title is passed as **data** in `input`, the rules live in `instructions`, and the model is told to ignore instructions inside the title |
| SQL injection | Prisma sends every value as a bound parameter |
| CSRF | Auth.js uses CSRF tokens for sign-in and sign-out; API mutations rely on `SameSite=Lax` cookies |

---

## 6. Variant choice and how I read it

**I chose Variant A** because its problems (a correct time-window cache, preventing duplicate work under concurrency, and degrading gracefully when an upstream fails) are where subtle bugs hide. They also benefit most from tests against a real database, and they lean on the parts of the stack that carry correctness guarantees: Postgres and Prisma.

**How I interpreted the requirements:**
- **A1, cache window.** The 60-second rule decides what happens **when a fact is requested**: under 60s → the stored fact; 60s or older → generate, store, return. Nothing is regenerated in the background, and loading the dashboard doesn't count as a request (it only reads), so a refresh never costs an OpenAI call.
- **A2, burst protection.** Every client of the same user + movie must get the **same** fact. Requests within the window share the stored fact; simultaneous requests after it produce exactly one generation that all of them receive. The spec's "refreshes quickly" case can't cause generation at all in this design, and rapid clicks or several tabs and devices clicking at once are covered by the lease.
- **A3, failure handling.** "The most recent cached fact" is the user's stored fact for their current movie; otherwise a friendly `503`.

**Burst-protection approach: a "generation in progress" flag, implemented as an expiring lease.** Compared with the other listed options:

| Option | Why not |
|---|---|
| DB transaction guard | Holds a transaction and a pooled connection for the whole OpenAI call (up to ~16s). Under load that exhausts the pool, and it exceeds Prisma's 5s interactive-transaction timeout |
| Unique constraint per 60s window | Fixed buckets don't match "the most recent fact is < 60s old" (0:59 and 1:01 land in different buckets). Every racing request still calls OpenAI before the insert is rejected, which wastes cost |
| Simple in-memory lock | Only works in one process; multiple instances or serverless would generate duplicates |

The lease keeps a transaction's correctness (one atomic `UPDATE`) while holding nothing during the slow call.

**Not Variant B:** the app has a typed REST layer and client, but only to keep the frontend and backend cleanly separated. Variant B's inline editing, optimistic UI and client-side cache are **not** implemented.

---

## 7. Key tradeoffs

| Decision | Benefit | Cost / limitation |
|---|---|---|
| **Postgres as the cache, not Redis** | Facts must be stored in the DB anyway, so there's no second copy to keep in sync. The fallback needs the stored fact, which a 60s Redis TTL would have deleted. Measured locally, an indexed cache read takes **~0.15 ms** versus **~3.2 s** for an OpenAI call | Redis would save roughly 0.05 ms per request (every request still reads `User` for the movie) and add infrastructure. It becomes worthwhile at very high read volume |
| **1:many User : Fact (keep every fact)** | Matches the spec's "store generated facts" and "most recent fact"; insert-only writes never conflict; history enables fallback, auditing and future features | The table grows without bound. Production would need a retention policy (e.g. keep the last N facts per user) |
| **Generate on click (`POST`), read on load (`GET`)** | Opening or refreshing never calls OpenAI (no cost, no wait); `GET` stays side-effect free | A brand-new user sees an empty card until they click "Get a fun fact" |
| **Lease, not a transaction or unique constraint** | Correct across instances, holds nothing during OpenAI, self-heals after a crash | More code: claim, ownership-checked release, and a polling loop |
| **Waiting requests poll every 250ms, up to 20s** | Simple and portable; all racing clients get the *same* fact instead of an error | A few cheap queries per waiter. Postgres `LISTEN/NOTIFY` could push instead |
| **JWT sessions (no session table)** | Two-table schema; no DB read to check a session | A stolen cookie stays valid until it expires (Auth.js default: 30 days). Fix: database sessions or a `sessionVersion` column |
| **One Next.js app, not a separate Express server** | One process, same-origin cookies (no CORS), shared types | Frontend and backend deploy and scale together. The separation is by folder, enforced by `server-only` |
| **Cache key is the exact title string** | Precise and predictable | "Inception" and "inception" are different keys |
| **App clock as the single time source** | Consistent window math; deterministic tests | Assumes server clocks are roughly in sync (true with NTP) |
| **Tab sync via `BroadcastChannel`** | Zero requests or infrastructure; same-browser tabs update instantly | Doesn't reach other browsers or devices until they load or click |
| **OpenAI failure with a stored fact returns `200` + `source: "fallback"`** | The UI always has something to show, labelled honestly | Clients must read `source` to know the fact isn't new |

---

## 8. With 2 more hours

1. **Server-revocable sessions:** a `sessionVersion` column checked in the `jwt` callback, so "log out everywhere" works.
2. **Per-user rate limiting** on `POST /api/fact`. The cache already caps OpenAI at about 1 call per minute per user, but the endpoint itself isn't throttled.
3. **End-to-end tests (Playwright)** for sign-in → onboarding → dashboard, with a mocked OAuth provider.
4. **CI:** GitHub Actions with a Postgres service container running lint, type-check, tests and build on every PR.
5. **Edit the favorite movie from the dashboard.** `PUT /api/me/movie` already supports it; only the UI is missing.
6. **Live updates across devices:** Server-Sent Events fed by Postgres `LISTEN/NOTIFY` (which would also replace the polling), so a new fact appears on every browser and device, not just same-browser tabs.
7. **Observability:** structured logs for cache hits, misses, fallbacks and lock waits, plus OpenAI latency and error-rate metrics.
8. **Normalize titles for the cache key** (case and whitespace), keeping the original for display.

---

## 9. AI usage

- **Assistant:** Claude Code (Anthropic) in VS Code, used as a pair programmer throughout.
- **Planning:** turned the take-home PDF into a step-by-step plan (base → Variant A → tests → README), reviewed before any code was written.
- **Decisions were mine.** The AI proposed options with tradeoffs, and I chose:
  - Variant A
  - 2 tables with JWT sessions instead of the Auth.js adapter's 6
  - the `src/server` / `src/shared` / `src/lib/api.ts` split with REST endpoints
  - Postgres over Redis as the cache
  - the lease over a transaction guard
  - generating facts only on request
  - keeping `User : Fact` 1:many. I briefly switched to 1:1 (one overwritten row per user), then went back because the spec's "store generated facts" and "most recent fact" point to keeping every fact
- **Brainstorming and review:** used it to question the design: whether a separate cache was needed (we measured Postgres read latency to decide), what each burst-protection option would cost, how several clients of the same user see facts, and whether the requirements were fully met (a spec-by-spec audit that caught, for example, the button label drifting from "Sign in with Google").
- **Code generation:** the AI wrote first drafts. I reviewed each step, ran the app locally, and asked for changes, including the visual theme, the animated cinema background, the Stripe-inspired sign-in layout, the dashboard redesign, and a WCAG contrast check of the palette.
- **Debugging:** diagnosed the Google OAuth errors (`client_id` missing → `redirect_uri_mismatch` → `access_denied` for a non-test user), pnpm 11's blocked install scripts, and a dev-server cache corrupted by running a production build at the same time.
- **Verification:** every change was checked with the type-checker, lint and the test suite against real Postgres, plus live HTTP checks against the running app. The burst tests were validated by deliberately breaking the lock.
- **Secrets:** API keys and OAuth credentials were entered directly into `.env`, which is git-ignored and never committed.
