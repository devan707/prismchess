# Custom Piece Builder

A new tool that lets players design 1-square pieces with structured movement, attack, and ability rules, save them privately or publish them, and drop them into sandbox creations from a dedicated piece library.

## 1. Piece data model (extends `PieceDef`)

New optional fields on `PieceDef` (backward compatible — existing builtins ignore them):

- `movement: { steps: MoveStep[] }` — ordered sequence
- `capture?: { mode: "onLanding" | "ranged" | "stampede", steps?: MoveStep[] }`
- `abilities?: AbilityFlag[]`
- `art?: { kind: "emoji-bw", emoji: string, imageUrl?: string }` — emoji is auto-converted to the same black/white style as existing builtin glyphs
- `authorId`, `slug`, `visibility: "private" | "public"` (storage-only fields, stripped from in-game registry)

### `MoveStep`

```ts
type Direction =
  | { kind: "absolute"; dr: number; dc: number }     // e.g. (-1, 0) = N
  | { kind: "relative"; rel: "same" | "perp-cw" | "perp-ccw" | "any-perp" | "any" | "diag45" };
type MoveStep = {
  direction: Direction;
  distance: number | "unlimited";  // squares
  jumps: boolean;                   // ignore blockers on path
  mustCapture?: boolean;            // last-step-only capture for assassin-like
};
```

Movement and capture share `MoveStep`. The first step of any sequence must be absolute (no "previous direction" yet).

### `AbilityFlag`

`"kamikaze" | "healer" | "armor-front" | "armor-back" | "armor-sides" | "immune-prism" | "uses-portal" | "hopper-opposite-color" | "flight"`

(Mirrors existing engine concepts so each flag plugs into known hooks. `flight` takes a `range` param.)

## 2. Builder UI — new route `/pieces/new` (also `/pieces/:slug/edit`)

Sections, top to bottom:

1. **Identity** — name, short description
2. **Icon** — text input ("a coiled snake"). "Generate" calls AI, which returns a single emoji + optional refined name. We render it through the same B&W treatment as `PieceGlyph` (grayscale + neutral ring). Accept / Regenerate (limit 5 regenerations per piece per session, hard cap 15/day per user server-side)
3. **Movement** — repeating "Step" rows. Each row: Direction picker (absolute compass OR relative-to-previous), Distance (1 / 2 / 3 / unlimited), Jumps toggle. "+ Add step" up to 4 steps. Live mini-board preview highlights reachable squares from a center cell.
4. **Capture** — radio: *On landing* (default) / *Ranged* (opens a second step list for the shot path) / *Stampede* (captures every enemy traversed on a move step). Ranged also has Jumps toggle per step.
5. **Special abilities** — checkbox list of `AbilityFlag` values with one-line explanations. v1 has **no custom-ability chat**.
6. **Save bar** — "Save private" / "Publish public" (mirrors sandbox game-save UX). Publishing requires description + accepted icon.

## 3. AI icon flow

Server fn `suggestPieceEmoji({ name, description })` in `src/lib/piece-builder.functions.ts` returns `{ emoji: string, rationale: string }` using Lovable AI Gateway with a tightly constrained prompt ("Reply with a single Unicode emoji that best represents…"). Rendering re-uses the existing emoji-to-B&W treatment already present for emoji glyphs in `PieceGlyph.tsx` — no image generation, no storage bucket needed for v1.

## 4. Engine integration

New file `src/game/pieces/customMovement.ts`:

- `expandMoves(piece, from, board, def)` walks the `MoveStep[]` sequence, tracking last direction for `relative` steps, honoring `jumps`, board bounds, and friendly-block rules. Returns candidate moves.
- Capture mode wiring:
  - `onLanding`: capture iff enemy on destination of final step.
  - `ranged`: walking the capture step list from the piece's square (not moving) to mark capturable squares; emitted as `archerShoot`-style moves (reuse existing `MoveKind`).
  - `stampede`: every enemy on the traversed path is added to `juggTrampled` (reuse existing `juggCharge` plumbing).
- Ability hooks integrate at existing call sites in `src/game/moves.ts` / `rules.ts`:
  - `kamikaze` — remove self after capture in move applier
  - `armor-*` — extend the existing juggernaut/barricade immunity check to read `abilities`
  - `immune-prism` — Prism aura skips piece
  - `hopper-opposite-color` — reuse wizard helper
  - `flight` — reuse dragon teleport with configurable range

`buildRegistry()` in `src/game/pieces.ts` already merges `design.customPieces` into the live registry — custom-built pieces flow through unchanged because the def is embedded in the design (per the user's sharing answer).

## 5. Storage — Lovable Cloud

New table `custom_pieces`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk |
| `author_id` | uuid → auth.users | scoped via RLS |
| `slug` | text unique |
| `name` | text |
| `description` | text |
| `def` | jsonb | full `PieceDef` (movement/capture/abilities/art) |
| `visibility` | text check in ('private','public') |
| `like_count` | int default 0 |
| `play_count` | int default 0 | bumped when a sandbox design including the piece is saved/played |
| `created_at`, `updated_at` | timestamptz |

`piece_likes(piece_id, user_id)` table mirroring `game_likes`, with the same trigger pattern that bumps `like_count`.

RLS:
- SELECT public rows for `anon` + `authenticated`; SELECT own private rows for `authenticated`.
- INSERT/UPDATE/DELETE restricted to `author_id = auth.uid()`.
- Full GRANT block per project convention.

Server fns in `src/lib/piece-builder.functions.ts`:
- `savePiece({ def, visibility })` — upsert by slug
- `listMyPieces()` — private + public authored by me
- `listDiscoveryPieces()` — newest 20 + popular 20 + archive
- `likePiece({ id })`, `unlikePiece({ id })`
- `suggestPieceEmoji(...)` (see §3)

## 6. Sandbox integration

In `src/routes/sandbox.tsx`:

- Right rail "Custom pieces" card becomes a collapsible **Custom Piece Library** with three tabs: *Mine*, *New*, *Popular*. Each entry shows the B&W glyph + name + ❤️ count. "Add to game" pushes the def into `design.customPieces` and makes it available in the palette.
- "+ Create new piece" button → `/pieces/new`, returns to sandbox afterward.
- Because defs are embedded in `design.customPieces`, publishing a community game continues to work with no schema change — the piece travels with the game.

## 7. Discovery page `/pieces`

A simple gallery page (mirrors community games section on `/`) showing New (10) / Popular (10) / Archive. Each card has Like + "Use in sandbox" (deep-links to sandbox with the piece pre-loaded into `design.customPieces` via query param + sessionStorage handoff).

## 8. Out of scope for v1 (explicit)

- Custom-ability AI chat (#7 in your spec) — deferred
- 2-square pieces
- Editing a piece after it's been embedded in a published game (would require ref-by-id model)
- AI-generated raster art (emoji-only icons for v1)

## Files

**New**
- `src/routes/pieces.new.tsx`, `src/routes/pieces.$slug.edit.tsx`, `src/routes/pieces.index.tsx`
- `src/components/pieces/PieceBuilderForm.tsx`
- `src/components/pieces/MovementStepEditor.tsx`
- `src/components/pieces/PieceReachPreview.tsx` (mini-board)
- `src/components/pieces/PieceLibraryPanel.tsx` (sandbox rail)
- `src/lib/piece-builder.functions.ts`
- `src/game/pieces/customMovement.ts`
- `supabase/migrations/*_custom_pieces.sql`

**Edited**
- `src/game/types.ts` (extend `PieceDef`, add `MoveStep`/`AbilityFlag`)
- `src/game/moves.ts`, `src/game/rules.ts` (ability hook points)
- `src/components/chess/PieceGlyph.tsx` (use `def.art.emoji` if present)
- `src/routes/sandbox.tsx` (library panel + deep-link import)
- `src/routes/index.tsx` (link to `/pieces` discovery)
