# AI Learning System

Make the engine genuinely improve over time by aggregating data from every solo game across all players, per variant, and feeding it back into the playbook all difficulty levels consume.

## What it learns from

1. **Win/loss/draw outcome** — reinforce move patterns from AI wins, discourage from losses.
2. **Per-move blunders** — after the game, re-evaluate each AI move at higher depth in a background pass; flag moves whose actual material loss exceeded the engine's prediction.
3. **Opening book** — record the first ~8 plies of each game keyed by variant; track win rate per opening line; prefer winning lines.
4. **Piece value calibration** — track trades involving each piece (especially custom pieces); nudge its effective value up or down based on whether trading it correlated with winning.

## Architecture

```text
solo game ends
   │
   ▼
client packages a GameReport
   {variantId, difficulty, result, moves[], finalEval}
   │
   ▼
server fn submitGameReport  ── writes to ai_training_games
   │
   ▼
background analyzer (server fn, kicked off after submit)
   re-scores AI moves, updates ai_playbook_stats rows
   │
   ▼
server fn getVariantPlaybook(variantId)
   returns merged tuned playbook
   │
   ▼
client AI loads tuned playbook at game start,
applies on top of local defaults
```

Cloud-synced, anonymous (only auth user id stored, never displayed). All variants get their own learned playbook so a custom variant's tactics don't pollute classic chess.

## Database (new tables, RLS enabled, public read of aggregated playbook)

- `ai_training_games` — one row per finished solo game. Columns: id, user_id, variant_id, difficulty, result (ai_win/ai_loss/draw), move_count, moves jsonb (compact SAN-ish list with eval, time, capture), final_fen, created_at, analyzed bool.
- `ai_playbook_stats` — aggregated per variant. Columns: variant_id (pk), piece_value_adjust jsonb (`{pieceType: delta}`), opening_book jsonb (`{moveSeq: {plays, wins}}`), square_bonus jsonb, blunder_patterns jsonb, games_analyzed int, updated_at. One row per variant.
- Policies: authenticated users can insert their own `ai_training_games`; anyone (anon+authenticated) can SELECT `ai_playbook_stats`; only service role writes `ai_playbook_stats`.

## Server functions (`src/lib/ai-learning.functions.ts`)

- `submitGameReport({ data })` — auth required, inserts a training row, then triggers analyzer for that row.
- `analyzeGame({ data: { gameId } })` — service-role: replays moves, re-scores each AI move with a deeper search using the existing engine ported to Node-compatible code, updates aggregated `ai_playbook_stats` for the variant.
- `getVariantPlaybook({ data: { variantId } })` — public read, returns the tuned playbook (publishable client).

## Engine integration

- `src/game/ai/playbook.ts` — already exists locally. Add `loadCloudPlaybook(variantId)` which fetches `getVariantPlaybook` once per variant per session and merges values into the local playbook (cloud values are deltas applied on top of defaults; capped so easy mode stays beatable).
- `src/game/ai/evaluate.ts` — accept the merged `pieceValueAdjust` so SEE / material counts use it.
- `src/game/ai/search.ts` — at the root, if we're within the opening book ply window for this variant, bias move ordering by the `opening_book` win-rate map.
- `src/game/solo/...` (where solo games end) — call `submitGameReport` on game end with the moves array we already store. Fire-and-forget; never block the result screen.

## Difficulty tiering

All levels use the tuned playbook, but with caps:
- Easy: applies only 25% of the cloud adjustments and ignores the opening book bias (stays beatable).
- Medium: 60%, uses opening book.
- Hard: 100%, full opening book bias.

## Validation

- Migration runs cleanly with GRANTs.
- Manual: play a quick solo game on Hard, confirm `ai_training_games` gets a row and `ai_playbook_stats` updates `games_analyzed`.
- Confirm engine still picks reasonable moves when cloud fetch fails (graceful fallback to local playbook).

## Files added/edited

- migration: new tables + policies + grants
- `src/lib/ai-learning.functions.ts` (new)
- `src/game/ai/playbook.ts` (cloud merge)
- `src/game/ai/evaluate.ts` (consume adjusted values)
- `src/game/ai/search.ts` (opening book bias)
- solo game end handler (submit report)

## Notes / tradeoffs

- The analyzer runs on the server worker; chess search is pure JS and Worker-compatible, so this is fine. It re-evaluates at depth a few plies deeper than the in-game search to detect blunders.
- Aggregated stats are public reads (`TO anon`) so the AI works for not-yet-signed-in users on the homepage demo. Raw `ai_training_games` is private — only the user who submitted can read theirs.
- We rate-limit blunder weight per game so a single weird game can't tank a variant's playbook; values move via running averages.
