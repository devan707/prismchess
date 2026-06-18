import type { Color, Difficulty, GameState, Move, Square } from "../types";
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

/**
 * How many of the recent plies were quiet moves chaining back from `sq` for
 * `color`. Used to discourage the AI from shuffling the same piece
 * (Dragon/Necromancer/Wizard) back and forth across turns.
 */
function recentShuffleCount(state: GameState, sq: Square, color: Color, window = 6): number {
  const h = state.history;
  if (!h || h.length === 0) return 0;
  const start = Math.max(0, h.length - window);
  let count = 0;
  let chasingSq: Square | null = sq;
  for (let i = h.length - 1; i >= start && chasingSq; i--) {
    const m = h[i];
    if (m.piece.color !== color) continue;
    if (m.captured) break;
    if (m.to.r === chasingSq.r && m.to.c === chasingSq.c) {
      count += 1;
      chasingSq = m.from;
    }
  }
  return count;
}

/**
 * Net material the Prism aura flips on this move. Positive = we gain pieces
 * (enemies flipped to our side), negative = we lose pieces (our own flipped
 * to the enemy, including the mover itself if it ends in the aura or crosses
 * it). The search naturally sees this via applyMoveToState + evaluate, but
 * easy mode and move ordering only look one ply, so without this the AI will
 * happily walk its Queen through prism light.
 */
function prismFlipDelta(state: GameState, m: Move): number {
  // Cheap early-out when there are no prisms on the board.
  let anyPrism = false;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell && state.registry[cell.id]?.special === "prism") { anyPrism = true; break; }
    }
    if (anyPrism) break;
  }
  if (!anyPrism) return 0;
  const us = m.piece.color;
  const opp: Color = us === "w" ? "b" : "w";
  const next = applyMoveToState(state, m);
  let delta = 0;
  // Stationary pieces whose colour changed between pre- and post-move boards.
  for (let r = 0; r < next.board.length; r++) {
    for (let c = 0; c < next.board[0].length; c++) {
      if (m.from && r === m.from.r && c === m.from.c) continue;
      if (r === m.to.r && c === m.to.c) continue;
      const before = state.board[r][c];
      const after = next.board[r][c];
      if (!before || !after || before.id !== after.id) continue;
      if (before.color === after.color) continue;
      const v = valueFor(after.id, state.registry[after.id]);
      delta += after.color === us ? v : -v;
    }
  }
  // The mover itself — if it ended up enemy-coloured (passed through aura or
  // is standing in it), we've effectively donated the piece.
  const movingId = m.shapeshiftTo ?? m.promotion ?? m.piece.id;
  const landed = next.board[m.to.r]?.[m.to.c];
  if (landed && landed.id === movingId && landed.color === opp) {
    delta -= valueFor(movingId, state.registry[movingId]);
  }
  return delta;
}

function moveScore(state: GameState, m: Move): number {
  let s = 0;
  const pb = loadPlaybook();
  if (m.captured) s += valueFor(m.captured.id, state.registry[m.captured.id]) + pb.aggressionBonus;
  if (m.promotion) s += valueFor(m.promotion, state.registry[m.promotion]) - 100;
  if (m.shapeshiftTo) s += valueFor(m.shapeshiftTo, state.registry[m.shapeshiftTo]) - 140;
  if ((m.kind === "resurrect" || m.kind === "necroRaise") && m.resurrectPieceId) {
    const v = valueFor(m.resurrectPieceId, state.registry[m.resurrectPieceId]);
    const ownBonus =
      m.kind === "necroRaise" && m.resurrectOriginalOwner && m.resurrectOriginalOwner !== m.piece.color ? 1.25 : 1.0;
    s += v * 0.7 * ownBonus;
  }
  if (m.juggTrampled) {
    for (const p of m.juggTrampled) s += valueFor(p.id, state.registry[p.id]);
  }
  if (m.kind === "juggExit") s -= 900;
  if (m.kind === "juggCharge") s += 20;
  if (!m.captured && m.from) {
    const sp = state.registry[m.piece.id]?.special;
    const shuffles = recentShuffleCount(state, m.from, m.piece.color);
    if (shuffles > 0) {
      const weight = sp === "dragon" || sp === "portal" || sp === "necromancer" || sp === "wizard" ? 110 : 55;
      s -= shuffles * weight;
    }
  }
  s += prismFlipDelta(state, m);
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

/**
 * Quiescence search: at search horizon, keep playing only "loud" moves
 * (captures, promotions, juggernaut trample, shapeshift-captures) so the
 * static eval is taken on a stable position. This is the single biggest
 * fix for "the AI didn't see the trade two plies away".
 */
function qsearch(state: GameState, alpha: number, beta: number, depthLeft: number): number {
  const standPat = evaluate(state, state.turn);
  if (depthLeft <= 0) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  const moves = allLegalMoves(state);
  const loud: Move[] = [];
  for (const m of moves) {
    if (m.captured || m.promotion || m.shapeshiftTo || (m.juggTrampled && m.juggTrampled.length)) {
      loud.push(m);
    }
  }
  if (loud.length === 0) return standPat;
  loud.sort((a, b) => moveScore(state, b) - moveScore(state, a));
  for (const m of loud) {
    const next = applyMoveToState(state, m);
    const score = -qsearch(next, -beta, -alpha, depthLeft - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(state: GameState, depth: number, alpha: number, beta: number, useAB: boolean): number {
  const moves = allLegalMoves(state);
  if (moves.length === 0) {
    if (inCheck(state, state.turn)) return -100000 - depth;
    return 0;
  }
  if (depth === 0) return qsearch(state, alpha, beta, 4);
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

