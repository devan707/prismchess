# Piece Points System + AI Reset (revised)

## 1. Canonical point values

New file `src/game/pieceValue.ts` — single source of truth used by the AI, the graveyard, the description badge, and the builder.

| ID | Piece | Pts |
|---|---|---|
| P | Pawn | 1 |
| S | Shapeshifter | 2 |
| X | Barricade | 1 |
| N | Knight | 3 |
| B | Bishop | 3 |
| H | King's Hand | 4 |
| A | Archer | 5 |
| R | Rook | 5 |
| Z | Assassin | 6 |
| **T** | **Portal** | **6** (kept — re-evaluate after gameplay) |
| M | Necromancer | 7 |
| J | Juggernaut | 7 |
| W | Wizard | 8 |
| Q | Queen | 9 |
| D | Dragon | 11 |
| Y | Prism | 0 |
| G | Regent | 12 (display) |
| L | Lich King | 12 (display) |
| K | King | royal |

Exports: `FIXED_PIECE_POINTS`, `getPiecePoints(id, def?)`, `estimatePiecePoints(def)`, `materialDiff(state, color)`. Royals (K/G/L) and the Prism are excluded from `materialDiff`. Custom user pieces fall back to `estimatePiecePoints`; a new `PieceDef.pointsOverride?: number` always wins.

## 2. AI rewire

`src/game/ai/evaluate.ts` — delete `PIECE_VALUES_PAWNS`; `valueFor` becomes `getPiecePoints(id, def) * 100 * playbookMult`, plus a separate +20000 cp royal bump so loss-of-royal still dominates.

`src/game/ai/playbook.ts` — bump key from `…v2:` to `…v3:`. On first load, copy ONLY `squareDefenseBonuses` from v2 (positional/opening preferences). **Everything else resets** — including `lessons`, `pieceValueMultipliers`, `aggressionBonus`, `cautionMultiplier`, `gamesReviewed` — so outdated balance assumptions don't contaminate the new system. `resetAllPlaybooks` also clears v2 keys.

Effect: Dragon=11, Wizard=8, Necromancer=7 etc. are immediately used in search. Trading a Dragon for a Pawn shows up as −10 in eval and gets pruned hard.

## 3. Material differential UI

New `src/components/chess/MaterialBadge.tsx` — small pill: `+4` (emerald), `−3` (rose), hidden when 0. Computed via `materialDiff(state, humanColor)`. Mounted at the top of `Graveyard.tsx`.

## 4. Worth badge in piece descriptions

New `src/components/pieces/PieceWorthBadge.tsx` — rounded pill: `Worth 8 pts`. Wired into the two places piece descriptions render:
- `src/components/designer/PiecePalette.tsx` (hover description)
- `src/components/pieces/PieceLibraryPanel.tsx` (library rows)

## 5. Builder estimator + manual override

`src/components/pieces/PieceBuilderForm.tsx` — new "Worth" section in the right rail showing live `estimatePiecePoints(previewDef)` and a slider (0.5–14, step 0.5) to override. Override is saved to `PieceDef.pointsOverride`.

## Out of scope
- Conditional values (Necromancer-with-Portal, Wizard-with-Prism).
- Total material score (differential only).
- AI changes beyond the new value table and the reset.
