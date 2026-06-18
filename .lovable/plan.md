## App shell redesign — chess.com-inspired structure

The core insight from the chess.com screenshots: **the home page isn't a directory of every feature**. It's a scrollable feed of contextual cards. Everything else lives behind a small bottom tab bar plus a dedicated "More" sheet. We adapt that to Prism's actual features (variants, sandbox, custom pieces, community) — we are not copying their content.

### Visual reset (do this first)

- **Theme**: revert to the existing light parchment theme. Delete the dark wrapper / aurora / rainbow buttons I added.
- **Logo**: keep the crest, but **stop rendering the embedded "PRISM CHESS" text from the PNG** by generating a new mark-only asset (crest + crown + prism, no wordmark). Wordmark becomes real type next to the crest where needed (e.g. "More" tab header). On the Home tab we don't need a wordmark at all — the app chrome speaks for itself, like chess.com.
- **Buttons**: shadcn defaults. Primary = emerald solid. Secondary = outline / ghost. No gradient borders. No prism shimmer.
- **Cards**: existing rounded card style. Soft shadow, parchment surface.

### App shell

A new persistent layout that wraps Home / Play / Create / Discover / More:

```text
┌─────────────────────────────────────────┐
│ [crest 28px]   …notif/profile chip      │  top bar (compact)
├─────────────────────────────────────────┤
│                                         │
│         tab content (scrollable)        │
│                                         │
├─────────────────────────────────────────┤
│  [ ▶  PLAY ]                            │  sticky primary CTA (only on Home/Discover)
├─────────────────────────────────────────┤
│  Home   Play   Create   Discover   More │  bottom tab bar
└─────────────────────────────────────────┘
```

- Bottom tabs: **Home · Play · Create · Discover · More**. Five tabs max, all real destinations.
- The big sticky **Play** button (chess.com's signature) sits above the tab bar on Home and Discover only. Tapping it navigates to the Play tab. (On the Play tab itself it would be redundant.)
- The top bar is intentionally tiny: crest on the left (taps → Home), profile avatar / sign-in on the right. No wordmark here; the app branding is the crest.

### Tab 1 — Home (the feed)

Vertical scroll, each card is one action. Order is contextual — skip cards with no data.

1. **Resume**: shown only if the user has an active multiplayer match or a last-played variant in localStorage. Two row cards: "Resume vs X (your move)" and "Continue Mini Chess".
2. **Quick play**: featured built-in variant of the week (rotates by date). Single hero card with thumbnail + "Play vs AI".
3. **Friends online** (horizontal scroll, chess.com pattern): each friend = small card with avatar, name, "Challenge" button. Shown only if the user has friends; empty state hidden.
4. **New from the community**: horizontal scroll of the 10 newest published variants. "Show all →" links to Discover tab.
5. **Popular pieces**: horizontal scroll of top custom pieces. "Show all →" links to Discover · Pieces.
6. **Recent activity**: compact list of the user's last 5 finished games (from existing `history.functions`).

Empty-state philosophy: a brand-new user sees only Quick play, New from community, and Popular pieces — not a wall of "you have nothing yet".

### Tab 2 — Play (chess.com's "New Game" screen)

Single focused screen, vertical list of large action rows:

1. **Time control** picker (for multiplayer).
2. **Start Multiplayer Game** (big primary button, mirrors chess.com's green Start Game).
3. **Play a Friend** → challenge flow.
4. **Play vs AI** → opens a sheet with the variant picker (built-in + your saved). This replaces today's "pick a game" grid as the front door.
5. **Open Challenges** → existing lobby.

### Tab 3 — Create

Two big tiles, top-aligned, plus a list of the user's drafts.

- **Design a Game** → /sandbox
- **Design a Piece** → /pieces/new
- **Your drafts**: saved variants list with Edit / Play / Delete (what's on Home today).

### Tab 4 — Discover

Tabbed within: **Games | Pieces | Forum**.

- **Games**: New / Popular / Archive (already built — just lifted out of Home).
- **Pieces**: New / Popular (already at /pieces — re-route into this tab so it's discoverable).
- **Forum**: latest threads preview + "Open community →" linking to /forum.

### Tab 5 — More (chess.com's "More" sheet)

Vertical list of grouped rows with icons (this is exactly the chess.com More screen pattern):

- **Account**: Profile, History, Sign in / Sign out.
- **Social**: Friends, Messages, Forum.
- **Settings**: Notifications, Theme (future), Help & support.

This is where Help finally lives — not on the home page.

### Information architecture summary

| Feature        | Before                 | After                              |
| -------------- | ---------------------- | ---------------------------------- |
| Multiplayer    | Top button             | Play tab + sticky Play CTA         |
| Play vs AI     | Pick built-in on Home  | Play tab → "Play vs AI" sheet      |
| Built-in games | Big grid on Home       | Surfaced via Play → vs AI picker   |
| Saved games    | List on Home           | Create tab → Your drafts           |
| Sandbox        | Top button             | Create tab → Design a Game         |
| Piece builder  | Buried at /pieces/new  | Create tab → Design a Piece        |
| Community games| Section on Home        | Home preview + Discover · Games    |
| Custom pieces  | /pieces page only      | Home preview + Discover · Pieces   |
| Forum          | Top button             | Discover · Forum + More            |
| Friends        | Top button             | Home (online row) + More           |
| Messages       | Top button             | More                               |
| History        | Top button             | Home (recent activity) + More      |
| Help           | Top button             | More                               |

### Technical plan

- **New route**: `src/routes/_app.tsx` — pathless layout route that renders top bar, `<Outlet />`, sticky Play CTA, bottom tab bar. (Avoids touching `_authenticated/` gate; Home/Play/Discover work signed out.)
- **Move existing routes into `_app/`** by renaming, so they render inside the shell:
  - `src/routes/index.tsx` → `src/routes/_app/index.tsx` (Home feed)
  - `src/routes/sandbox.tsx` → stays standalone (full-screen builder shouldn't have the shell)
  - `src/routes/pieces.index.tsx` → stays, linked to from Discover
- **New routes**:
  - `src/routes/_app/play.tsx` — New Game screen.
  - `src/routes/_app/create.tsx` — Create hub.
  - `src/routes/_app/discover.tsx` — Discover hub with `?tab=games|pieces|forum`.
  - `src/routes/_app/more.tsx` — More sheet.
- **New components**:
  - `src/components/shell/AppShell.tsx` — top bar, sticky CTA, bottom tabs.
  - `src/components/shell/BottomTabs.tsx`.
  - `src/components/home/ResumeCard.tsx`, `FriendsOnlineRow.tsx`, `FeaturedVariantCard.tsx`, `RecentActivity.tsx`, `HorizontalCardScroll.tsx`.
- **Data**: reuse existing `listDiscoveryGames`, `listMyMatches`, `listFriends`, `getVariantStats`, `loadSavedGames`, `listHistory`. No new server functions, no schema changes.
- **Logo asset**: generate `src/assets/logo-mark.png` (transparent, no text) via imagegen premium for crisp use at small sizes.
- **Cleanup**: remove `home-aurora-*`, `home-panel*`, `prism-button*` utilities from `src/styles.css`.

### What I'm explicitly not doing

- No copying chess.com's puzzles / lessons / coach / awards / membership — we don't have those features.
- No bot levels or rating system in this pass.
- No tournaments tile (we have no tournaments yet; would be a placeholder).
- Sandbox, /play, /multiplayer, /forum internals untouched — only their entry points and chrome change.

### One quick confirmation before I build

Do you want **Watch** as a tab (chess.com has it for live games — we'd repurpose it as "Spectate ongoing public matches"), or is **Discover** (community variants + pieces + forum) the better fifth tab? My recommendation is **Discover** — we don't have spectator infrastructure yet, and discovery of custom content is more central to Prism's identity. I'll proceed with Discover unless you say otherwise.
