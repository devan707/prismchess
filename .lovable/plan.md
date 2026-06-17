## 1. Rebrand to Kingdom Chess

Palette: emerald `#0B3D2E`, gold `#D4AF37`, parchment `#F5E9C8`, ink `#1A1A1A`. Already loosely fits the current emerald/gold theme — tighten tokens in `src/styles.css` so accents are gold and primary is emerald.

- Update `<title>`, meta description, OG/Twitter tags in `src/routes/__root.tsx` and per-route `head()` to "Kingdom Chess".
- Replace site name everywhere it appears in the UI (main menu, headers, footer).
- Generate three brand assets with `imagegen`:
  - `src/assets/logo.png` — emerald shield with a stylized gold king crown + "Kingdom Chess" wordmark (premium, transparent bg).
  - `public/favicon.ico`-equivalent (generate `src/assets/favicon-512.png`, wire as PNG icon in head + manifest).
  - `src/assets/og-banner.jpg` — 1200×630 social banner (premium).
- Wire the logo into the main menu hero on `src/routes/index.tsx`.

## 2. Enable Lovable Cloud + auth

Enable Lovable Cloud (Supabase). Configure:
- **Email + password** sign-in.
- **Google** OAuth via Lovable broker (`lovable.auth.signInWithOAuth("google", …)`), then `supabase--configure_social_auth` for Google.

Schema (migration):
- `profiles` table: `id uuid PK references auth.users(id) on delete cascade`, `username text unique not null`, `display_name text`, `created_at`. Trigger on `auth.users` insert auto-creates a row with a placeholder username derived from email; user is prompted to set it on first login. RLS: anyone signed-in can read; only owner can update. GRANTs per template rules.
- `user_roles` + `app_role` enum + `has_role()` security-definer per template (used later for forum moderation; seed nothing).

New routes:
- `src/routes/auth.tsx` — public; tabs for Sign in / Sign up; Google button.
- `src/routes/_authenticated/profile.tsx` — edit display name + username.
- Header avatar/menu in main shell with Sign in / Sign out.

## 3. Basic forum

Schema (one migration, with GRANTs + RLS):
- `forum_topics`: `id`, `author_id → auth.users`, `title`, `body`, `created_at`, `reply_count int default 0`, `like_count int default 0`.
- `forum_replies`: `id`, `topic_id → forum_topics on delete cascade`, `author_id`, `body`, `created_at`, `like_count int default 0`.
- `forum_likes`: `id`, `user_id`, `target_type text check in ('topic','reply')`, `target_id uuid`, unique `(user_id, target_type, target_id)`.
- Triggers to keep `like_count` and `reply_count` in sync.

RLS:
- Topics/replies: `SELECT` to `authenticated` (forum is sign-in-gated v1 — simpler, prevents spam); `INSERT` where `author_id = auth.uid()`; `UPDATE/DELETE` by author or admin.
- Likes: `SELECT/INSERT/DELETE` scoped to `auth.uid()`.

Routes (all under `_authenticated/`):
- `_authenticated/forum.tsx` — list topics, "New topic" button, like buttons, sort by recent.
- `_authenticated/forum.$topicId.tsx` — topic detail + replies + reply composer.
- `_authenticated/forum.new.tsx` — new topic form.

Server fns in `src/lib/forum.functions.ts` (use `requireSupabaseAuth`): `listTopics`, `getTopic`, `createTopic`, `createReply`, `toggleLike`. Reads via TanStack Query (`ensureQueryData` in loader + `useSuspenseQuery` in component).

Main menu adds a "Community" tile linking to `/forum` (redirects unauthenticated visitors to `/auth`).

## 4. Installable PWA (manifest only)

Per the PWA skill — installable scope only, no service worker.

- Add `public/manifest.webmanifest` with name "Kingdom Chess", short name "Kingdom", emerald `theme_color`/`background_color`, `display: "standalone"`, `start_url: "/"`, icon entries (192, 512, maskable 512).
- Generate icons from the logo via `imagegen` into `public/icons/`.
- Add `<link rel="manifest">`, `theme-color`, `apple-touch-icon`, and updated favicons to `__root.tsx` head.
- Do NOT add `vite-plugin-pwa`, service workers, or registration code.

## 5. SEO + share metadata

- Per-route `head()` already on `index`, `play`, `sandbox`. Update all three plus add `og:image` (banner asset) only on `index` (root keeps it off per leaf-only rule).
- Title pattern: `"{Page} — Kingdom Chess"`.

## Out of scope (v1)

- Offline play (would require service worker — user picked installable-only).
- Forum moderation UI (admin role exists in schema, no UI yet).
- Avatars/file uploads.
- Password reset page (can add in a follow-up if needed; not requested).

## Files touched (approximate)

Created: `src/assets/logo.png`, `src/assets/og-banner.jpg`, `public/manifest.webmanifest`, `public/icons/*`, `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx` (integration-managed), `src/routes/_authenticated/profile.tsx`, `src/routes/_authenticated/forum.tsx`, `src/routes/_authenticated/forum.$topicId.tsx`, `src/routes/_authenticated/forum.new.tsx`, `src/lib/forum.functions.ts`, `src/lib/profile.functions.ts`, `src/components/UserMenu.tsx`, migrations for profiles/roles/forum.

Edited: `src/routes/__root.tsx` (head + manifest + auth listener + user menu), `src/routes/index.tsx` (rebrand + community tile), `src/routes/play.tsx`, `src/routes/sandbox.tsx` (titles), `src/styles.css` (refine token palette toward emerald/gold).
