Plan to make the AI both safer AND more aggressive, with no wasted moves.

1. Real threat / defense map
- Build a per-square attack/defense analyzer using the existing move generator (covers archers, dragons, juggernauts, knights, custom pieces, ranged shots).
- For each piece, record: attackers, defenders, cheapest attacker/defender, hanging? winning capture available?
- Replace the simple "isSquareAttacked" booleans in hanging/threat terms with a static-exchange-style swap-off score so trades are evaluated by actual material outcome, not just "attacked = bad".

2. Blunder prevention (defense)
- Strongly penalize moves that leave the moving piece on a square it loses material on.
- Strongly penalize moves that abandon defense of another friendly piece, leaving it hanging.
- Special heavy penalty for hanging Queen / Dragon / Wizard / Necromancer / royals.
- Root-level filter: never play a move whose static-exchange result is a clear material loss unless the search proves real compensation (mate threat, winning recapture, king attack pressure).

3. Aggression: threats, checks, captures, mate
- Reward moves that create new threats: pieces newly attacked by us, especially high-value and undefended ones.
- Reward double attacks / forks / pins (a single move creating ≥2 winning threats).
- Reward safe checks and check sequences that reduce king mobility.
- Reward king-zone pressure: multiple attackers near enemy royal, attackers worth less than defenders.
- Boost capture-and-recapture sequences that come out ahead (SEE > 0).
- In quiescence search, already includes captures/promos/check — keep that and extend ordering so winning captures and safe checks are tried first.

4. Tempo awareness — every move must do something
- Each candidate move gets a "purpose score":
  - captures material (net positive SEE)
  - delivers check or creates a real threat
  - improves a piece's mobility / attack count meaningfully
  - advances development (opening) or king attack (mid/endgame)
  - defends a currently hanging or threatened friendly
  - executes a planned multi-move attack (piece moving toward enemy royal zone, supporting attackers, opening lines)
- Moves that do none of the above get a strong "wasted tempo" penalty.
- Strengthen the existing anti-shuffle term: any back-and-forth (same piece returning to a recent square without a captured piece, check, or new threat) is heavily penalized.

5. Planning continuity (no random reshuffling)
- Track lightweight "plan state" inside the evaluator using existing history:
  - which side of the board our heavy pieces are clustering on
  - whether we have an attack building near the enemy royal
  - reward moves that continue an existing buildup (more attackers joining the same zone)
  - penalize moves that abandon a built-up attack for no gain
- Reward coordinated development: a piece's value is partly its synergy with friendly pieces around it.

6. Search & move-ordering improvements
- Make medium and hard always use the worker search (not easyMove fallback at any board size beyond a hard timeout).
- Move-ordering priority: TT move → winning captures (SEE > 0) → safe checks → threats → killers → history → quiet.
- Reduce root-tie randomness on medium/hard so the engine commits to the most purposeful move.
- Tune difficulty budgets so medium feels solid and hard feels genuinely challenging (longer think on important positions, still responsive on simple ones).

7. Validation
- Add scripted engine tests for these positions:
  - AI must not hang queen/dragon to a defended attacker
  - AI must take a free hanging piece
  - AI must recapture when the capture is winning
  - AI prefers a safe check / threat over a quiet move when both score equally
  - AI does not shuffle the same piece across consecutive turns without purpose
  - AI joins attackers into the enemy king zone when buildup exists

Technical details
- Files to edit: `src/game/ai/evaluate.ts`, `src/game/ai/search.ts`, `src/game/ai/index.ts`, possibly small helpers in `src/game/moves.ts` for cheap attack-map reuse.
- Add a shared `tacticalMap(state)` helper memoized per evaluation so attack/defense isn't recomputed dozens of times per node.
- Keep everything in the existing worker — no external AI service, no new dependencies.
- Behavior on Easy stays beginner-friendly; Medium and Hard get the full upgrade.