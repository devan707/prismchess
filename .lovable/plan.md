# Terms, consent, avatar upload & polished signup flow

## 1. Legal pages (AI-generated, app-specific)

Public routes with full content drafted by Lovable AI (one-off, committed as static JSX):

- **`/terms`** — `src/routes/terms.tsx`
- **`/privacy`** — `src/routes/privacy.tsx`

Prism Chess-specific clauses:

- **User-generated content / variants**: by publishing a variant, custom piece, forum post, or comment you grant Prism Chess a perpetual, worldwide, royalty-free, sublicensable license to host, display, reproduce, modify, distribute, and create derivative works. Prism Chess may feature, promote, or include your variants in default content; **no royalties or attribution payments owed**.
- **Ownership**: you retain authorship of your contributions but waive royalty/compensation claims; Prism Chess owns the platform, branding, and the curated "signature" catalog.
- **Acceptable use**: no hate speech, harassment, cheating, automation/bots, scraping, reverse engineering, IP infringement, NSFW pieces/avatars/usernames.
- **Account rules**: 13+ (COPPA), one human per account, you're responsible for activity on your account, suspension for violations.
- **Termination**: either side may terminate; published variants may remain available after account deletion.
- **Disclaimers / liability cap / indemnity / governing-law placeholder**.
- **Privacy policy**: data collected (email, auth provider id, profile, gameplay history, push tokens, IP/UA for abuse), use, no selling, third parties (Lovable Cloud hosting, Google OAuth, push providers), retention, deletion request flow, cookies, children's data, contact.
- **Versioning**: "Last updated" date + version string; constants in `src/lib/legal.ts`.

Both pages: semantic HTML, table of contents, `head()` SEO, linked from auth page footer and `more.tsx`.

## 2. Profile schema additions

Migration adds to `public.profiles`:

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `tos_version` | `text` | `null` | Version accepted |
| `tos_accepted_at` | `timestamptz` | `null` | When |
| `privacy_version` | `text` | `null` | Version accepted |
| `age_confirmed` | `boolean` | `false` | 13+ self-attest |
| `marketing_opt_in` | `boolean` | `false` | App updates, new signature variants |
| `community_updates_opt_in` | `boolean` | `false` | **Periodic** community updates (forum highlights, popular variants) — no fixed cadence |
| `gameplay_notify_opt_in` | `boolean` | `true` | Soft preference for gameplay events (your move, challenge accepted, DM, friend request) |
| `avatar_url` | `text` | `null` | Public URL of uploaded avatar (separate from existing `avatar` emoji column) |

RLS already scoped to self — no policy changes.

## 3. Avatar upload — storage

- New **public storage bucket `avatars`** (call `storage_create_bucket` with `public=true`; if the workspace blocks public buckets, fall back to private + signed URLs).
- RLS on `storage.objects`:
  - Anyone can `SELECT` from `avatars` (public read).
  - `authenticated` can `INSERT`/`UPDATE`/`DELETE` only when `name` starts with `auth.uid()::text || '/'` (folder-per-user enforcement).
- Client uploads to `avatars/{userId}/{timestamp}.{ext}`; old file deleted on replace.
- Limits enforced client-side: image only (jpg/png/webp), max 3 MB, square-cropped via canvas before upload.

## 4. Sign-up form (`src/routes/auth.tsx`)

Add **one mandatory checkbox** above the submit:

> ☐ I'm 13 or older and agree to the [Terms](/terms) and [Privacy Policy](/privacy).

- Disables submit until checked, on both the email/password tab and Google button.
- Small footer links to `/terms` and `/privacy`.

Captured agreement is finalized server-side in onboarding so both email and Google flows go through the same gate.

## 5. Onboarding restructured

Step bar becomes: **consent → name → avatar → notifications → done**.

### Step 1 — Consent
- **Required** ☐ I'm 13+ and agree to the Terms and Privacy Policy. *(pre-checked if user already accepted on auth page; still shown for transparency)*
- **Optional** ☐ Email me about Prism Chess product updates (new features, new signature variants). *(marketing_opt_in)*
- **Optional** ☐ Send me **periodic** community updates (forum highlights, popular variants). *(community_updates_opt_in — no fixed cadence; copy is honest about that)*
- **Optional** ☐ Let me know about gameplay events (your move, challenge accepted, friend requests, DMs). *(gameplay_notify_opt_in, default checked)*

### Step 2 — Name (existing, unchanged)

### Step 3 — Avatar (revamped)
- **Three modes** in one step:
  1. **Upload a photo** — file picker / drag-drop, square-crop preview, "Use this" → uploads to `avatars` bucket → sets `avatar_url`.
  2. **Pick a symbol** — existing emoji grid (sets `avatar`).
  3. **Skip** — defaults to colored initial of display name.
- Live preview circle at top showing current selection.

### Step 4 — Notifications
- Browser push permission prompt via `usePushNotifications` (only when `supported`).
- Big "Turn on notifications" + "Maybe later" buttons.
- Caveat: only used for gameplay events you opted into; can be changed in Settings.

## 6. Server changes

`src/lib/profile.functions.ts → completeOnboarding`:
- Accept new fields: `tos_version`, `privacy_version`, `age_confirmed`, `marketing_opt_in`, `community_updates_opt_in`, `gameplay_notify_opt_in`, `avatar_url`.
- Reject if `age_confirmed !== true` or legal versions missing.
- Stamp `tos_accepted_at = now()`.

New `updateNotificationPrefs` and `updateAvatar` server fns for later Settings page edits.

`src/lib/push.server.ts` — skip pushes for users with `gameplay_notify_opt_in = false`.

## 7. Contextual re-prompts

- **`CreateChallengeDialog`**: if `gameplay_notify_opt_in === true` AND browser permission is `default`, show a small inline "Get notified when someone joins — Enable push" with one-tap enable. Dismissal stored in `localStorage`.
- Same pattern (deferred wiring) for first friend request / first DM received — call out, implement only the challenge case now.

## 8. Settings access

Extend the existing profile page with a **"Notifications & email"** section:
- Toggles for the four opt-in columns.
- Browser push enable/disable.
- "Change avatar" button (upload / pick emoji / clear).
- "Terms accepted: v{date}" with links to /terms and /privacy.

## 9. Re-consent on version bump

`src/lib/legal.ts` exports `TOS_VERSION` and `PRIVACY_VERSION`. Root layout checks the signed-in profile; if stored versions are older, route to a slim `/accept-terms` page with a one-line summary of what changed and a required checkbox.

## 10. Other standard signup-flow additions

Suggested — included in this plan, easy to drop if you don't want them:

- **Reserved-username blocklist** (`admin`, `support`, `prism`, `mod`, etc.) checked server-side.
- **Username uniqueness check on blur** during the name step (currently only fails on submit).
- **Username profanity filter** (simple wordlist, server-side).
- **Skill self-rating** ("New to chess / Casual / Serious") on the consent step or its own micro-step → stored as `skill_level` enum; seeds matchmaking and home-screen recommendations.
- **"Show me how to play" CTA** on the final "Welcome" screen linking to the sandbox or a quick tutorial.
- **Welcome toast on home page** the first time after onboarding, pointing to Lobby / Create / Forum.

Out of scope for now (mentioned for awareness):

- Welcome email (needs an email sender; flag for later).
- Account export / data download endpoint (privacy-policy-friendly but not urgent).

## Technical notes

- Legal copy generated once by Lovable AI via `generateText` in a one-off script; committed as static JSX so users see consistent text and we don't burn credits per pageview.
- Versions stored as ISO date strings like `"2026-06-19"`.
- Push permission state vs. opt-in stay separate: opt-in is "you may notify me about X" (app-level filter); push permission is the browser capability. Server checks both.
- Avatar bucket: prefer public; if blocked by workspace policy, fall back to private bucket + per-user signed URLs and surface a one-line note to you.

## Files touched

- New: `src/routes/terms.tsx`, `src/routes/privacy.tsx`, `src/routes/_authenticated/accept-terms.tsx`, `src/lib/legal.ts`, `src/components/AvatarUploader.tsx`
- Edit: `src/routes/auth.tsx`, `src/routes/_authenticated/onboarding.tsx`, `src/routes/_authenticated/profile.tsx`, `src/lib/profile.functions.ts`, `src/components/multiplayer/CreateChallengeDialog.tsx`, `src/routes/__root.tsx`, `src/routes/more.tsx`, `src/lib/push.server.ts`
- Migration: 8 columns added to `profiles`; `avatars` bucket + storage policies
