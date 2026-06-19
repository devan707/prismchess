
## Goals

1. Make it easy to issue a challenge using **any** variant — built-in, your saved variants, or the one you're currently playing vs the AI.
2. Make share links work for **brand-new** users: open link → see the challenge → sign up → land back on the challenge and accept in one flow.
3. Don't start the clock until **both players are present and ready** for the match.
4. Notify the host (push + in-app toast) the moment an opponent joins, and again once they tap Ready.

---

## 1. More places to create a challenge

### a. From the Play screen (vs AI)
Add a **"Challenge a friend"** button to the play screen's settings sheet. It opens a shared create-challenge dialog pre-filled with the current design (built-in or saved). On submit it generates a link-only challenge and shows the share URL with a copy button.

### b. From the Lobby (`/lobby`)
Add a **"Challenge a friend"** card alongside "Play Online" / "Play vs AI". Selecting it lets you pick from built-in games **and** your saved variants, then opens the same create-challenge dialog (link-only by default, with a "Also post to public lobby" toggle).

### c. From `/multiplayer` (already mostly there)
The dialog already supports built-in + saved + public/link. Small polish: surface saved variants more prominently when present.

The dialog will be extracted into `src/components/multiplayer/CreateChallengeDialog.tsx` so all three entry points share one implementation.

---

## 2. Share-link flow for new users

Today `/multiplayer/join/$token` lives under `_authenticated/`, so an unauth visitor gets bounced to `/auth` and the join token is lost.

Fix:

- Move the join route to a **public** path: `src/routes/multiplayer.join.$token.tsx` (top-level, SSR on). Delete the `_authenticated` copy.
- Add a public server fn `getChallengePreview({ token })` (no `requireSupabaseAuth`, publishable-key client) that returns only safe fields: host display name, design name, time control, host color. Backed by a narrow `TO anon` SELECT policy on `matches` restricted to `status='open'`.
- The "Accept challenge" button:
  - **If signed in** → call `joinMatch({ token })` → navigate to the match.
  - **If signed out** → store the token in `sessionStorage` (`pendingJoinToken`) and navigate to `/auth?redirect=/multiplayer/join/<token>`.
- `/auth` and `/onboarding` honor `?redirect=…` (validated same-origin) after sign-in / sign-up / Google / username pick.
- When the user lands back on the join page signed in with `pendingJoinToken` matching the URL, auto-fire the accept call, then clear the token.

Net result: someone receives the link, opens it, sees "Alice invited you to play Menagerie · 10 min · you'll play Black", taps Accept → signup → pick username → drops into the match.

---

## 3. Ready-check before the clock starts

### How this is normally handled
Async / correspondence sites (Lichess correspondence, chess.com Daily) don't tick the clock until both players have loaded the match page and clicked **"I'm ready"**. For invite-link live games, sites typically wait for both players to be on the board, then run a short countdown ("Match starting in 3…") before the timer starts.

### Proposed behaviour
- Add `ready_w`, `ready_b` booleans and a new `status='ready_check'` to `matches`.
- `joinMatch` now sets `status='ready_check'` (not `active`), guest joined, both ready flags false, clocks paused.
- Match screen when `status='ready_check'`:
  - Centered card: "Both players present. Tap **Ready** to start." with a Ready button and a live "Opponent: ready / not ready" indicator.
  - Board disabled.
- New server fn `markReady({ matchId })` flips the caller's flag. When both flags are true, server transitions to `status='active'`, sets `last_clock_update_at = now()`, shows a 3-second countdown overlay on the board, then play begins.
- If a player navigates away during ready-check their flag resets to false. After >60s of no-show, the other side can **claim no-show** (match aborts cleanly, no rating change).

---

## 4. Notifications

Reuse the existing `sendPushBackground` helper plus realtime updates (already present on the match channel).

Three new notification points:

| Event | Recipient | Push title / body | In-app |
| --- | --- | --- | --- |
| Guest joins (`status` → `ready_check`) | Host | "Opponent joined" / "Tap to start your match" | Toast on lobby or any page; the match page itself updates via the existing realtime channel |
| Opponent taps Ready (one side ready) | Other player | "Opponent is ready" / "Tap Ready to begin" | Card on match page updates live |
| Both ready → game starts | Both players | "Game on" / "It's your move" sent only to the side whose turn it is | 3-sec countdown overlay |

Implementation:
- `joinMatch` already sends a push to the host on accept — update copy to "Opponent joined — tap to start" and add `tag: match:<id>:joined` so it replaces the older "challenge accepted" tag.
- `markReady` sends a push to the other player ("Opponent is ready") and, if both are now ready, a "Game on" push to whoever moves first.
- Subscribe to the match's existing realtime channel from the lobby header too, so a small toast appears app-wide when one of your open challenges flips to `ready_check`.

---

## Technical notes

- **DB migration**: add `ready_w boolean default false`, `ready_b boolean default false`, expand the `status` check constraint to include `'ready_check'`, add a narrow public anon SELECT policy on `matches` (open challenges only, safe columns enforced by the server function's projection).
- **Server fns** (`src/lib/multiplayer.functions.ts`):
  - New public `getChallengePreview({ token })`.
  - New `markReady({ matchId })`.
  - Modify `joinMatch` to set `status='ready_check'`, keep clocks paused, and update the push body/tag.
  - Modify `submitMove` / `claimTimeout` to require `status='active'`.
- **Routes**:
  - New public `src/routes/multiplayer.join.$token.tsx`; delete `_authenticated/multiplayer.join.$token.tsx`.
  - `/auth` + `/onboarding`: accept and honor `?redirect=…`.
- **UI**:
  - `src/components/multiplayer/CreateChallengeDialog.tsx` — shared dialog used by `/play`, `/lobby`, and `/multiplayer`.
  - `src/routes/play.tsx`: settings-sheet "Challenge a friend" button.
  - `src/routes/lobby.tsx`: "Challenge a friend" card.
  - `src/routes/_authenticated/multiplayer.$matchId.tsx`: `ready_check` UI, Ready button, opponent-ready indicator, 3-sec start countdown.

## Out of scope

- Real-time WebRTC presence; we use ready-clicks + a "last seen" timestamp.
- Rematch flow and rating adjustments.
