/**
 * Iterative-deepening search with a wall-clock time budget. Designed to run
 * inside a Web Worker (see ./worker.ts) so the UI thread stays responsive.
 *
 * The shape mirrors what real engines do (Stockfish / Lichess): keep
 * deepening until either the depth cap or the time budget is hit, and always
 * return the best move found at the deepest *completed* iteration.
 */
import type { Difficulty, GameState, Move } from "../types";
import { allLegalMoves, applyMoveToState, inCheck } from "../moves";
import { evaluate, valueFor } from "./evaluate";

export interface SearchOptions {
  difficulty: Difficulty;
  budgetMs: number;
  /** Hard cap on depth — protects from runaway on tiny positions. */
  maxDepth: number;
}

export interface SearchResult {
  move: Move | null;
  depthReached: number;
  score: number;
  nodes: number;
  elapsedMs: number;
}

/** Thrown when the time budget elapses mid-search. Caught at the root. */
class TimeUp extends Error {}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Cheap move-ordering score. Captures, promotions and shape-shifts first. */
function orderingScore(state: GameState, m: Move): number {
  let s = 0;
  if (m.captured) {
    const victim = valueFor(m.captured.id, state.registry[m.captured.id]);
    const attacker = valueFor(m.piece.id, state.registry[m.piece.id]);
    // MVV-LVA: high-value victim taken by low-value attacker scores highest.
    s += victim * 10 - attacker;
  }
  if (m.promotion) s += valueFor(m.promotion, state.registry[m.promotion]) * 5;
  if (m.shapeshiftTo) s += valueFor(m.shapeshiftTo, state.registry[m.shapeshiftTo]) * 4;
  if (m.juggTrampled) {
    for (const p of m.juggTrampled) s += valueFor(p.id, state.registry[p.id]) * 6;
  }
  return s;
}

function isLoud(m: Move): boolean {
  return !!(m.captured || m.promotion || m.shapeshiftTo || (m.juggTrampled && m.juggTrampled.length));
}

class Searcher {
  nodes = 0;
  readonly deadline: number;
  bestMoveAtRoot: Move | null = null;
  bestScoreAtRoot = -Infinity;
  tiesAtRoot: Move[] = [];

  constructor(deadline: number) {
    this.deadline = deadline;
  }

  checkTime(): void {
    // Sampled every 1024 nodes so Date.now() isn't called per-node.
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp();
  }

  /** Quiescence search: only loud moves past the horizon. */
  qsearch(state: GameState, alpha: number, beta: number, depthLeft: number): number {
    this.nodes++;
    this.checkTime();
    const standPat = evaluate(state, state.turn);
    if (depthLeft <= 0) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const moves = allLegalMoves(state);
    const loud: Move[] = [];
    for (const m of moves) if (isLoud(m)) loud.push(m);
    if (loud.length === 0) return standPat;
    loud.sort((a, b) => orderingScore(state, b) - orderingScore(state, a));
    for (const m of loud) {
      const next = applyMoveToState(state, m);
      const score = -this.qsearch(next, -beta, -alpha, depthLeft - 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Negamax with alpha-beta. */
  search(state: GameState, depth: number, alpha: number, beta: number): number {
    this.nodes++;
    this.checkTime();
    const moves = allLegalMoves(state);
    if (moves.length === 0) {
      if (inCheck(state, state.turn)) return -100000 - depth;
      return 0;
    }
    if (depth === 0) return this.qsearch(state, alpha, beta, 4);
    moves.sort((a, b) => orderingScore(state, b) - orderingScore(state, a));
    let best = -Infinity;
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      const score = -this.search(next, depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** One root iteration at a given depth. Updates bestMoveAtRoot. */
  rootIteration(state: GameState, depth: number, prevBest: Move | null): void {
    const moves = allLegalMoves(state);
    if (moves.length === 0) return;
    // Put previous best first so alpha-beta cutoffs kick in earlier.
    moves.sort((a, b) => {
      if (prevBest && a.from && prevBest.from && a.from.r === prevBest.from.r && a.from.c === prevBest.from.c && a.to.r === prevBest.to.r && a.to.c === prevBest.to.c) return -1;
      if (prevBest && b.from && prevBest.from && b.from.r === prevBest.from.r && b.from.c === prevBest.from.c && b.to.r === prevBest.to.r && b.to.c === prevBest.to.c) return 1;
      return orderingScore(state, b) - orderingScore(state, a);
    });
    let alpha = -Infinity;
    const beta = Infinity;
    let bestScore = -Infinity;
    let bestMove: Move | null = null;
    const ties: Move[] = [];
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      const score = -this.search(next, depth - 1, -beta, -alpha);
      if (score > bestScore + 0.5) {
        bestScore = score;
        bestMove = m;
        ties.length = 0;
        ties.push(m);
      } else if (Math.abs(score - bestScore) <= 0.5) {
        ties.push(m);
      }
      if (bestScore > alpha) alpha = bestScore;
    }
    if (bestMove) {
      this.bestMoveAtRoot = bestMove;
      this.bestScoreAtRoot = bestScore;
      this.tiesAtRoot = ties;
    }
  }
}

export function runSearch(state: GameState, opts: SearchOptions): SearchResult {
  const start = Date.now();
  const deadline = start + Math.max(20, opts.budgetMs);
  const searcher = new Searcher(deadline);
  let depthReached = 0;
  let prevBest: Move | null = null;
  try {
    for (let d = 1; d <= opts.maxDepth; d++) {
      searcher.rootIteration(state, d, prevBest);
      depthReached = d;
      prevBest = searcher.bestMoveAtRoot;
      // Bail early if we're way past budget (don't start an iteration we
      // know we can't finish — but we've completed `d`, so we can return it).
      if (Date.now() > deadline) break;
    }
  } catch (err) {
    if (!(err instanceof TimeUp)) throw err;
    // Time ran out partway through an iteration — keep the previous depth's
    // best move (already stored on the searcher).
  }
  // Pick a tie randomly to vary play.
  let chosen = searcher.bestMoveAtRoot;
  if (searcher.tiesAtRoot.length > 1) chosen = pickRandom(searcher.tiesAtRoot);
  // Easy difficulty: 25% of the time, pick a slightly worse legal move so
  // beginners aren't crushed by the same engine that powers hard mode.
  if (opts.difficulty === "easy" && chosen && Math.random() < 0.25) {
    const all = allLegalMoves(state);
    if (all.length > 1) chosen = pickRandom(all);
  }
  return {
    move: chosen,
    depthReached,
    score: searcher.bestScoreAtRoot,
    nodes: searcher.nodes,
    elapsedMs: Date.now() - start,
  };
}

/** Difficulty → (budgetMs, maxDepth). Scaled down for big boards / explosive specials. */
export function paramsFor(state: GameState, difficulty: Difficulty): { budgetMs: number; maxDepth: number } {
  const area = state.rows * state.cols;
  let heavyBranching = false;
  for (let r = 0; r < state.board.length && !heavyBranching; r++) {
    for (let c = 0; c < state.board[r].length && !heavyBranching; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const sp = state.registry[p.id]?.special;
      if (sp === "dragon" || sp === "portal") heavyBranching = true;
    }
  }
  // Scale factor for big or branchy boards — keep total time bounded.
  const sizePenalty = area > 144 ? 0.55 : area > 100 ? 0.75 : area > 64 ? 0.9 : 1;
  const branchPenalty = heavyBranching ? 0.7 : 1;
  if (difficulty === "easy") {
    return { budgetMs: Math.round(200 * sizePenalty), maxDepth: 2 };
  }
  if (difficulty === "medium") {
    return { budgetMs: Math.round(800 * sizePenalty * branchPenalty), maxDepth: 4 };
  }
  // hard
  return {
    budgetMs: Math.round(3000 * sizePenalty * branchPenalty),
    maxDepth: heavyBranching ? 5 : area > 100 ? 5 : 6,
  };
}
