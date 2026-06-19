import type { Design, GameState, Move } from "./types";
import { emptyBoard, findRoyals } from "./board";
import { allLegalMoves, applyMoveToState, inCheck } from "./moves";
import { buildRegistry } from "./pieces";

export type GameStatus =
  | { kind: "playing"; check: boolean }
  | { kind: "checkmate"; winner: "w" | "b" }
  | { kind: "stalemate" }
  | { kind: "royal-loss"; winner: "w" | "b" };

export function initialStateFromDesign(design: Design): GameState {
  const registry = buildRegistry(design.customPieces);
  const board = emptyBoard(design.rows, design.cols);
  const startingSet = new Set<string>();
  for (const pl of design.placements) {
    if (pl.r < 0 || pl.r >= design.rows || pl.c < 0 || pl.c >= design.cols) continue;
    if (!registry[pl.pieceId]) continue;
    board[pl.r][pl.c] = { id: pl.pieceId, color: pl.color };
    startingSet.add(pl.pieceId);
  }
  for (const color of ["w", "b"] as const) {
    for (const [id, count] of Object.entries(design.reserves[color] ?? {})) {
      if (count && registry[id]) startingSet.add(id);
    }
  }
  return {
    board,
    turn: "w",
    history: [],
    captured: { w: [], b: [] },
    corpses: [],
    reserves: { w: { ...design.reserves.w }, b: { ...design.reserves.b } },
    enPassant: null,
    registry,
    rows: design.rows,
    cols: design.cols,
    pendingHand: null,
    startingPieceIds: Array.from(startingSet),
  };
}

export function applyMove(state: GameState, move: Move): GameState {
  const next = applyMoveToState(state, move);
  return {
    ...next,
    history: [...state.history, move],
  };
}

export function replayMoves(moves: Move[], start: GameState): GameState {
  let s = start;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

export function gameStatus(state: GameState): GameStatus {
  // Check royal loss FIRST (a side might have lost its King via a non-checkmating capture
  // if the position bypassed normal check rules — e.g. drops).
  for (const color of ["w", "b"] as const) {
    const royals = findRoyals(state, color);
    if (royals.length === 0) return { kind: "royal-loss", winner: color === "w" ? "b" : "w" };
  }
  const moves = allLegalMoves(state);
  const check = inCheck(state, state.turn);
  if (moves.length === 0) {
    if (check) return { kind: "checkmate", winner: state.turn === "w" ? "b" : "w" };
    return { kind: "stalemate" };
  }
  return { kind: "playing", check };
}
