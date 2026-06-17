# Mini Chess 5x5

A complete React + TypeScript browser game implementing a 5x5 chess variant (King, Bishop, Knight, Pawn only), with an AI opponent, polished UI, and a background AI-vs-AI simulator to report White/Black win rates for balance testing.

## Game rules (enforced in engine)

- 5x5 board. Starting position:
  ```text
  Row 4 (Black back):  n b k b n
  Row 3 (Black pawns): p p p p p
  Row 2:               . . . . .
  Row 1 (White pawns): P P P P P
  Row 0 (White back):  N B K B N
  ```
- Movement: standard chess for King, Bishop, Knight. Pawns move/capture as in chess but: no two-square first move, no en passant. Promotion on reaching the last rank — to Knight or Bishop only (player choice via modal; AI picks Knight by default with a small heuristic).
- No Queen, Rook, castling, en passant, repetition draw, or 50-move rule.
- Legal-move generation filters moves that leave own king in check.
- Detect check, checkmate, stalemate.

## Architecture

```text
src/
  game/
    types.ts            # Piece, Color, Square, Move, GameState
    board.ts            # initial position, board helpers, FEN-like serialization
    moves.ts            # pseudo-legal + legal move generation per piece
    rules.ts            # check / checkmate / stalemate, applyMove, undo stack
    ai/
      random.ts         # Easy: random with capture preference
      minimax.ts        # Medium: plain minimax (depth ~3)
      alphabeta.ts      # Hard: alpha-beta (depth ~5) + move ordering
      evaluate.ts       # material + simple positional (king safety, center, pawn advance)
      index.ts          # chooseMove(state, difficulty)
    simulate.ts         # AI-vs-AI runner; returns {white, black, draws}
  components/
    Board.tsx           # 5x5 grid, drag-and-drop + click-to-move, highlights
    Square.tsx
    Piece.tsx           # SVG pieces
    Sidebar.tsx         # status, controls, move history, captured pieces
    PromotionDialog.tsx
    NewGameDialog.tsx   # difficulty + side selection
    BalanceTester.tsx   # runs N games in a Web Worker, shows win rates
  workers/
    sim.worker.ts       # runs AI-vs-AI matches off the main thread
  hooks/
    useGame.ts          # game state, move handlers, AI turn effect, undo
    useSounds.ts        # move/capture/check/mate sfx (WebAudio, no asset deps)
  routes/
    index.tsx           # main page
  styles.css            # tokens for board light/dark squares, highlights, accents
```

Engine is pure functions over an immutable `GameState`, so it's trivial to drop into a Worker for simulation and to extend with new piece types or larger boards (board size is a constant in `board.ts`).

## UI

- Custom design system in `src/styles.css` (not generic AI purple): warm parchment light squares + deep slate dark squares, single bold accent for highlights and check pulse. Distinctive serif display font for the title, clean sans for UI (loaded via `<link>` in `__root.tsx`).
- Responsive layout: board centered, sidebar on the right (desktop) / below (mobile).
- Interactions: drag-and-drop (HTML5 DnD with pointer fallback) + tap/click-to-move. Legal-move dots, last-move highlight, red glow on king in check.
- Sidebar shows: side-to-move status (Check / Checkmate / Stalemate badges), captured pieces per color, move history in algebraic-ish notation (`Nb1-c3`, `Pxd2`), buttons: New Game, Undo, Flip Board, Difficulty selector.
- Sounds generated via WebAudio oscillators (no asset dependency): move click, capture thud, check chime, checkmate fanfare. Mute toggle.

## AI

- Easy: enumerate legal moves, prefer captures (highest victim value), otherwise random.
- Medium: minimax depth 3 with `evaluate` (material values K=∞, N=3, B=3, P=1; small bonuses for center control, king mobility, pawn advancement).
- Hard: alpha-beta depth 5 with move ordering (captures first, then checks). Iterative deepening with a soft time cap (~800ms) so it stays responsive.
- AI plays Black by default; New Game dialog lets the user pick side and difficulty.

## Balance tester (the user's add-on)

- `BalanceTester` panel in the sidebar with inputs: number of games (default 100), White difficulty, Black difficulty.
- Runs matches inside `sim.worker.ts` so the UI stays interactive; streams progress and final tally `{whiteWins, blackWins, draws, avgPlies}`.
- Adjudicates draws as stalemate, or after a configurable ply cap (default 200) with material-based tiebreak counted as draw.
- Results render as a progress bar + percentages so imbalance is obvious at a glance.

## Verification

- Unit-style sanity checks in `game/__tests__` for: initial position, knight/bishop/king move sets, pawn promotion, check detection, mate-in-1 fixture, stalemate fixture.
- Manual: play a few moves at each difficulty, run a 50-game Easy-vs-Easy and Hard-vs-Hard simulation to confirm the tester works and to get an initial balance read.

## Out of scope

- Multiplayer / online play, accounts, persistence beyond in-memory game state, opening books, endgame tablebases.
