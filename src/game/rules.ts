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

export function replayMoves(moves: Move[], start: GameState): GameState {
  let s = start;
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
