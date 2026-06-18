
## 1. Fix the AI freeze + make difficulty meaningful

### Why it currently freezes
The AI runs on the main React thread. After the last round of changes (deeper search + qsearch + Regent/Lich now valued + tie randomization touching `applyMoveToState` more), the search blows past hundreds of ms on bigger boards. While it runs, React can't paint — the spinner never appears, the "Nudge" button never appears, and the page looks frozen until the move pops out. That's also why all three difficulties feel the same: hard never finishes its deeper search before the user notices, and on big boards `chooseMove` already falls back to `easyMove`.

### How chess.com / Lichess actually do it
1. The engine runs in a **Web Worker** (Stockfish WASM in their case). The UI thread stays responsive — spinner animates, you can resign, you can scroll. The engine posts back when it has a move.
2. They use **iterative deepening with a time budget**: search depth 1, then 2, then 3… keep the best move found so far, stop when the budget expires. Difficulty = bigger time budget + bigger depth cap, not a hardcoded depth.
3. They use **transposition tables + better move ordering** (killer moves, PV, MVV-LVA) so deeper depths are cheap.

We'll adopt the same architecture — scaled to what's realistic for a custom-variant engine:

- **`src/game/ai/worker.ts`** — a Web Worker entry that imports the existing `moves.ts` / `evaluate.ts` and exposes `{type: "search", state, difficulty, budgetMs}` → posts back `{type: "result", move, depthReached, nodes}`. Sends interim `{type: "progress", depth, score}` after each completed ply.
- **`src/game/ai/engine.ts`** — thin client that wraps the worker with a Promise-based `requestMove(state, difficulty, budgetMs)`, plus `cancel()` to terminate an in-flight search.
- **`src/game/ai/search.ts`** — refactored search supporting:
  - Iterative deepening loop with `Date.now()` budget check at every node.
  - Transposition table (Zobrist hash keyed off board+turn) for repeated positions.
  - Killer-move + MVV-LVA ordering on top of the existing `moveScore`.
  - Aspiration windows around the previous iteration's score.
- **Difficulty mapping**:
  - easy: 150 ms budget, depth cap 2, 20% chance of picking a non-top move (current vibe preserved).
  - medium: 600 ms budget, depth cap 4.
  - hard: 2500 ms budget, depth cap 6 (will usually finish depth 4–5 on 8×8, depth 3 on 12×12 — actually meaningfully stronger).
- **`useGame.ts`** — replace the synchronous `chooseMove` call with `engine.requestMove(...)`; `nudgeAi` calls `engine.cancel()` and re-requests. The spinner state now reliably reflects an async operation. Add a hard wall-clock safety: if the worker doesn't respond within budget+2s, terminate and pick a fallback `easyMove`.

This single change makes the spinner work, makes "Nudge" work, and makes hard genuinely hard because the search can actually use the time without the UI looking dead.

### Files
- new: `src/game/ai/worker.ts`, `src/game/ai/engine.ts`, `src/game/ai/search.ts`, `src/game/ai/tt.ts` (zobrist + transposition table)
- edit: `src/game/ai/index.ts` (becomes a thin shim that still exports `chooseMove` for replay/analysis use; gameplay uses the engine)
- edit: `src/hooks/useGame.ts` (async AI flow, real cancel)

## 2. Gallery play counters (unique users + total plays)

### Data model
New table `public.variant_plays`:

```
id uuid pk default gen_random_uuid()
variant_key text not null     -- 'builtin:menagerie' or 'published:<uuid>' or 'saved:<id>'
user_id uuid not null references auth.users(id) on delete cascade
plays int not null default 0
created_at timestamptz default now()
updated_at timestamptz default now()
unique (variant_key, user_id)
```

GRANTs to `authenticated` + `service_role`, RLS:
- SELECT: anyone authenticated can read (we'll aggregate on the server, but reading is harmless).
- INSERT/UPDATE: only `auth.uid() = user_id`.

A view `public.variant_play_stats` (security invoker) aggregates `count(distinct user_id) as unique_players, sum(plays) as total_plays` grouped by `variant_key`. GRANT SELECT to `anon, authenticated` so unauthenticated landing-page visitors still see counts.

### Server function
`src/lib/variant-stats.functions.ts`:
- `recordVariantPlay({ variantKey })` — `requireSupabaseAuth`, upserts +1 to `plays` for `(variant_key, auth.uid())`.
- `getVariantStats({ variantKeys })` — public (no middleware), uses the server publishable client to read the aggregated view, returns `Record<variantKey, {unique: number, total: number}>`.

`useGame.ts` fires `recordVariantPlay` once per match start (using the meta id we already save).

### UI
A small `<PlayCount unique={...} total={...} />` component:

```
👥 124  ▶ 530
```

- Tiny, muted-foreground, positioned bottom-left of each card via `absolute bottom-2 left-2` (cards become `relative`).
- Used on the built-in cards in `src/routes/index.tsx`, the saved-game cards on the same page, and the published-game cards on the community/gallery page (`src/routes/_authenticated/multiplayer.index.tsx` — confirm during implementation).

The home page fetches stats once on mount via the public server fn, keyed by the list of visible variant keys.

### Files
- new: migration adding `variant_plays` table + `variant_play_stats` view + GRANTs + RLS
- new: `src/lib/variant-stats.functions.ts`
- new: `src/components/chess/PlayCount.tsx`
- edit: `src/routes/index.tsx` (fetch + render counts, position cards `relative`)
- edit: `src/hooks/useGame.ts` (call `recordVariantPlay` on game start)

## Out of scope
- No engine rewrite into WASM/Stockfish — variant rules can't run on Stockfish. The worker approach gets us most of the responsiveness win without that.
- No leaderboard / per-user history page (the data supports it later).
