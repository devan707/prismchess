## Goal
Add a "My Creations" hub to the Create page so users can find their published games, their custom pieces, local drafts, and their favorites (liked games + pieces) from other creators — wired into the existing publish/edit/play flows.

## Where it lives
The Create page (`/create`) gets a tabbed layout:

1. **My Games** — local drafts (existing) + published games (new)
2. **My Pieces** — custom pieces the user has built
3. **Favorites** — games and pieces the user has liked

A "My Creations" entry point is also added to the Profile page and the More menu so it's reachable from anywhere.

## Tab contents & actions

**My Games**
- *Drafts* (browser-saved, existing behavior): Play, Edit in Sandbox, Delete
- *Published*: thumbnail/name, like + comment counts, **View** (`/g/<slug>`), **Edit** (loads the design into `/sandbox` so updates re-save to the same `published_games` record — uses the existing `publishedGameId` flow), **Unpublish**

**My Pieces**
- Icon + name, visibility badge, like count, **Edit** (`/pieces/<slug>` builder), **Delete**, **View on profile**

**Favorites**
- *Liked games*: same row shape as Published — View, Play (loads design into sandbox/play), Unlike
- *Liked pieces*: View piece detail, Unlike
- Empty state guides users to `/discover` and `/pieces` to find creations to like

## Integrations
- Liking already exists for games (`toggleLike`) and pieces (`piece_likes`). Reuse those mutations so unliking from Favorites updates counts everywhere via `queryClient.invalidateQueries`.
- Owner-only **Edit in sandbox** button added to `/g/$slug` when `author_id === me`, so editing a published game from its detail page funnels into the same update flow.
- Profile page gets a "My Creations" link in addition to the existing tabs.

## Technical notes
- New server fns in `src/lib/social.functions.ts` and `src/lib/piece-builder.functions.ts`:
  - `listMyLikedGames` — joins `game_likes` → `published_games` for `auth.uid()`, excludes hidden
  - `listMyLikedPieces` — joins `piece_likes` → `custom_pieces` for `auth.uid()`, excludes hidden
- Both use `requireSupabaseAuth`; no schema changes (existing RLS on `game_likes` / `piece_likes` already scopes to the user).
- `/create` becomes an `_authenticated` route (move file to `src/routes/_authenticated/create.tsx`) so the data tabs always have a session; the unauthenticated landing already redirects via the managed gate. Local drafts continue to work since they're `localStorage`.
- Data loading uses the standard pattern: loader primes `ensureQueryData`, components use `useSuspenseQuery`. Mutations (delete draft, unpublish, unlike) invalidate the relevant query keys.
- Existing `publishGame` already accepts `gameId` for updates; Edit-from-list just sets `publishedGameId` in sandbox state before navigation (passed via search param).

## Out of scope
- Collections/folders, sharing favorite lists, sorting/filtering beyond newest-first, thumbnails for games (we can add a board mini-preview later if you want).
