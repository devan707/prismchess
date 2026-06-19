## Admin Curation for Pieces & Variants

Good news: most of the backend already exists. `custom_pieces` and `published_games` both have `is_featured` and `is_hidden`, with admin server functions `adminSetCustomPieceFlags`, `adminSetPublishedGameFlags`, `adminDeleteCustomPiece`, `adminDeletePublishedGame`. RLS already lets admins/mods update + delete both tables. So this is mostly UI plus two small server-function tweaks to let admins edit content they don't own.

### Terminology mapping
- **Promote to signature** = set `is_featured = true`
- **Demote** = set `is_featured = false`
- **Archive** (soft hide) = set `is_hidden = true` (stays in DB; removed from public discovery, palette, and play)
- **Delete** = hard delete row
- **Default palette / library** = piece library filters by `is_featured` to show "signature" pieces alongside the user's own creations

### 1. Admin curation menus on existing pages

Add an `AdminMenu` (the existing red admin dropdown) to:
- **`/pieces/$slug`** (piece detail) — actions: Promote/Demote signature, Archive/Unarchive, Edit, Delete
- **`/g/$slug`** (variant detail) — actions: Promote/Demote signature, Archive/Unarchive, Edit, Delete
- **Each row of `PieceLibraryPanel`** and the variant cards in `discover` / `create` — same actions, compact

The menu is rendered through `useIsAdmin` so non-admins see nothing. After each action we `router.invalidate()` and toast.

### 2. New admin dashboard: `/admin/content`

A single page with two tabs (Pieces / Variants). Each tab is a sortable/searchable table showing: name, author, created, status badges (Signature, Hidden), like count. Row actions: Promote, Demote, Archive, Unarchive, Edit, Delete. Filter chips: All / Signature / Hidden / Public. This is the central "spring cleaning" surface; the inline menus on detail pages are the in-context shortcuts.

Add a link to it from the existing red `AdminBadge` popover ("Content library").

### 3. Admin edit for any piece or variant

Currently `getMyPieceBySlug` and the `publishGame` update path both require `author_id = userId`, so the "Edit" button on the admin menu would fail. Two minimal changes:

- **`getMyPieceBySlug`** → add an admin/mod bypass: if the caller has `admin`/`moderator` role, drop the `author_id` filter. Audit-log the load as `custom_piece.admin_edit_view`.
- **`savePiece` / `updatePiece`** in `piece-builder.functions.ts` → when caller is admin/mod and not the author, allow the update; preserve original `author_id`; audit-log `custom_piece.admin_edit`.
- **`publishGame`** → when caller is admin/mod and the target row belongs to another author, allow the in-place update; preserve `author_id`; audit-log `published_game.admin_edit`. Dedupe checks scope to the target row's author, not the caller.
- New tiny server fn **`getPublishedGameForEdit`** (admin or owner) that returns full design/tutorial JSON for the editor to hydrate (the existing edit flow loads from `/g/$slug`; we just make sure admin can hit it).

The existing edit routes (`/pieces/$slug/edit` and the create page in edit mode) then "just work" for admins on anything.

### 4. Auto-refresh of signature surfaces

- `PieceLibraryPanel` and the variant discovery list already read from the DB. When promoted/demoted/hidden, a `router.invalidate()` + react-query invalidation on the relevant keys refreshes them. No schema changes needed.
- The hardcoded "Quick Play featured" on `/` currently calls a local `pickFeatured()`. Out of scope: switching that to DB-driven. Note in a comment but don't change behavior in this turn.

### 5. Audit & safety
- All admin actions go through the existing `log_admin_action` RPC (already wired in `admin.functions.ts`).
- Destructive actions (Archive, Delete) prompt via `AdminMenu`'s built-in `confirm` field. Delete uses a stronger "type the name to confirm" dialog in `/admin/content` to prevent accidents.

### Files

**New**
- `src/routes/_authenticated/admin.content.tsx` — Pieces/Variants management dashboard
- `src/components/admin/PieceAdminMenu.tsx`, `src/components/admin/VariantAdminMenu.tsx` — thin wrappers around `AdminMenu` with the right action set

**Edited**
- `src/lib/admin.functions.ts` — add `adminListAllPieces`, `adminListAllPublishedGames` (filterable), `adminGetPieceForEdit`, `adminGetPublishedGameForEdit`
- `src/lib/piece-builder.functions.ts` — admin bypass in `getMyPieceBySlug`, `savePiece`, `updatePiece`
- `src/lib/social.functions.ts` — admin bypass + author preservation in `publishGame` update branch
- `src/routes/pieces.$slug.tsx`, `src/routes/g.$slug.tsx` — render admin menu
- `src/routes/pieces.$slug.edit.tsx`, `src/routes/create.tsx` (edit-existing path) — use admin loader when caller is admin and not author
- `src/components/pieces/PieceLibraryPanel.tsx` — admin row actions
- `src/components/admin/AdminBadge.tsx` — link to `/admin/content`

**No migration required.** All flags, RLS, and audit infrastructure already exist.

### Out of scope (call out for later)
- Migrating the homepage Quick Play to a DB-driven "signature of the week"
- Bulk operations on the admin content page (multi-select)
- Soft-deleted/trash bin with restore (we have archive via `is_hidden` which is reversible)

Want me to proceed with this?
