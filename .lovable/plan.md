## Goal

Make the platform feel social without overbuilding. Add friends, direct messages, in-match chat, public game sharing with likes/comments, and basic safety (block/report).

## Feature scope

1. **Friends**
   - Send / accept / decline / cancel friend requests
   - Friends list with online indicator (presence)
   - Remove friend, block user (block auto-removes friendship + hides them)

2. **Direct messages (inbox)**
   - 1:1 conversations, reachable from a new "Messages" item in the main menu
   - Allowed to DM: friends, OR a user you are currently in an active match with (auto-expires from "can DM" list when match ends, but the thread stays in inbox if either is friends)
   - Unread badge in nav, thread list sorted by last activity
   - Realtime updates via Lovable Cloud realtime

3. **In-game + post-game chat**
   - Chat panel inside the match screen between the two players
   - Same thread persists into a "post-game" state so you can keep talking after the result
   - Quick "Add friend" button on the opponent's name in-match

4. **Game sharing (user-created sandbox games)**
   - "Publish" toggle on saved games → public, shareable URL `/g/:slug`
   - Public game page: tutorial preview, "Play this game" button, like button, comments
   - Likes (one per user), comments (threaded one level deep, edit/delete own)
   - Profile page lists a user's published games + like counts

5. **Moderation**
   - Block user: hides their messages, comments, games from your view; prevents new DMs/friend requests
   - Report user / report message / report game / report comment → goes to a `reports` table for later admin review (no admin UI in v1)

## Out of scope (deferred)

- Group chats, voice, typing indicators, message reactions, attachments
- Activity feed / notifications center (we'll surface unread badges only)
- Profanity filter, admin moderation dashboard
- Sharing built-in (preset) games — only user-created games get share pages

## UX surfaces

- **Top nav**: add "Friends" and "Messages" entries with unread/request badges
- **Match screen**: collapsible chat drawer + "Add friend" on opponent name
- **Post-game screen**: chat stays open, plus "Rematch" / "Back to lobby"
- **Profile page** (`/u/:username`): bio, published games, Add friend / Message / Block
- **Published game page** (`/g/:slug`): description, tutorial preview, Play button, like, comments
- **Sandbox**: "Publish" switch + share link copy
- **Help center**: short "Social & safety" section

## Technical plan

### New tables (Lovable Cloud, RLS on, GRANTs included)

- `friendships` — `user_a`, `user_b` (canonically ordered), `status` (`pending`/`accepted`), `requested_by`, timestamps. Unique on (user_a, user_b).
- `blocks` — `blocker_id`, `blocked_id`, timestamps. Unique pair.
- `dm_threads` — `id`, `user_a`, `user_b` (canonical order), `last_message_at`.
- `dm_messages` — `id`, `thread_id`, `sender_id`, `body`, `created_at`, `read_at`.
- `game_likes` — `game_id`, `user_id`, unique pair.
- `game_comments` — `id`, `game_id`, `parent_id` (nullable), `author_id`, `body`, timestamps.
- `reports` — `reporter_id`, `target_type` (`user`/`message`/`comment`/`game`), `target_id`, `reason`, `created_at`.
- `match_chat_messages` — `match_id`, `sender_id`, `body`, `created_at` (lives with match, separate from DMs so it disappears from the inbox surface unless a DM thread is also created).

Plus columns on existing tables:
- `saved_games` (or equivalent): `is_public boolean`, `slug text unique`, `like_count int`, `comment_count int`.

### Server functions (TanStack `createServerFn`, RLS-as-user)

- `friends.functions.ts`: `sendRequest`, `respondRequest`, `cancelRequest`, `removeFriend`, `listFriends`, `listIncomingRequests`
- `blocks.functions.ts`: `blockUser`, `unblockUser`, `listBlocks`
- `dm.functions.ts`: `listThreads`, `getThread`, `sendDm` (server-side check: friends OR active match opponent), `markRead`
- `matchChat.functions.ts`: `sendMatchMessage`, `listMatchMessages`
- `gameSocial.functions.ts`: `toggleLike`, `addComment`, `editComment`, `deleteComment`, `listComments`, `publishGame`, `unpublishGame`
- `reports.functions.ts`: `submitReport`

### Authorization rules (in handlers + RLS)

- DMs: sender must be friend of recipient OR share an active (non-terminal) match; neither party blocked the other.
- Friend request: blocked users can't send; can't request yourself or an existing friend.
- Comments/likes: only on `is_public = true` games; blocker can't be seen by blocked.
- Match chat: only the two match participants.

### Realtime

- Enable realtime on `dm_messages`, `match_chat_messages`, `friendships` (for incoming requests), `game_comments`.
- Client subscribes per thread / per match / per active game page; clean teardown on unmount.

### Routes (TanStack)

- `_authenticated/friends.tsx`
- `_authenticated/messages.tsx` (thread list) and `_authenticated/messages.$threadId.tsx`
- `_authenticated/u.$username.tsx` (own + others' profiles)
- Public `g.$slug.tsx` for shared game pages (SSR-friendly head/OG tags for shareability)
- Update match route to embed chat drawer

### Components

- `FriendButton`, `BlockMenu`, `ReportDialog`
- `ChatThread`, `ChatComposer` (shared by DM + match chat)
- `MessagesInbox`, `FriendsList`, `IncomingRequests`
- `LikeButton`, `CommentsSection`, `PublishGameDialog`, `ShareLinkButton`
- `UnreadBadge` wired into nav

### Safety / validation

- Zod validation on every server fn input; message body max 2000 chars, comment max 1000, report reason max 500.
- Rate-limit-ish guard: cap DMs/comments per minute per user via simple DB check.
- No PII leaks: profile lookups expose only `username`, `display_name`, `avatar`, public game list.

## Rollout order (so you can review incrementally)

1. Migrations + grants + RLS for all new tables
2. Friends + blocks (UI + server fns)
3. DM inbox + realtime
4. Match chat drawer + "Add friend" in match
5. Publish/share games + likes + comments
6. Reports + report dialogs wired across surfaces
7. Help center update + nav badges polish
