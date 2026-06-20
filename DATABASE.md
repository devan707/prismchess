# Database

Supabase Postgres. Schema is managed by timestamped SQL migrations in
`supabase/migrations/` (~36 files as of writing). Never edit a past
migration — add a new one.

---

## Tables (public schema)

Grouped by domain. Column counts are approximate; see latest migrations for the source of truth.

### Identity & roles

- `profiles` — one row per `auth.users` id (FK indirect, populated by the
  `handle_new_user` trigger). Holds `username`, `display_name`, avatar,
  `is_founder`, `suspended_until`.
- `user_roles` — `(user_id, role)` pairs against `app_role` enum
  (`admin`, `moderator`, `user`). Roles are **never** stored on `profiles`.
- `app_role` enum + `has_role(uid, role)` SECURITY DEFINER function — the
  canonical role check used in every admin policy.

### Variants & pieces

- `custom_pieces` — user-defined pieces. Includes image references to the
  `piece-images` storage bucket, like count, AI movement summary.
- `piece_likes`, `piece_ability_requests` — engagement / requests.
- `published_games` — shareable variant designs. Has `design_json`,
  comment count, like count, slug.
- `game_likes`, `game_comments`, `variant_plays`, `variant_stats` (view) —
  engagement.

### Play

- `solo_games` — completed solo games (design snapshot, moves[], result,
  human color, difficulty). Used for the history detail replay page.
- `matches` — multiplayer challenges/games. Lifecycle: `open` → `active`
  → `finished` / `aborted`. Has host/guest, design, results, timing.
- `match_moves` — per-move log for live games + replays.
- `match_events`, `match_chat_messages` — auxiliary streams.

### Social

- `friendships` — undirected pairs `(user_a, user_b)` with `LEAST/GREATEST`
  canonicalization; status `pending`/`accepted`.
- `blocks` — directed `(blocker_id, blocked_id)`.
- `dm_threads`, `dm_messages` — 1:1 DMs. Threads use canonical `(user_a, user_b)`.
- `notifications`, `push_subscriptions` — in-app + web push.

### Forum & announcements

- `forum_topics`, `forum_replies`, `forum_likes` — community forum.
- `topic_suggestions` — user-submitted topic suggestions.
- `announcements`, `announcement_reads` — admin announcements + welcome modal state.

### Admin

- `admin_audit_log` — append-only via `log_admin_action(...)`.
- `reports` — user reports against content/users.

### AI

- `ai_playbook_stats` — per-variant move statistics fed to the engine's
  playbook snapshot.
- `ai_training_games` — captured games used to grow the playbook.

### Ratings

- `ratings` — Elo-like ratings per user / variant.

---

## RLS

- **Enabled on every public-schema table.**
- Default pattern: SELECT scoped to `auth.uid()` or `is_match_participant`,
  INSERT/UPDATE/DELETE scoped to owner.
- Public-readable tables (`published_games`, `custom_pieces` listings,
  `announcements`) have narrow `TO anon` SELECT policies on safe columns.
- Admin/moderator actions use `has_role(auth.uid(), 'admin')` etc. in
  policies and in SECURITY DEFINER functions (`admin_list_users`,
  `log_admin_action`).

**Important RLS helpers (all SECURITY DEFINER):**
- `has_role(uid, role)` — role check.
- `is_match_participant(match_id, uid)` — gate for `match_*` rows.
- `are_friends(a, b)`, `is_blocked_either(a, b)`, `share_active_match(a, b)`
  — social gates used by DM / friend-request policies.

**Triggers:**
- `handle_new_user()` (on `auth.users` insert) — creates profile,
  generates a unique username, opens a welcome DM from the founder.
- `bump_*` family — keep denormalized counters in sync
  (`forum_topics.reply_count`, `published_games.comment_count`, like
  counts on topics/replies/pieces/games).
- `bump_dm_thread()` — updates `dm_threads.last_message_at`.
- `set_updated_at()` — generic `updated_at` maintainer.

---

## GRANT discipline

Every new `public.<table>` migration must include explicit GRANTs in the
same file:

```sql
CREATE TABLE public.foo (...);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foo TO authenticated;
GRANT ALL ON public.foo TO service_role;
-- GRANT SELECT ON public.foo TO anon;  -- only if a TO anon policy exists
ALTER TABLE public.foo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... ;
```

PostgREST will return permission errors without these even when RLS would
allow the read.

---

## Migrations

- 36+ files in `supabase/migrations/`, timestamped `YYYYMMDDhhmmss_<uuid>.sql`.
- The Lovable migration tool writes new files here automatically. When
  authoring locally, follow the same naming so Lovable's tracker stays in
  sync.
- `supabase/config.toml` is auto-managed — only contains `project_id`.
- Never `ALTER DATABASE postgres ...` (rejected by the platform).

---

## Storage buckets

- `piece-images` (private) — uploads from the piece builder. Served via
  `src/routes/api/public/piece-img/$.ts` proxy after auth/permission check.
- `avatars` (private) — profile avatars.

---

## Edge functions

None. App-internal server logic uses `createServerFn` (TanStack Start
server functions), not Supabase Edge Functions. The only public HTTP
endpoints owned by this app are TanStack server routes under
`src/routes/api/public/*`.
