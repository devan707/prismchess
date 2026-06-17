import type { Difficulty, GameState, Move, Square } from "../types";
import { allLegalMoves, applyMoveToState, inCheck, isSquareAttacked } from "../moves";
import { evaluate, valueFor } from "./evaluate";
import { loadPlaybook } from "./playbook";

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Cheap static-exchange check for the destination square of a move: after
 * playing `m`, is our piece sitting on a square the opponent can recapture
 * for less material than it costs us? If so, return the (positive) material
 * we expect to lose. This is what stops the AI from grabbing a defended pawn
 * with its Wizard.
 */
function recaptureLoss(state: GameState, m: Move): number {
  // Only the most common case matters: a normal move/capture that leaves a
  // single one of our pieces on m.to. Skip special multi-square moves.
  if (m.kind === "juggCharge" || m.kind === "juggExit" || m.kind === "juggShift") return 0;
  if (m.kind === "resurrect" || m.kind === "necroRaise" || m.kind === "portalSwap" || m.kind === "drop") return 0;
  const movingId = m.shapeshiftTo ?? m.promotion ?? m.piece.id;
  const movingValue = valueFor(movingId, state.registry[movingId]);
  const next = applyMoveToState(state, m);
  const us = m.piece.color;
  const opp = us === "w" ? "b" : "w";
  const sq: Square = m.to;
  // Dragon "flight" lands on an empty square but doesn't actually capture —
  // landing under attack is still bad. For every other move, attacked = bad.
  const attacked = isSquareAttacked(next, sq, opp);
  if (!attacked) return 0;
  // Defended? Temporarily flip the resident piece so friendly recapturers
  // appear as attackers of that square.
  const board = next.board;
  const resident = board[sq.r][sq.c];
  if (!resident) return 0;
  board[sq.r][sq.c] = { id: resident.id, color: opp };
  const defended = isSquareAttacked(next, sq, us);
  board[sq.r][sq.c] = resident;
  // Captured value already credited in moveScore; here we subtract the
  // expected loss of our own piece on the recapture.
  return defended ? movingValue * 0.25 : movingValue * 0.9;
}

function moveScore(state: GameState, m: Move): number {
  let s = 0;
  if (m.captured) s += valueFor(m.captured.id, state.registry[m.captured.id]);
  if (m.promotion) s += valueFor(m.promotion, state.registry[m.promotion]) - 100;
  if (m.shapeshiftTo) s += valueFor(m.shapeshiftTo, state.registry[m.shapeshiftTo]) - 140;
  if ((m.kind === "resurrect" || m.kind === "necroRaise") && m.resurrectPieceId) {
    const v = valueFor(m.resurrectPieceId, state.registry[m.resurrectPieceId]);
    // Stealing an enemy corpse is worth more than recovering our own.
    const ownBonus =
      m.kind === "necroRaise" && m.resurrectOriginalOwner && m.resurrectOriginalOwner !== m.piece.color ? 1.25 : 1.0;
    s += v * 0.7 * ownBonus;
  }
  if (m.juggTrampled) {
    for (const p of m.juggTrampled) s += valueFor(p.id, state.registry[p.id]);
  }
  if (m.kind === "juggExit") s -= 900;
  if (m.kind === "juggCharge") s += 20;
  s -= recaptureLoss(state, m);
  return s;
}

function easyMove(state: GameState): Move | null {
  const moves = allLegalMoves(state);
  if (moves.length === 0) return null;
  // Score every move (captures AND quiet moves) so the AI weighs material
  // gained against material it would hang. Without this, even an "easy" bot
  // will happily sac a Wizard for a defended pawn.
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const v = moveScore(state, m);
    if (v > bestV) { bestV = v; best = m; }
  }
  // If the best "safe" option is a quiet move (score 0) and there are
  // several, sprinkle some variety so it doesn't look robotic.
  if (bestV <= 0) {
    const ties = moves.filter((m) => moveScore(state, m) === bestV);
    return pickRandom(ties);
  }
  return best;
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
  // Portals (swap to any friendly), dragons (teleport to any empty), and
  // wide-range pieces blow up the branching factor — a full minimax at
  // depth 2 can lock the main thread for many seconds. Clamp hard.
  const area = state.rows * state.cols;
  // Detect "explosive-branching" specials currently on the board.
  let heavyBranching = false;
  for (let r = 0; r < state.board.length && !heavyBranching; r++) {
    for (let c = 0; c < state.board[r].length && !heavyBranching; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const sp = state.registry[p.id]?.special;
      if (sp === "dragon" || sp === "portal") heavyBranching = true;
    }
  }
  if (difficulty === "medium") {
    if (area > 100) return easyMove(state);
    if (heavyBranching) return rootSearch(state, 2, true);
    const depth = area > 64 ? 2 : 3;
    return rootSearch(state, depth, true);
  }
  // hard
  if (area > 100) return rootSearch(state, 1, true);
  if (heavyBranching) return rootSearch(state, 2, true);
  const depth = area > 64 ? 3 : 4;
  return rootSearch(state, depth, true);
}

