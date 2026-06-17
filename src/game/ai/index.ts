import type { Difficulty, GameState, Move } from "../types";
import { allLegalMoves, applyMoveToBoard, ctxFromState, inCheck } from "../moves";
import { evaluate } from "./evaluate";

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PIECE_VAL: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };

function easyMove(state: GameState): Move | null {
  const moves = allLegalMoves(state.board, state.turn, ctxFromState(state));
  if (moves.length === 0) return null;
  const captures = moves.filter((m) => m.captured);
  if (captures.length > 0) {
    let best = captures[0];
    let bestV = -1;
    for (const m of captures) {
      const v = PIECE_VAL[m.captured!.type] ?? 0;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    }
    return best;
  }
  return pickRandom(moves);
}

function orderMoves(moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => {
    const av = a.captured ? (PIECE_VAL[a.captured.type] ?? 0) : 0;
    const bv = b.captured ? (PIECE_VAL[b.captured.type] ?? 0) : 0;
    return bv - av;
  });
}

// Negamax with alpha-beta
function search(
  board: import("../types").Board,
  turn: "w" | "b",
  depth: number,
  alpha: number,
  beta: number,
  useAB: boolean,
): number {
  const moves = allLegalMoves(board, turn);
  if (moves.length === 0) {
    if (inCheck(board, turn)) return -100000 - depth; // losing
    return 0; // stalemate
  }
  if (depth === 0) return evaluate(board, turn);

  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    const nb = applyMoveToBoard(board, m);
    const score = -search(nb, turn === "w" ? "b" : "w", depth - 1, -beta, -alpha, useAB);
    if (score > best) best = score;
    if (useAB) {
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  }
  return best;
}

function rootSearch(state: GameState, depth: number, useAB: boolean): Move | null {
  const moves = allLegalMoves(state.board, state.turn, ctxFromState(state));
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const m of orderMoves(moves)) {
    const nb = applyMoveToBoard(state.board, m);
    const score = -search(
      nb,
      state.turn === "w" ? "b" : "w",
      depth - 1,
      -beta,
      -alpha,
      useAB,
    );
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
    if (useAB && bestScore > alpha) alpha = bestScore;
  }
  return best;
}

export function chooseMove(state: GameState, difficulty: Difficulty): Move | null {
  if (difficulty === "easy") return easyMove(state);
  if (difficulty === "medium") return rootSearch(state, 3, false);
  return rootSearch(state, 4, true);
}
