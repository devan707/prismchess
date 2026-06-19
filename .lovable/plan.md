## Announcements System

### Database (1 migration)

**`public.announcements`**
- `id uuid pk`, `title text`, `body text`, `cta_label text?`, `cta_href text?`
- `kind text` — `welcome | update | feature | variant | spotlight | challenge | general`
- `pinned bool default false`, `active bool default true`
- `forum_topic_id uuid?` — links to the auto-created forum thread
- `published_at timestamptz default now()`, `created_by uuid`, `created_at`, `updated_at`
- RLS: any signed-in user can `SELECT` where `active = true`; admins/moderators full CRUD (`has_role`)
- GRANTs to `authenticated` + `service_role`

**`public.announcement_reads`**
- `user_id`, `announcement_id`, `read_at`, pk(user_id, announcement_id)
- RLS: user manages own rows only

**`public.profiles.welcomed_at timestamptz?`** — set when the first-time Welcome modal is dismissed.

### Forum integration

Every announcement has a paired forum topic in an **"Announcements"** category, so the forum becomes the news archive.

- On `createAnnouncement`: server fn also inserts a `forum_topics` row (category `announcements`, authored by the admin, body = announcement body + small "📣 Official announcement" header), stores the new topic id in `announcements.forum_topic_id`.
- On `updateAnnouncement`: optionally syncs the topic's title/body (admin can untick "also update forum thread" if they only want to fix a typo silently — default on).
- On `deleteAnnouncement`: leaves the forum thread in place (history) but clears the link; admin can delete the topic separately if they want.
- Announcement modal CTA: if `forum_topic_id` is set, show a **"Discuss in forum"** link to `/forum/$topicId` alongside the existing optional `cta_label/cta_href` and Dismiss buttons.
- Forum list (`forum.index.tsx`): announcement-linked topics get a small "Announcement" badge and sort pinned-first within the announcements category.

If `announcements` isn't already a recognized forum category, add it to whatever category enum/list the forum uses (will confirm during implementation by reading `forum_topics` schema + forum index).

### Server functions (`src/lib/announcements.functions.ts`)

- `listActiveAnnouncements()` — auth, ordered pinned desc, published_at desc, joined with reads for current user
- `getUnseenAnnouncement()` — next 1 unseen active announcement (pinned first) for modal
- `markAnnouncementRead({ id })`
- `markWelcomed()`
- Admin-only (verified via `has_role`): `createAnnouncement` (also creates forum topic), `updateAnnouncement` (syncs topic), `deleteAnnouncement`, `togglePinned`, `toggleActive`, `listAllAnnouncementsAdmin`

### UI

**`src/components/announcements/AnnouncementModal.tsx`** — title, body, Pinned badge, optional CTA, "Discuss in forum" link, Dismiss (calls `markAnnouncementRead`).

**`src/components/announcements/WelcomeModal.tsx`** — shown when `profiles.welcomed_at` is null. Copy:

> **Welcome to Prism Chess**
>
> You're one of the first people here — thanks for showing up early. Prism Chess is a brand new project, and the community is still finding its feet. That's the fun part: what this place becomes is going to be shaped by the people who jumped in at the start, including you.
>
> Here you can play classic and experimental variants against the AI, design your own pieces with custom movement and abilities, build full variants around them, and challenge friends to matches with whatever wild rules you cook up.
>
> If you make something interesting, share it. If you have an idea, post it in the community forum and introduce yourself — I read everything. We're early, and the best things this app does next will come from you.
>
> — The Prism Chess team

Buttons: **Play Now** (→ `/`), **Visit Community** (→ `/forum`), **Dismiss**. All call `markWelcomed`.

**`AnnouncementGate`** mounted in `src/routes/_authenticated/route.tsx`:
1. Welcome modal if `welcomed_at` is null
2. Otherwise next unseen active announcement
3. Skip on `/onboarding`
4. Session `localStorage` snooze prevents re-pop after dismissing mid-session

**Admin page `src/routes/_authenticated/admin.announcements.tsx`**
- Table: title, kind, pinned, active, forum link, published_at
- New / Edit dialog: title, body, kind, cta label/href, pinned, active, "Also post/update forum thread" checkbox (default on)
- Row actions: Edit, Toggle pin, Toggle active, Delete, Open forum thread
- Linked from `AdminMenu.tsx`

### Seed

Migration inserts one welcome announcement (`kind=welcome`, `pinned=true`) and its paired forum topic (authored by a system/admin user — will pick the first user with the `admin` role at migration time; if none exists, insert announcement only and create the topic on first admin login via a one-shot backfill on the admin page):

> **We're live — and you're early.**
> Prism Chess just opened its doors. Custom pieces, custom variants, AI play, and friend challenges are all here today. Jump into the forum, share what you build, and help steer where this goes next.

### Files

- New: migration; `src/lib/announcements.functions.ts`; `src/components/announcements/{AnnouncementModal,WelcomeModal,AnnouncementGate}.tsx`; `src/routes/_authenticated/admin.announcements.tsx`
- Edit: `src/routes/_authenticated/route.tsx`, `src/components/admin/AdminMenu.tsx`, `src/routes/_authenticated/forum.index.tsx` (announcement badge), `src/integrations/supabase/types.ts` (regenerated)

### Out of scope
Push notifications, rich-text editor, scheduled publishing, per-user targeting.
