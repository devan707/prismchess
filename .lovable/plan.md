# Plan — The Prism

A new **board fixture** (not really a piece) that occupies **2 adjacent cells** in a line and flips the color of any piece that touches its aura. Featured on the Grand Menagerie next to each Portal, and available in the custom designer.

## Rules summary

- 2-cell long fixture (2 squares in a row/column, like a stretched domino, distinct from the Juggernaut's side-by-side pair).
- Indestructible — cannot be captured, moved, swapped, trampled, or resurrected. Blocks movement like a Barricade. Cannot be targeted by Portal swaps or Dragon strikes.
- **Aura** = the union of all 8 king-neighbors of each of its 2 cells (≈10 squares around the prism, including diagonals).
- **Flip triggers**:
  1. On a piece's move, if it **enters or passes through** any aura cell during that move (sliders included; leapers only if they land in aura), it flips to the opposite color at the end of that move.
  2. At the **end of every turn**, any piece (either color) currently sitting in the aura that did NOT just move out flips again. This is the "stickiness" rule — to keep a converted piece, you must walk it out of the aura on your next turn.
- **King immunity**: Royal pieces never flip. Their moves through the aura are unaffected.
- Pieces flipped retain their type, history (raisedOnce, etc.) — only `color` changes. Pawn promotion direction follows the new color from then on.
- The Portal interaction the user described emerges naturally: swap a pawn onto the prism-adjacent cell where the Portal sat → pawn flips to enemy on next end-of-turn → Portal is now safely on your side of the board.

## Visual

A rainbow-tinted long triangular prism glyph spanning its 2 cells (rendered similar to the Juggernaut's double-cell glyph, but oriented along the long axis). A faint rainbow halo on aura squares when the prism is selected/hovered in the designer or during play (purely cosmetic hint).

## Files to change

### New piece definition
- `src/game/types.ts` — extend the `special` union with `"prism"`.
- `src/game/pieces.ts` — add `Y` (Prism) to `PIECE_LIBRARY` and `BUILTIN_CUSTOM_IDS`. Marked `immobile: true`, `special: "prism"`, `builtinCustom: true`, with a description matching the rules above.

### Engine
- `src/game/moves.ts`
  - Treat Prism cells as impassable (like Barricade — extend `isBarricade` or add a sibling `isFixture` check so sliders stop before them and leapers cannot land on them).
  - Block Portal swaps, Dragon strikes, Juggernaut trample, Necromancer raise targeting Prism cells.
  - After applying a move (in whatever function commits a move to `GameState`), run a **`applyPrismEffects(state, justMovedPiece, path)`** pass:
    1. Compute the union aura of every Prism on the board.
    2. For the moving piece: if any square on its travel path (from→to inclusive for sliders; just `to` for leapers and drops) intersects the aura, flip its color (skip if royal).
    3. End-of-turn sweep: for every non-royal piece currently on an aura square that did NOT just vacate, flip its color.
  - The path-tracing helper already exists implicitly inside slider generation; add a small `pathSquares(from, to)` util for orthogonal/diagonal lines, and `[to]` for everything else.
- `src/game/board.ts` — helpers to detect prism cells / aura.
- `src/game/rules.ts` — make sure check/checkmate detection runs **after** flips are applied (a flipped piece may suddenly be giving check, or a previously-checking piece may now be friendly).

### AI
- `src/game/ai/evaluate.ts` — add awareness:
  - Treat aura squares as risky for own pieces (small penalty per non-royal friendly piece adjacent to a Prism that didn't just move).
  - Reward moves that flip an enemy piece (delta = value of that piece × 2, since they lose it and we gain it).
  - Prism cells contribute zero material and are never capture targets.
- `src/game/ai/index.ts` — no structural change; the search already iterates legal moves, so flips happen via `applyMove`.

### Designer & presets
- `src/game/design.ts`
  - `grand-menagerie` preset: replace the two cells the user described (the squares next to each Portal on White's side; mirrored for Black) with Prism placements. Each Prism = 2 placements with `pieceId: "Y"` on adjacent cells along the column the Portal sits on (so the Prism runs lengthwise toward the Portal).
  - Add a `placePrismPair(...)` helper analogous to `placeJuggernautPair` so the designer can drop a Prism and it auto-fills the partner cell along the long axis.
  - `validateDesign`: a Prism cell must have a partner Prism cell in line.
- `src/components/designer/PiecePalette.tsx` — surface the Prism in the custom-pieces tray with its rainbow glyph.
- `src/components/designer/DesignerBoard.tsx` — handle the 2-cell drop using the new helper.

### Rendering
- `src/components/chess/PieceGlyph.tsx` — render the Prism with a rainbow gradient triangular-prism emoji or SVG; both cells share one continuous glyph (like `JuggernautGlyph`).
- New `src/components/chess/PrismGlyph.tsx` — SVG long triangular prism with a horizontal rainbow gradient (red→orange→yellow→green→blue→indigo→violet) spanning the two cells. Color-neutral (no side ring) since it belongs to neither player.
- `src/components/chess/Board.tsx` — when a Prism cell is hovered/selected, paint a faint rainbow tint on aura squares (cosmetic only).

### UI & content
- `src/components/chess/MoveDiagram.tsx` — add a Prism diagram with two friendly pawns and an enemy pawn, showing one of your pawns walking into the aura and turning enemy-colored on the next turn. Use the same "scenario" format as Assassin and Archer.
- `src/routes/sandbox.tsx` — add the Prism card and full description.
- `src/lib/api/analyze-game.functions.ts` — extend the AI rules prompt with the Prism's behavior so post-game analysis explains flips correctly.
- `src/lib/chess-names.ts` — add an entry so move notation can refer to "Prism" when relevant (e.g. "flipped by Prism").

### Move history & SFX
- `src/components/chess/MoveHistory.tsx` — append a small "↔ flipped by Prism" annotation when a move triggered a flip.
- Optional: a soft chime SFX on flip via `src/lib/sfx.ts` (re-use existing capture/promotion sound infra).

## Out of scope

- Multiplayer schema changes — flips are deterministic from the move, so existing `match_moves` replay still works without new columns.
- Tutorials — not requested; can be added later.

## Open follow-ups (not blocking)

- Should two adjacent Prisms with overlapping auras flip a piece twice (net no-op) in a single end-of-turn? Default: each flip is independent and applied once per Prism aura the piece is in, so overlap = even flips = no change. Documented in the description.
- Should Shapeshifter Pawns / Undead retain their owner-history after a flip? Default: yes — only `color` changes, all other flags persist.
