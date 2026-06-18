## Admin powers (inline, audited)

Add admin-only inline controls across the app, gated by `has_role(uid, 'admin'|'moderator')`. Every destructive/curation action logs to a new `admin_audit_log` table.

### 1. Foundation

**Migration:**
- `admin_audit_log` table: `actor_id`, `action` (text), `target_type` (text), `target_id` (text), `details` (jsonb), `created_at`. RLS: only admins can SELECT; INSERT only via SECURITY DEFINER helper.
- SECURITY DEFINER fn `log_admin_action(action, target_type, target_id, details)` → inserts row stamped with `auth.uid()`.
- Add admin-bypass RLS policies (`USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))`) for DELETE/UPDATE on: `forum_topics`, `forum_replies`, `game_comments`, `published_games`, `custom_pieces`, `matches`. Existing owner-scoped policies stay.
- Add `is_hidden boolean default false` to `published_games` and `custom_pieces` (admin-only writable) so the "remove from new/popular/archive feed" case becomes a soft-hide without destroying author data. Public list queries filter `is_hidden = false`.

**Client helper:** `useIsAdmin()` hook + `useAdminActions()` (server fns wrapped by `useServerFn`). Single `<AdminBadge />` chip in the top bar when signed in as admin, and an `<AdminMenu />` dropdown component reused everywhere.

### 2. Server functions (`src/lib/admin.functions.ts`)

All `requireSupabaseAuth`, all re-check `has_role` server-side, all call `log_admin_action`:
- `adminDeleteForumTopic({ topicId })`, `adminDeleteForumReply({ replyId })`, `adminPinTopic({ topicId, pinned })`, `adminFeatureTopic({ topicId, featured })`, `adminLockTopic({ topicId, locked })`
- `adminDeleteGameComment({ commentId })`
- `adminHidePublishedGame({ gameId, hidden })`, `adminDeletePublishedGame({ gameId })`, `adminFeaturePublishedGame({ gameId, featured })`
- `adminHideCustomPiece({ pieceId, hidden })`, `adminDeleteCustomPiece({ pieceId })`
- `adminCancelMatch({ matchId, reason })`, `adminPurgeStaleChallenges()`
- `adminListReports()`, `adminResolveReport({ reportId, action })`
- `adminListUsers({ q })`, `adminGrantRole({ userId, role })`, `adminRevokeRole({ userId, role })`, `adminSuspendUser({ userId, until })`, `adminRenameProfile({ userId, username })`
- `adminListAuditLog({ limit, cursor })`

### 3. Inline UI surfaces

- **Forum topic/reply rows** (`forum.index`, `forum.$topicId`): `<AdminMenu>` with Pin / Feature / Lock / Delete.
- **Published game card** (variant gallery — new/popular/archive feeds): `<AdminMenu>` with Hide from feeds / Feature / Delete. Fixes the immediate duplicate-variant problem.
- **Custom piece card** (piece library/community): Hide / Feature / Delete.
- **Game comment**: small `×` Delete button on hover when admin.
- **Match page header**: "Cancel match (admin)" button + reason field.
- **Profile page**: when viewing another user as admin, panel showing roles + Grant/Revoke moderator, Suspend, Rename. Link to that user's recent reports.
- **Reports inbox**: `/admin/reports` lightweight page (the one non-inline screen — there's no other surface for the queue) listing open reports with Resolve/Dismiss + jump-to-content link.
- **Audit log viewer**: `/admin/audit` simple paginated table.
- **Top bar**: red `ADMIN` chip when signed in as admin, with a small popover linking to Reports inbox, Audit log, and Stale-challenge purge.

### 4. Analytics (lightweight)

`/admin/stats` card grid: total users, signups last 7d, active matches, games finished last 7d, top 10 variants by plays (`variant_plays`), top 10 pieces by likes. Read-only server fn aggregating counts.

### 5. Out of scope

- No bulk-action toolkit, no admin impersonation, no DM contents review (privacy), no ban-appeal workflow. Can add later.
- No new role tier — `admin` + existing `moderator` cover this. Moderators get the content-mod actions but not user-management or role-grant actions (enforced in each server fn).