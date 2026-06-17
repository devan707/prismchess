import type { Difficulty, GameState, Move } from "../types";
import { allLegalMoves, applyMoveToState, inCheck } from "../moves";
import { evaluate, valueFor } from "./evaluate";

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function moveScore(state: GameState, m: Move): number {
  let s = 0;
  if (m.captured) s += valueFor(m.captured.id, state.registry[m.captured.id]);
  if (m.promotion) s += valueFor(m.promotion, state.registry[m.promotion]) - 100;
  if (m.shapeshiftTo) s += valueFor(m.shapeshiftTo, state.registry[m.shapeshiftTo]) - 140;
  if (m.kind === "resurrect" && m.resurrectPieceId) s += valueFor(m.resurrectPieceId, state.registry[m.resurrectPieceId]) * 0.6;
  if (m.juggTrampled) {
    for (const p of m.juggTrampled) s += valueFor(p.id, state.registry[p.id]);
  }
  if (m.kind === "juggExit") s -= 900; // losing both J squares is costly; only do it for tactical reasons
  if (m.kind === "juggCharge") s += 20; // tiny bias toward forward progress
  return s;
}

function easyMove(state: GameState): Move | null {
  const moves = allLegalMoves(state);
  if (moves.length === 0) return null;
  const captures = moves.filter((m) => m.captured);
  if (captures.length > 0) {
    let best = captures[0];
    let bestV = -1;
    for (const m of captures) {
      const v = moveScore(state, m);
      if (v > bestV) { bestV = v; best = m; }
    }
    return best;
  }
  return pickRandom(moves);
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => moveScore(state, b) - moveScore(state, a));
}

function search(state: GameState, depth: number, alpha: number, beta: number, useAB: boolean): number {
  const moves = allLegalMoves(state);
  if (moves.length === 0) {
    if (inCheck(state, state.turn)) return -100000 - depth;
    return 0;
  }
  if (depth === 0) return evaluate(state, state.turn);
  let best = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const next = applyMoveToState(state, m);
    const score = -search(next, depth - 1, -beta, -alpha, useAB);
    if (score > best) best = score;
    if (useAB) {
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  }
  return best;
}

function rootSearch(state: GameState, depth: number, useAB: boolean): Move | null {
  const moves = allLegalMoves(state);
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const m of orderMoves(state, moves)) {
    const next = applyMoveToState(state, m);
    const score = -search(next, depth - 1, -beta, -alpha, useAB);
    if (score > bestScore) { bestScore = score; best = m; }
    if (useAB && bestScore > alpha) alpha = bestScore;
  }
  return best;
}

export function chooseMove(state: GameState, difficulty: Difficulty): Move | null {
  if (difficulty === "easy") return easyMove(state);
  // Scale depth down for big boards / many pieces to keep responsive.
  const area = state.rows * state.cols;
  if (difficulty === "medium") {
    const depth = area > 64 ? 2 : 3;
    return rootSearch(state, depth, true);
  }
  const depth = area > 64 ? 3 : 4;
  return rootSearch(state, depth, true);
}
