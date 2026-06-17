import type { GameState, Move, Piece } from "./types";
import { allLegalMoves, applyMoveToBoard, ctxFromState, inCheck } from "./moves";
import { backRankFor, cloneCastling, initialState } from "./board";

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

  // Update castling rights
  const castling = cloneCastling(state.castling);
  const me = state.turn;
  const opp = me === "w" ? "b" : "w";
  const myBack = backRankFor(state.board, me);
  const oppBack = backRankFor(state.board, opp);

  if (move.piece.type === "K") {
    castling[me].king = false;
    castling[me].rooks = {};
  }
  if (move.piece.type === "R" && move.from.r === myBack && castling[me].rooks[move.from.c]) {
    castling[me].rooks[move.from.c] = false;
  }
  if (move.captured && move.captured.type === "R") {
    // captured rook square is `to` (or epCapture, but pawns don't capture pawns as rooks)
    const capSq = move.to;
    if (capSq.r === oppBack && castling[opp].rooks[capSq.c]) {
      castling[opp].rooks[capSq.c] = false;
    }
  }

  // Update en-passant target
  let enPassant: GameState["enPassant"] = null;
  if (move.kind === "double") {
    enPassant = { r: (move.from.r + move.to.r) / 2, c: move.from.c };
  }

  return {
    board,
    turn: opp,
    history: [...state.history, move],
    captured,
    castling,
    enPassant,
  };
}

export function replayMoves(moves: Move[], start: GameState): GameState {
  let s = start;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

export function gameStatus(state: GameState): GameStatus {
  const ctx = ctxFromState(state);
  const moves = allLegalMoves(state.board, state.turn, ctx);
  const check = inCheck(state.board, state.turn);
  if (moves.length === 0) {
    if (check) return { kind: "checkmate", winner: state.turn === "w" ? "b" : "w" };
    return { kind: "stalemate" };
  }
  return { kind: "playing", check };
}

// re-export for convenience
export { initialState };
