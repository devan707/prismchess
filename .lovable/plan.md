
## What's actually wrong with the AI

While exploring `src/game/ai/*`, I found four problems that together explain why "hard" plays like a beginner. The first one is a real bug, not just tuning.

1. **The playbook is silently ignored during search.** `evaluate()` calls `loadPlaybook()`, which reads from `window.localStorage`. But the search runs inside a Web Worker (`src/game/ai/worker.ts`) where `window` doesn't exist, so `loadPlaybook()` short-circuits to `DEFAULT_PLAYBOOK`. Every "lesson" we ever stored — caution multiplier, piece-value tweaks, square-defense bonuses — has been having **zero effect on actual moves**. The post-game analysis was writing to a memory the engine never read.

2. **The search itself is weak.** `search.ts` is plain negamax + alpha-beta + a 4-ply quiescence. No transposition table, no killer/history heuristics, no SEE-based ordering, no check extensions, no null-move pruning. On hard with a 3 s budget it typically only finishes depth 3–4, which is why it misses 2-move tactics ("if I take, you take back, and I'm up a piece").

3. **It doesn't see threats against its own pieces well.** `hangingTerm` only penalises pieces worth ≥ a knight, so hung pawns/archers/barricades are invisible. And because qsearch only extends captures, a quiet move by the opponent that *creates* a threat isn't refuted until the threat is actually executed — by then it's too late in the search tree.

4. **One global memory across every variant.** Lessons learned playing Menagerie get applied to Grand Menagerie, sandbox creations, custom boards, etc. That's noisy and counter-productive.

## Plan

### A. Per-variant memory (with a reset)

- Change `src/game/ai/playbook.ts` to key off the current variant: `menagerie.ai.playbook.v2:<variantKey>`. Public API stays the same but `loadPlaybook()` / `savePlaybook()` / `resetPlaybook()` take an optional `variantKey` (falling back to `loadCurrentMeta().id`).
- Migrate the existing v1 blob once into the slot for whatever variant is currently loaded, so users don't lose progress on their main game.
- Pipe `variantKey` through the worker message so search-side `evaluate()` can pass it to `loadPlaybook()`.
- Add a "Reset AI memory for this variant" action in the post-game analysis panel and on the variant page (small button, with confirm). A global "Reset all AI memory" lives in `more.tsx`.

### B. Fix the worker/playbook plumbing

- `WorkerRequest` gains `playbook: Playbook` (serialized snapshot, taken on the main thread at request time). Worker stashes it in a module-level `currentPlaybook` and `evaluate.ts` reads from there instead of calling `loadPlaybook()`. This makes the playbook actually influence search.
- `loadPlaybook()` keeps working on the main thread (UI/menus). The worker path becomes pure "use the snapshot you were handed."

### C. Stronger search (`src/game/ai/search.ts`)

Drop-in upgrades, in order of bang-for-buck:

1. **Transposition table** keyed by a Zobrist-style 64-bit hash of `(board, turn, reserves, pendingHand)`. Stores `{depth, score, flag: exact|lower|upper, bestMove}`. Lets us re-order siblings with the previous best and short-circuit re-searched positions.
2. **Killer moves + history heuristic** for non-capture ordering — the standard pair that makes alpha-beta actually cut.
3. **SEE (Static Exchange Evaluation)** for capture ordering, replacing pure MVV-LVA so the engine stops "winning" a pawn by hanging a wizard.
4. **Check extensions**: when the move gives check, search one ply deeper. This alone fixes a lot of "missed mate / missed fork" complaints.
5. **Null-move pruning** at depth ≥ 3, disabled when the side to move is in check or has only royal-class material on the board (to avoid zugzwang issues with our weird pieces).
6. **Deeper qsearch** (8 plies) and include `juggCharge`-with-trample and shape-shift captures as loud moves.
7. **Bigger time budgets**: easy 250 ms / depth 3, medium 1.5 s / depth 5, hard 6 s / depth 8 — and raise the worker hard-timeout in `useGame.ts` to 30 s. Big/heavy-branching boards still scale down with the existing penalties, just from a higher base.

### D. Better evaluation

- `hangingTerm` covers every piece (not just ≥ knight) and uses the new SEE function so the score reflects "if they take, I retake, …" instead of a flat 90 % of value.
- Add a small **threat term**: for each enemy piece the side to move could capture next ply with a winning SEE, add a fraction of its value. This is what makes the AI *take* the free piece you offered instead of doing something else.
- Add a small **king-safety term** for normal kings (count enemy attackers within 2 squares of the royal piece, weighted by attacker value). Royals like Regent/Lich King already have their own bonus pathway; this adds the missing one for plain `K`.

### E. Wire-up + UX

- `useGame.ts`: send the current playbook snapshot in every request; raise `hardTimeoutMs`.
- `engine.ts`: include `playbook` in the postMessage payload.
- `AiThinkingIndicator`: unchanged, but it'll now sit longer on hard — that's expected.
- Post-game analysis: the "lesson saved" toast becomes "lesson saved for <variant name>".

## Files I expect to touch

- `src/game/ai/playbook.ts` — per-variant keys, v1→v2 migration, snapshot helper.
- `src/game/ai/worker.ts` — receive + stash playbook, pass to search.
- `src/game/ai/search.ts` — TT, killers/history, SEE, check extensions, null-move, deeper qsearch, new time/depth table.
- `src/game/ai/evaluate.ts` — playbook from snapshot, hanging/threat/king-safety upgrades.
- `src/game/ai/engine.ts` — include playbook in request.
- `src/hooks/useGame.ts` — load playbook for current variant, pass it, raise timeout.
- `src/lib/analyze-game.functions.ts` / post-game analysis UI — save lessons against the current variant key, add reset button.
- `src/routes/more.tsx` — global reset.

## Out of scope (worth flagging)

- I'm **not** replacing this with a Stockfish-style NNUE or a remote engine. For custom variants with pieces like Wizard/Necromancer/Juggernaut/Prism, off-the-shelf engines don't apply; the right move is to make our own search competent, which is what the plan above does.
- I'm not changing piece values or any rules — only the engine and its memory.

After this lands, hard mode should reliably see 2-move tactics (recaptures, simple forks, hanging-piece refutations), respond to threats by moving/defending/counter-attacking, and stop blundering pieces into obviously-defended squares.
