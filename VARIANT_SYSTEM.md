# Variant System

How Prism Chess represents variants, custom pieces, and movement.

All types live in `src/game/types.ts`. The engine is pure TypeScript and
has no React or Supabase dependencies.

---

## Designs

A **Design** is a complete variant specification:

```ts
interface Design {
  rows: number;
  cols: number;
  placements: Placement[];            // starting board
  reserves: { w: Reserves; b: Reserves }; // drop counts per piece id, per side
  customPieces: PieceDef[];           // user-defined pieces in this design
}
```

`initialStateFromDesign(design)` produces a `GameState` ready for play.
Built-in designs (standard chess, Menagerie, etc.) live in `src/game/library.ts`.

---

## Pieces

A piece has a stable string id:

- Built-ins: `K`, `Q`, `R`, `B`, `N`, `P`, `H` (King's Hand), `A` (Archer),
  `D` (Dragon), `X` (Barricade).
- User-defined: `u:<slug>`.

A `PieceDef` describes how it looks, moves, and what's special about it:

```ts
interface PieceDef {
  id: PieceId;
  name: string;
  glyph: string;             // letter/unicode/emoji
  emoji?: boolean;
  imageUrl?: string;         // overrides glyph if present (Supabase storage)
  movement?: MovementSpec;   // legacy single pattern
  capture?: MovementSpec;    // optional separate capture pattern
  options?: MoveOption[];    // v2 DSL — preferred when present
  rangedCapture?: { spec; timing };  // archer-style remote captures
  special?: "pawn" | "dragon" | "portal" | "necromancer" | "shapeshifter"
          | "juggernaut" | "assassin" | "wizard" | "prism" | "archer"
          | "shadowKnight" | "twinTower";
  royal?: boolean;           // loss of all royals = game over for that side
  immobile?: boolean;        // barricade-style
  canBePromoted?: boolean;
  defaultReserve?: number;
  pointsOverride?: number;   // manual material value (pawn units)
  movementSummary?: string;  // LLM-generated, for UI
  builtinCustom?: boolean;
}
```

### Movement (legacy `MovementSpec`)

```ts
interface MovementSpec {
  slides?: SlideDir[];   // { dr, dc, max? } — ride along a vector
  leaps?:  Offset[];     // { dr, dc } — knight-style jumps
  slidersJump?: boolean; // sliders ignore blockers (rare)
}
```

If `capture` is unset, `movement` is used for both quiet moves and captures.

### Movement v2 (`options: MoveOption[]`)

A small DSL in `src/game/customMovement.ts` lets the piece builder express
conditional behavior: "this option is a leap of (1,2) that only captures",
"this option is a slide along (1,0) up to 3 squares that can't capture",
etc. When `options` is present it takes precedence over `movement`/`capture`
in the generic engine path.

### Ranged capture

`rangedCapture` lets a piece capture without moving (Archer). `timing` is
currently only `"replace"` (instead of a normal move). `"before"`/`"after"`
are reserved for future multi-action turns.

### Specials (hand-coded behaviors)

Some pieces have logic too irregular to express in the DSL. The `special`
tag tells `src/game/moves.ts` to dispatch to a dedicated generator/applier:

| `special`       | Built-in id | Behavior                                                         |
|-----------------|-------------|------------------------------------------------------------------|
| `pawn`          | `P`         | Double-step, en passant, promotion via `canBePromoted` set       |
| `dragon`        | `D`         | Powerful slider with breath-attack semantics                     |
| `portal`        | —           | Swap two friendly pieces                                         |
| `necromancer`   | —           | Spirit view + raise corpse (`corpses[]` in `GameState`)          |
| `shapeshifter`  | —           | Transforms into captured piece                                   |
| `juggernaut`    | —           | 2x1 piece, tramples on charge; supports juggernaut-castle        |
| `assassin`      | —           | Stealth capture mechanics                                        |
| `wizard`        | —           | Teleport / ranged effects                                        |
| `prism`         | —           | Light-reflection movement                                        |
| `archer`        | `A`         | Ranged capture, see above                                        |
| `shadowKnight`  | —           | Linked-piece partner moves (`partnerFrom`/`partnerTo`)           |
| `twinTower`     | —           | Linked pair                                                      |

Each special's exact rules are documented next to its implementation in
`src/game/moves.ts`. When adding a new special, add it to the `MoveKind`
union in `types.ts` and to the dispatch in `moves.ts`.

---

## Royals & game end

`royal: true` marks a piece whose loss ends the game. A side loses the
moment it has zero royal pieces remaining (`gameStatus()` checks this
first, *before* checkmate, because some moves — drops in particular —
can bypass normal check rules).

- **Checkmate** — current side has no legal moves AND is in check.
- **Stalemate** — no legal moves, not in check.
- **Royal loss** — `findRoyals(state, color).length === 0`.

---

## Piece values

`src/game/pieceValue.ts` provides material values used by the evaluator
and by UI badges (`PieceWorthBadge`). Resolution order:

1. `pieceDef.pointsOverride` if set.
2. Fixed table for known built-ins (P=100, N=320, B=330, R=500, Q=900, …).
3. Estimator: combines slide range, leap count, ranged capture, special
   flags, and a rough "attack surface" heuristic.

Royals are not in the table — their effective value is the loss-of-game
penalty (handled directly in the safety gate as a 50k veto).

---

## Game state

```ts
interface GameState {
  board: Board;                          // (Piece | null)[rows][cols]
  turn: Color;                           // "w" | "b"
  history: Move[];
  captured: { w: Piece[]; b: Piece[] };
  corpses: Corpse[];                     // for necromancer
  reserves: { w: Reserves; b: Reserves };// drop pools
  enPassant: Square | null;
  registry: Record<PieceId, PieceDef>;   // snapshotted at game start
  rows: number; cols: number;
  pendingHand?: Square | null;           // King's Hand mid-turn state
  startingPieceIds?: PieceId[];          // pawn promotion target whitelist
}
```

The `registry` is snapshotted into the game state at creation time so
later edits to a custom piece definition can't retroactively change an
in-progress or replayed game.

---

## Persistence

- **Designs** are serialized as JSON in `published_games.design_json` and
  similar columns.
- **Custom pieces** live in `custom_pieces`, with image references to the
  private `piece-images` bucket.
- **Solo games** are stored in `solo_games` with `moves` as a JSON array;
  replay uses `replayMoves(moves, initialStateFromDesign(design))`.
- **Multiplayer matches** keep moves in `match_moves` and chat in
  `match_chat_messages`; live sync via Supabase Realtime.

When adding a new piece-level field, add it to `PieceDef` in `types.ts`,
to the piece builder UI (`src/components/pieces/PieceBuilderForm.tsx`),
and to the relevant `*.functions.ts` Zod schema. Existing rows must read
the field as optional.
