# Project Architecture

High-level map of Prism Chess. For per-subsystem detail see
`AI_ENGINE_NOTES.md`, `VARIANT_SYSTEM.md`, and `DATABASE.md`.

---

## 1. Frontend

- **Framework:** TanStack Start v1 on React 19, bundled by Vite 7.
- **Routing:** File-based under `src/routes/`. Dot-separated filenames map to
  slash-separated URLs (e.g. `pieces.$slug.edit.tsx` → `/pieces/$slug/edit`).
  Authenticated routes live under `src/routes/_authenticated/` behind a
  managed `ssr: false` auth gate (`_authenticated/route.tsx`).
- **Public API routes:** `src/routes/api/public/*` for webhooks/cron (e.g.
  `cleanup-stale-challenges`, `piece-img/$`). These bypass published-site
  auth — verify the caller inside the handler.
- **State:**
  - **Server state:** TanStack Query (one `QueryClient` per request, attached
    to router context in `src/router.tsx`).
  - **Game state:** local React state via `src/hooks/useGame.ts` (solo) and
    `src/hooks/useMultiplayerGame.ts` (real-time via Supabase Realtime).
  - **Auth state:** Supabase JS client with `onAuthStateChange` wired in
    `src/routes/__root.tsx`.
  - **Misc:** lightweight `localStorage` for play prefs, tutorial state, AI
    debug toggle.
- **Styling:** Tailwind v4 configured CSS-first via `@import "tailwindcss"`
  in `src/styles.css`. Design tokens live as CSS variables in that file;
  shadcn components consume them. Never hardcode colors in components.
- **PWA:** `public/manifest.webmanifest` + `public/push-sw.js` for web push
  notifications (challenges, DMs).

## 2. Backend (server functions)

There is no traditional "API server". App-internal server logic lives in
`createServerFn` modules under `src/lib/*.functions.ts`, executed inside the
TanStack Start Worker runtime (Cloudflare Workers with `nodejs_compat`).

Patterns used throughout:

- `createServerFn({ method }).inputValidator(zod).handler(async ({data, context}) => ...)`
- `requireSupabaseAuth` middleware (from
  `src/integrations/supabase/auth-middleware.ts`) for any fn that should act
  as the signed-in user; injects `{ supabase, userId, claims }` into context.
- `attachSupabaseAuth` is registered globally in `src/start.ts` so client
  callers don't need to attach the bearer manually.
- Privileged operations dynamically `await import('@/integrations/supabase/client.server')`
  inside the handler (never at module scope of a `.functions.ts` file).

Notable server-function modules: `history.functions.ts`, `multiplayer.functions.ts`,
`profile.functions.ts`, `forum.functions.ts`, `notifications.functions.ts`,
`piece-builder.functions.ts`, `social.functions.ts`, `api/analyze-game.functions.ts`,
`ai-learning.functions.ts`, `admin.functions.ts`.

## 3. Database & Auth

Supabase Postgres. Schema documented in [`DATABASE.md`](./DATABASE.md).
Highlights:

- RLS enabled on every public-schema table; policies scoped to `auth.uid()`.
- Role system: `app_role` enum (`admin`, `moderator`, `user`) stored in a
  separate `user_roles` table, checked via `has_role(uid, role)` security-
  definer function. **Never** add a role column to `profiles`.
- Auth providers: email/password + Google OAuth. Google is brokered through
  `@/integrations/lovable` (`lovable.auth.signInWithOAuth('google', ...)`).
- Storage buckets: `piece-images` (private), `avatars` (private).
- Realtime used for multiplayer move sync and match chat.

## 4. Variant / game engine

`src/game/` is a pure-TypeScript chess-variant engine, unaware of React or
Supabase.

- `types.ts` — `Design`, `Piece`, `PieceDef`, `Move`, `GameState`.
- `board.ts` / `pieces.ts` / `customMovement.ts` — board representation,
  built-in + user-defined piece registry, generic movement option DSL.
- `moves.ts` — legal move generation, including specials (dragon, archer,
  juggernaut, necromancer, portal, shapeshifter, etc.).
- `rules.ts` — `initialStateFromDesign`, `applyMove`, `replayMoves`,
  `gameStatus` (checkmate / stalemate / royal-loss).
- `design.ts` / `library.ts` — preset variants and design helpers.
- `pieceValue.ts` — material valuation used by the AI and UI badges.

See `VARIANT_SYSTEM.md` for the design-format details.

## 5. Game-playing AI

`src/game/ai/` — runs in a dedicated Web Worker (`worker.ts`) so the UI
thread stays responsive. Iterative-deepening alpha-beta with a shared
transposition table, custom evaluation, an opening "playbook", and a
root-level **safety gate** that vetoes obvious blunders. Full writeup in
[`AI_ENGINE_NOTES.md`](./AI_ENGINE_NOTES.md).

## 6. LLM-powered helpers (Lovable AI Gateway)

Separate from the game engine. Used server-side via
`@ai-sdk/openai-compatible` pointed at `https://ai.gateway.lovable.dev/v1`
with the `LOVABLE_API_KEY` header. See `src/lib/ai-gateway.server.ts` and
`src/lib/api/analyze-game.functions.ts`.

Today it powers:
- Custom-piece "movement summary" generation
- Post-game analysis text

The API key is server-only — never expose it via `VITE_*`.

## 7. Environment variables

See `SETUP.md`. The required public set is `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Server-only:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`LOVABLE_API_KEY`, and optionally `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
for web push.

## 8. External services

| Service                | Used for                                            | Where it's wired |
|------------------------|-----------------------------------------------------|------------------|
| Supabase Postgres      | Primary DB                                          | `src/integrations/supabase/*` |
| Supabase Auth          | Email + Google sign-in                              | `auth-middleware`, `__root.tsx` |
| Supabase Storage       | Piece images, avatars                               | `piece-builder.functions.ts`, `AvatarUploader.tsx` |
| Supabase Realtime      | Multiplayer move sync, match chat                   | `useMultiplayerGame.ts`, `MatchChatPanel.tsx` |
| Lovable AI Gateway     | LLM helpers (piece summaries, game analysis)        | `lib/ai-gateway.server.ts` |
| Web Push (VAPID)       | Challenge / DM notifications                        | `lib/push.server.ts`, `push-sw.js` |
| Cloudflare Workers     | Server runtime (via TanStack Start adapter)         | implicit |

There is no separate analytics provider integrated today.
