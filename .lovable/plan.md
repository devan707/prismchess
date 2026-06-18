## Goal

Make the custom piece builder significantly more expressive — multiple alternative moves per piece, with move-only / capture-only / move-or-capture per option — without trying to recreate every classical chess rule. Defer castling, en-passant, and check-based conditions.

## 1. Data model — "Move Options"

A piece's movement becomes a list of alternatives:

```text
piece
└── options: MoveOption[]
    ├── steps: MoveStep[]                              (existing chain, 1..4 steps)
    ├── kind: "move-or-capture" | "move-only" | "capture-only"
    └── condition: "none" | "from-starting-square"
```

The per-step `captures` boolean from the previous iteration is removed — the option-level `kind` replaces it, which matches the user's "attack only / optional attack" wording and is much cleaner.

Pawn (forward-only, no en-passant in this version) becomes 3 options:

```text
1. step N, dist 1 · move-only       · none
2. step N, dist 2 · move-only       · from-starting-square
3. step NE/NW, dist 1 · capture-only · none   (two options, one per diagonal)
```

Knights, bishops, rooks, queens, archers, assassins all fit comfortably as 1–2 options.

## 2. UI restructure (`PieceBuilderForm`)

Section "3. Movement & melee attack" becomes a list of collapsible **option cards**. Each card has:

- A header with a plain-English summary ("Capture NE, 1 square · from starting square") and a remove button.
- **Kind** radio: "Move or capture" · "Move only" · "Capture only".
- The existing step list (1..4 steps, same direction/distance/jumps controls). The old per-step "Captures on landing" checkbox is removed.
- A **Condition** select: "Always available" · "Only from starting square".
- The existing live preview legend is extended:
  - solid green = move-or-capture
  - hollow green = move-only
  - red ring = capture-only
  - dashed outline = conditional (starting-square)

A "+ Add alternative move" button appends a new option. Min 1, max 6.

## 3. Engine changes (`src/game/moves.ts`)

For custom pieces that have `def.options`, the move generator iterates each option:

- Compile the option's steps with the existing compiler → a `MovementSpec`.
- Generate candidate moves with the existing leap/slide generator, then filter:
  - `move-only` → drop captures.
  - `capture-only` → keep only captures.
  - `move-or-capture` → keep all (current behavior).
- Apply the option's condition as a post-filter:
  - `none` → no filter.
  - `from-starting-square` → require `!piece.hasMoved`.

`Piece.hasMoved: boolean` is added and flipped on the first move of any piece (the existing move-apply path already has the hook for castling/pawn-double tracking, so this is one extra line per move).

Existing built-in pieces (P, K, N, R, B, Q, etc.) keep their hand-coded behavior. Custom pieces opt in by having `options` on their def.

Ranged attack support (existing `def.rangedCapture`) is preserved unchanged.

## 4. Custom piece point estimation + manual override

The existing `estimatePiecePoints` is extended to walk `def.options[]`:

- Sum the reachable-square value of each option, with capture-only options weighted slightly lower (they're situational) and conditional options weighted lower again (only available before the piece moves).
- Manual override toggle in the builder (already present) continues to win.

This keeps the worth badge meaningful as options multiply.

## 5. Special-ability request system

New section "5. Special ability (optional, requires review)" in the builder:

- Free-text textarea (up to 800 chars) describing the ability ("resurrect once like a Necromancer", "swap places with friendly piece", etc.).
- On save, if non-empty, insert a row into a new `piece_ability_requests` table linked to the piece. Status defaults to `pending`.
- The piece is fully saved and playable regardless of request status — the request is a heads-up, not a gate.

Admin side (re-uses existing admin shell):

- A new "Ability requests" tab on `/admin/reports` lists pending requests with piece preview + author + text.
- Admin can mark a request `approved` (with optional internal note) or `declined` (with reason).
- On status change, the request author gets an in-app notification linking back to their piece (re-uses the existing notification + toast plumbing already shipped with the admin tools).
- Every status change writes to `admin_audit_log` via the existing `log_admin_action` function.

## 6. Backwards compatibility

- Existing `custom_pieces` rows store `def.movement` / `def.capture` / `def.rangedCapture` and no `def.options`. The engine treats "no options" exactly as today.
- A small client-side adapter wraps any legacy def into a single `move-or-capture` option with `condition: "none"` when the builder opens it for editing, so the UI is consistent.
- No data migration of existing rows is needed — they keep working unmodified.

## 7. Database migration

One migration adds:

- Table `public.piece_ability_requests`:
  - `piece_id uuid` → `custom_pieces(id)` on delete cascade
  - `author_id uuid` → `auth.users(id)`
  - `request_text text`
  - `status text` (`pending` | `approved` | `declined`, default `pending`)
  - `admin_note text` (nullable)
  - `reviewed_by uuid` (nullable, → `auth.users(id)`)
  - `reviewed_at timestamptz` (nullable)
  - standard `id`, `created_at`, `updated_at`
- GRANTs: `SELECT, INSERT` to `authenticated` (RLS restricts insert to `author_id = auth.uid()` and select to author OR admin/moderator); `UPDATE` to `authenticated` but RLS restricts to admin/moderator via `has_role`; `ALL` to `service_role`.
- RLS policies covering the above.
- `updated_at` trigger via existing `set_updated_at` function.

No new column on `custom_pieces` is needed — the FK lives on the request side.

## 8. Out of scope (deferred)

- Path-and-destination-safe condition (castling-style safety check)
- "Enemy just passed" condition and full en-passant
- Check-based movement restrictions
- Partner-piece moves (castling, swaps, etc.)
- Implementing any of the requested special abilities — review workflow only

## 9. Files touched

- `src/game/customMovement.ts` — add `MoveOption`, `MoveCondition`; reshape `compileMovement` to accept either a step list (legacy) or an option list.
- `src/game/types.ts` — `PieceDef.options?: MoveOption[]`; `Piece.hasMoved?: boolean`.
- `src/game/moves.ts` — option-aware generator with kind + condition post-filters.
- `src/game/pieceValue.ts` — option-aware point estimator.
- `src/components/pieces/PieceBuilderForm.tsx` — option cards, kind radio, condition select, special-ability request box.
- `src/components/pieces/PieceReachPreview.tsx` — per-option marker styles + dashed conditional outline.
- `src/lib/piece-builder.functions.ts` — accept `options` on save; new `requestPieceAbility` server fn.
- `src/lib/admin.functions.ts` — list/approve/decline ability requests, with audit + notification.
- `src/routes/_authenticated/admin.reports.tsx` — new "Ability requests" tab.
- One Supabase migration for `piece_ability_requests` + RLS + GRANTs.
