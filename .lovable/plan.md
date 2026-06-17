
# Design Your Own Chess — Rebuild Plan

The app stops being "5×5/6×6 variants" and becomes a sandbox where every game starts in a **Designer** screen. You pick a board, drop pieces, optionally invent your own piece, then hit Play.

---

## 1. New top-level flow

```text
Home (Designer)  ──▶  Play  ──▶  Result
       ▲                            │
       └──────── New game ──────────┘
```

- `/` — **Designer** (board size + piece placement + custom piece editor)
- `/play` — the actual game (board, history, AI, promotion, etc.)
- "Save as preset" stores the setup in `localStorage` so users can reuse their creations.

---

## 2. Board size picker

Two side-by-side controls, both editing the same state:

- **Quick presets**: chips for 5×5, 6×6, 8×8, 10×10, plus "Rectangular" examples (3×12, 5×8).
- **Custom**: two number inputs (Rows × Cols), each clamped to **3–12**. Live-updates the preview board.

Constraints enforced before "Play":
- Exactly one King per side (a King's Hand does **not** count as a King).
- Both sides have at least one legal move.
- No pawn on its own promotion rank.

---

## 3. Piece placement

**Preset → then customize** flow:

1. User picks a **starting preset** (auto-scaled to current board):
   - *Empty* (drag everything yourself)
   - *Classic-ish*: pawns on rank 2 / n-1, back rank = `R N B [extras] K [extras] B N R` trimmed/padded to width.
   - *All pawns*: pawns row 2 / n-1, lone King centered on back rank.
   - *Mirror standard chess* (only offered when width ≥ 8).
   - *Battle of the Knights* (knights filling back rank, King centered).
2. After applying a preset, the board enters **edit mode**:
   - Palette on the side shows every available piece (standard + custom + user-defined) with counts.
   - **Drag** a piece from the palette onto any square (replaces what's there).
   - **Drag** a piece off the board to remove it.
   - **Right-click** a square to clear it.
   - "Mirror to Black" toggle: edits on White's half are auto-reflected on Black's half.

---

## 4. Built-in custom pieces

| Piece          | Glyph | Movement                                                                                                  | Capture                                          | Notes                                                                                       |
| -------------- | ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| King's Hand    | ♔̃    | Same as King (1 step any direction). **May move into or through check.**                                  | Normal capture.                                  | Capturing it does **not** end the game. Max 1 per side. Cannot be a promotion target.       |
| Barricade      | ▦     | **Off-board reserve.** On your turn you may instead **drop** a barricade onto any empty square.           | Cannot be captured; blocks all movement through. | Each side starts with **2** in reserve (configurable in Designer, 0–4). Drop = full turn.   |
| Archer         | ⤲     | Jumps to a square exactly **2 away** orthogonally or diagonally (8 targets), ignoring pieces in between.  | Captures only on the landing square.             | Cannot land on a friendly piece.                                                            |
| Dragon         | 🐉    | On your turn choose **one**: (a) **teleport** to any empty square, or (b) **attack** one adjacent enemy in place (Dragon stays put). | (b) removes the enemy piece. | Cannot teleport onto an occupied square.                                                    |

All four ship as **standard options** in the palette and the AI knows them.

---

## 5. User-defined custom pieces

A "**+ Create a piece**" button opens a modal:

- **Name** (free text)
- **Icon** — pick from a curated glyph set (chess symbols, unicode shapes, emoji), with a color tint
- **Movement pattern** — choose one or combine:
  - Slider directions: rook-lines / bishop-lines / both, with **max range** (1–N or unlimited)
  - Leap offsets: presets (knight, archer, dabbaba, alfil) + a small grid where the user clicks offset squares relative to the piece
  - "Can jump over pieces" toggle (affects sliders only — leaps always jump)
- **Capture pattern** — "Same as movement" (default) OR a separate set of offsets/sliders (lets you build pawn-like asymmetry)
- **Entry rule** — when does this piece appear?
  - *Placed at setup* (default — appears in Designer palette)
  - *Promotion target* (appears in promotion dialog; choose which pieces promote into it — default: pawns)
  - *Reserve drop* (like Barricade — set starting count 0–5)
- **Royal?** — toggle. If on, the piece is treated like a King for check/checkmate.

Custom pieces persist in `localStorage` and appear in the palette and promotion dialog.

---

## 6. Engine changes

`src/game/types.ts`
- `Board` becomes `(Piece|null)[][]` with independent `rows` × `cols`.
- New `PieceDef` registry: each piece (built-in or user) has an id, glyph, movement spec, capture spec, royal flag, special kind (`none | kingsHand | barricade | dragon | archer | reserve-drop`).
- `GameState` gains: `reserves: { w: Record<PieceId, number>; b: Record<PieceId, number> }`, `dimensions: { rows, cols }`, `pieceRegistry`.
- `Move` gains `kind: "drop" | "dragon-attack" | ...` and a `dropPiece?: PieceId`.

`src/game/moves.ts`
- Move generation is now data-driven from each piece's `MovementSpec` (sliders + leaps + jump flag). Standard pieces are expressed in the same format so there's one code path.
- King's Hand: special-cased to skip the "filter moves that leave own king in check" only for itself, and to allow moving through attacked squares.
- Barricade: never generates moves; a "drop reserve" move generator emits a drop-move per empty square if `reserves[color][barricade] > 0`.
- Dragon: emits teleport moves (every empty square) **and** adjacent-attack moves (target stays empty, enemy removed but Dragon doesn't move). The two kinds are tagged so the UI can label them.
- Archer: leap-only with `canJump: true`, captures on landing.

`src/game/rules.ts`
- Game ends when **all royal pieces** of a color are captured (supports King's Hand correctly — only the real King counts).
- Stalemate uses the same legal-move generator, now including drops.
- Castling/en passant remain, gated on classic Rook+King back-rank pattern (auto-detected from placement).

`src/game/ai/*`
- Evaluation table extended; defaults: King 20000, Queen 900, Rook 500, Bishop 330, Knight 320, Pawn 100, Archer 350, Dragon 850, King's Hand 250, Barricade 50 (positional).
- For user-defined pieces, value is **computed** from movement spec: `sum(reachable squares from center on empty board) × weight + (royal ? 5000 : 0)`.
- Move-ordering picks up drops and Dragon attacks naturally.

---

## 7. UI components

New:
- `src/components/designer/BoardSizePicker.tsx`
- `src/components/designer/PresetPicker.tsx`
- `src/components/designer/PiecePalette.tsx` (drag source)
- `src/components/designer/DesignerBoard.tsx` (drop target, reuses cell rendering)
- `src/components/designer/CustomPieceModal.tsx`
- `src/components/designer/ReserveCounters.tsx` (barricade/drop counts during play)

Updated:
- `Board.tsx` — supports non-square dimensions, renders reserves on the side, shows Dragon's two action choices on click, allows clicking an empty square when a reserve drop is selected.
- `PromotionDialog.tsx` — pulls options from `pieceRegistry` filtered by "promotion target" flag.
- `PieceGlyph.tsx` — looks up glyph + color tint from registry instead of hardcoded map.
- `MoveHistory.tsx` — adds notation for drops (`B@d4`), Dragon attacks (`Dxe5*`), teleports (`D~e5`).

Routes:
- `src/routes/index.tsx` → Designer.
- `src/routes/play.tsx` → Game (receives the design via router state / `localStorage` slot).

---

## 8. Out of scope (will revisit)

- Online multiplayer.
- Animated piece icon designer (we use static glyphs/emoji, not drawn art).
- Saving/sharing designs by URL.
- Balance tester rewrite for arbitrary registries (kept for built-in pieces only in v1).

---

## 9. Build order (single PR, but staged commits)

1. Types + registry + non-square board plumbing.
2. Data-driven move generator; port standard pieces.
3. Designer page (size picker, presets, drag-and-drop palette).
4. Built-in custom pieces (King's Hand, Barricade, Archer, Dragon) end-to-end.
5. User-defined custom piece modal + registry persistence.
6. AI updates + evaluation auto-scoring.
7. Polish: notation, promotion dialog, reserves UI, validation gates before Play.

Estimated: large change. I'll ship it in one go and verify with a typecheck + a play-through of a Classic 8×8 and a custom 4×10 with a Dragon + 2 Barricades to make sure both standard and custom paths work.

---

Ready to build on your "go". If you want me to drop any of the new pieces or trim phase 7 to keep it smaller, say the word before I start.
