## Multiplayer (PvP) — Phased Plan

Build a dedicated **Multiplayer** area accessible from the main menu, designed so today's basic version cleanly extends to a full chess.com-style experience (lobbies, ratings, history, tournaments) without rework.

### Phase 1 — Scope (what ships now)

- **New top-level route**: `/multiplayer` (lobby) + `/multiplayer/$matchId` (live game).
- **Two ways to start a match**:
  - **Shareable challenge link** — pick design + time control, get a URL to send to a friend. First signed-in visitor who isn't the host joins as the opponent.
  - **Public lobby** — list of open challenges anyone signed in can accept; create / cancel your own.
- **Variant support**: any design works — built-in presets *and* user-saved custom designs (Menagerie, Grand Menagerie, etc.). Host picks; opponent inherits.
- **Time controls (3 presets)**:
  - 10 min (rapid)
  - 30 min (long rapid)
  - 3 days/move (correspondence)
  - Server-authoritative clocks; flagging ends the game.
- **Live play**: realtime move sync, in-game move list, captured pieces, resign, offer/accept draw, takeback request (opponent must accept).
- **Result handling**: checkmate / resign / draw / timeout / royal-loss → match marked `finished`, stored permanently with full move history.
- **Profile tab**: "My games" list — active + finished, links back into each match.
- **Rating scaffolded, not computed**: every finished rated game records both players, result, and design id. Elo calculation is a later phase.

### Phase 2+ (scaffolded, not built now)

The schema and code seams are designed so these slot in without migration churn:
- Elo / Glicko rating calculation + leaderboards
- Quick-match queue (random pairing by rating band)
- More time controls (bullet, blitz, custom increments)
- Spectating, chat, post-game analysis (reuses existing `analyze-game` server fn)
- Tournaments, arenas, daily puzzles, friends list

### How it fits the existing app

- The `GameState` engine (`src/game/`) is unchanged — both clients run the same legal-move/rules code locally; the server stores moves and validates turn order + clock, not chess rules. This keeps custom pieces working for free.
- Reuses Lovable Cloud auth (already wired) and the existing profiles table.
- Realtime via Lovable Cloud Realtime channels per match.
- Main menu gets a "Multiplayer" entry next to the existing solo / designer entries.

---

### Technical section

**Database (new tables, all RLS-protected)**

- `designs` — shareable design snapshot (id, owner_id, name, design JSON, is_public). Lets a match reference a stable design even if the host edits theirs later.
- `matches` — id, host_id, guest_id (nullable until accepted), design_id, time_control (`'10min' | '30min' | '3day'`), status (`'open' | 'active' | 'finished' | 'aborted'`), host_color, result (`'w' | 'b' | 'draw' | null`), result_reason (`'checkmate' | 'resign' | 'timeout' | 'draw_agreed' | 'royal_loss' | 'stalemate' | null`), rated (bool, scaffolding), white_time_ms, black_time_ms, last_clock_update_at, turn (`'w' | 'b'`), created_at, started_at, finished_at, share_token (for link-based join).
- `match_moves` — id, match_id, ply, move JSON (matches existing `Move` type), played_at, time_left_ms. Append-only; full game replay = ordered rows.
- `match_events` — id, match_id, kind (`'draw_offer' | 'draw_decline' | 'takeback_request' | 'takeback_decline' | 'resign' | 'chat'`), actor_id, payload, created_at. Single table covers all non-move interactions and future chat.
- `ratings` — user_id, design_family (`'classic' | 'custom'` to start), rating (default 1200), games_played, updated_at. Populated but not mutated in Phase 1.

RLS: hosts/guests can read their own matches; open challenges readable by all authenticated users; moves/events insertable only by the player whose turn it is (enforced via server fn).

**Server functions** (`createServerFn`, `requireSupabaseAuth`)
- `createChallenge({ designId, timeControl, hostColor, visibility })` → returns matchId + shareToken
- `listOpenChallenges()` → public lobby feed
- `acceptChallenge({ matchId | shareToken })` → assigns guest, sets status=active, starts clock
- `cancelChallenge({ matchId })`
- `submitMove({ matchId, ply, move })` → validates turn + clock + ply ordering, updates clock, inserts move, flags timeout if needed, broadcasts via Realtime
- `respondToEvent({ matchId, eventId, accept })` → draw / takeback handling
- `resign({ matchId })`
- `listMyMatches({ status })`
- `getMatch({ matchId })` → match + moves + events (used by loader)

Chess legality is checked **client-side** using the existing `allLegalMoves` so custom pieces just work; server validates ordering, clock, and that the submitted move appears in the legal set computed from replaying stored moves (defense in depth, but doesn't duplicate piece logic).

**Realtime**: one channel per match (`match:{id}`) broadcasting new moves and events. Both clients subscribe in `useEffect` and tear down on unmount.

**Clocks**: stored as `white_time_ms`, `black_time_ms`, `last_clock_update_at`, `turn`. Effective remaining time = stored − (now − last_clock_update_at) for the side to move. On `submitMove` the server decrements the mover's clock and updates the timestamp. A scheduled check (or lazy check on next read) flags timeouts. For 3-day correspondence the same fields work with a larger budget.

**Routes**
- `src/routes/_authenticated/multiplayer.tsx` — layout with `<Outlet />`
- `src/routes/_authenticated/multiplayer.index.tsx` — lobby + "create challenge"
- `src/routes/_authenticated/multiplayer.$matchId.tsx` — live game (reuses `Board`, `MoveHistory`, `Captured`, but feeds moves through `submitMove` instead of `useGame`'s local AI loop)
- `src/routes/_authenticated/multiplayer.join.$token.tsx` — landing for shareable links
- Main menu (`src/routes/index.tsx`) gets a "Multiplayer" button.

**Hook**: new `useMultiplayerGame(matchId)` mirrors `useGame`'s API (state, tryMove, legalFor, status) but its move-application path goes server → realtime → state, with optimistic local apply on the mover's side.

**Out of scope for this phase**: Elo math, matchmaking queue, chat UI, spectating, push notifications, anti-cheat heuristics. Tables/columns to support them exist from day one.
