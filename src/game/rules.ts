import type { GameState, Move, Piece } from "./types";
import { allLegalMoves, applyMoveToBoard, inCheck } from "./moves";

export type GameStatus =
  | { kind: "playing"; check: boolean }
  | { kind: "checkmate"; winner: "w" | "b" }
  | { kind: "stalemate" };

export function applyMove(state: GameState, move: Move): GameState {
  const board = applyMoveToBoard(state.board, move);
  const captured = { w: [...state.captured.w], b: [...state.captured.b] };
  if (move.captured) {
    captured[state.turn].push(move.captured as Piece);
  }
  return {
    board,
    turn: state.turn === "w" ? "b" : "w",
    history: [...state.history, move],
    captured,
  };
}

export function undoMove(state: GameState): GameState | null {
  if (state.history.length === 0) return null;
  // Replay from initial; simple and safe given short games.
  // Caller passes the existing initial via state? Instead we re-derive:
  // Recompute by replaying all but last move from initial.
  // To avoid circular import, do replay externally — but cheaper here:
  const moves = state.history.slice(0, -1);
  // Lazy import to dodge cycles
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initialState } = require("./board") as typeof import("./board");
  let s: GameState = initialState();
  for (const m of moves) s = applyMove(s, m);
  return s;
}

export function gameStatus(state: GameState): GameStatus {
  const moves = allLegalMoves(state.board, state.turn);
  const check = inCheck(state.board, state.turn);
  if (moves.length === 0) {
    if (check) return { kind: "checkmate", winner: state.turn === "w" ? "b" : "w" };
    return { kind: "stalemate" };
  }
  return { kind: "playing", check };
}
