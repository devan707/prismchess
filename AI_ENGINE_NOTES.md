# AI Engine Notes

This document describes the **game-playing AI** in `src/game/ai/`. It does
not cover the Lovable AI Gateway (LLM helpers) — that's a completely
separate system.

Audience: a future engineer (human or coding agent) who needs to debug a
move choice or extend the engine without re-reading every prior chat.

---

## Files

| File                  | Responsibility                                                                 |
|-----------------------|--------------------------------------------------------------------------------|
| `engine.ts`           | Public entry — spawns the worker, sends search requests, returns chosen move. |
| `worker.ts`           | Worker glue. Owns the TT, keeps it across messages, wipes on variant change.  |
| `search.ts`           | Iterative-deepening alpha-beta, move ordering, qsearch, root candidates.      |
| `evaluate.ts`         | Static evaluation + SEE (`seeMove`, `valueFor`).                              |
| `safety.ts`           | Post-search **root safety gate** that vetoes donations.                       |
| `tt.ts`               | Transposition table (Zobrist-keyed, fixed-size, replace-by-depth).            |
| `zobrist.ts`          | Per-variant Zobrist key generation + incremental updates.                     |
| `playbook.ts`         | Opening-style "what works in this variant" stats sourced from Supabase.       |
| `benchmark.ts`        | Synthetic fixture suite (rated at production budgets).                        |
| `realGameBenchmark.ts`| Regression fixtures captured from real losses.                                |
| `fixtures/`           | JSON snapshots of those real-game positions.                                  |

---

## Architecture

### Search

- **Iterative deepening** from depth 1 up to the per-difficulty cap (or
  time budget — whichever hits first).
- **Alpha-beta** with PVS-style narrow re-search.
- **Transposition table** (`TT`) ~262k entries, salt-partitioned by the
  variant (board size + custom-piece registry hash). Variant change wipes.
- **Quiescence search** for captures / promotions / royal-threat moves to
  avoid horizon-effect blunders.
- **Move ordering:** TT move → captures (MVV/LVA) → killers → history heuristic.
- **Zobrist** keys are incrementally updated and optionally verified each
  ply when the user enables AI debug (`verifyZobrist: true`).

Per-difficulty parameters come from `paramsFor(state, difficulty)` in
`search.ts` (depth cap, time cap, qsearch toggles, etc.).

### Evaluation

`evaluate.ts` returns a centipawn score from the side-to-move's POV. Terms:

- Material (using `valueFor`, which respects `pieceDef.pointsOverride`).
- Mobility (legal-move count, weighted by piece class).
- King / royal safety (attacker count near royal, pawn shield).
- Threats (attacked-but-undefended enemy pieces).
- Piece-square tables for common pieces; generic centralization bonus for
  custom pieces.
- Variant playbook bonus when a move matches a high-winrate pattern from
  `ai_playbook_stats`.

`seeMove(state, move)` — static exchange evaluation; returns net material
gain assuming both sides keep recapturing on the destination square.

### Safety gate (`safety.ts`)

The single most important non-search component. Years of audits showed
that score-shift bonuses inside `evaluate` were not enough to *prevent*
the engine from giving away pieces. The gate is deterministic and runs
**after** the alpha-beta search returns its root candidates.

For each top-N candidate:

1. `ourGain = max(SEE, moveMaterialGain(state, move))` clamped at 0.
2. Apply the move. Compute `opponentBestGain(next)` — the largest material
   the opponent can grab in one reply (captures, archer shots, juggernaut
   tramples, royal captures).
3. `adjusted = score`
   `  - max(0, oppGain - ourGain) * 3`        ← donation penalty
   `  + max(0, ourGain - oppGain) * 0.4`      ← mild reward for trades won
   `  + (givesCheck ? 30 : 0)`
   `  - (oppRoyalThreat ? 50_000 : 0)`        ← hard veto on royal loss
4. Pick the candidate with the highest `adjusted`. If everything is a
   donation, the least-bad one wins.

Donations above 75cp are flagged `rejected` for the debug panel; that does
not prevent selection unless an alternative scores better. **The gate is
intentionally not a deep tactical solver**; it's a floor-of-competence
filter. See `KNOWN_ISSUES.md` for cases where it's still insufficient
(notably oppGain ≈ moverValue donations whose evaluation overweighs
threat/king-pressure terms).

There is also a root-level `isRoyalShuffleAtRoot` penalty (in `search.ts`)
that penalizes repeated quiet royal moves that don't escape check, create
check, capture material, or improve safety. Window is currently 36 plies
and only matches `revisitsPriorSquare` shuffles — long-range shuffle
patterns can still slip through (see Known Issues).

### Playbook

`playbook.ts` consumes a snapshot (passed in via the worker message —
workers have no `window`/`localStorage`) of `ai_playbook_stats` rows from
Supabase. The snapshot is keyed by variant signature + move and gives
prior-win statistics that bias evaluation toward known-good moves in
known positions. The snapshot is set per request and cleared after.

Writes back: `lib/ai-learning.functions.ts` records aggregate outcomes
post-game.

### Benchmarks

Two suites:

- **`benchmark.ts`** — synthetic positions covering known tactical motifs
  (forks, mate-in-2, sacrifices to avoid, etc.). Runs the production
  "hard" budget; pass/fail is "did the engine pick a move in the
  acceptable set".
- **`realGameBenchmark.ts`** — positions extracted from real game losses,
  loaded from `fixtures/real-game-*.json`. These are permanent
  regressions — once a position is in there, the engine must not regress
  on it.

Both suites are scripts; there's no CI runner yet (see Known Issues).
Invoke with `bun run --bun src/game/ai/benchmark.ts` or similar.

---

## Known weaknesses

See `KNOWN_ISSUES.md` for the maintained list. As of the last audit:

1. **ply24 Lich shuffle.** Root royal-shuffle penalty doesn't fire because
   `revisitsPriorSquare` is false for the specific lateral pattern, and
   depth-1 root scores are undifferentiated. Selected move wins purely on
   `oppGain == 0`.
2. **ply29 Dragon donation.** Safety gate's donation coefficient (×3) is
   outweighed by evaluation's threat/king-pressure terms when `oppGain ≈
   moverValue`. A proposed hard-reject when `oppGain >= moverValue * 0.8`
   has not been implemented (intentionally — needs broader regression
   testing first).
3. **Depth-1 starvation under tight budgets** on very large boards / huge
   piece sets. Mitigation in place (always-complete-depth-1 guarantee in
   `search.ts`) but candidate generation can still time-out before move
   ordering ranks all roots.
4. **Custom-piece evaluation is generic.** `evaluate.ts` falls back to a
   centralization + mobility heuristic for `u:*` pieces; no piece-square
   tables. High-value custom pieces can be over- or under-rated.
5. **Playbook is variant-signature-keyed.** Any change to a variant's
   piece set invalidates all prior stats for that variant.

## Open TODOs (from prior forensic work)

- Broaden `isRoyalShuffleAtRoot` to match lateral back-rank shuffles
  regardless of prior-square revisit.
- Add hard-reject in `runSafetyGate` for `oppGain >= moverValue * 0.8`,
  with fallback to smallest-`oppGain` candidate.
- Quiet-threat scan in qsearch (currently captures-only).
- Better TT replacement policy (currently depth-preferred; consider aging).
- Optional: real test harness (vitest) wrapping `benchmark.ts` +
  `realGameBenchmark.ts` so regressions are caught in CI.

## Debugging tips

- Toggle "AI debug" in the UI → enables `verifyZobrist` and surfaces the
  `AiDebugPanel` with per-candidate analysis from `safety.ts`
  (`CandidateAnalysis[]`).
- All candidate scores, gains, and gate decisions are in the worker
  response under `stats.candidates`.
- To reproduce a real-game blunder: capture the position into
  `src/game/ai/fixtures/`, add a case to `realGameBenchmark.ts`, then run
  the suite. The fixtures are the source of truth — do not "fix" the
  engine by tuning until the live game stops failing; the fixture must
  fail first.
