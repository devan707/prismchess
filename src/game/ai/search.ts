/**
 * Iterative-deepening search with a wall-clock time budget. Designed to run
 * inside a Web Worker (see ./worker.ts) so the UI thread stays responsive.
 *
 * Beyond plain negamax + alpha-beta, this includes:
 *   - Killer-move + history-heuristic ordering for non-captures
 *   - Recapture-loss penalty in ordering (don't grab a pawn with a wizard)
 *   - Check extensions (search 1 ply deeper when in check)
 *   - Deeper quiescence (8 plies) that includes all "loud" move kinds
 *
 * The shape mirrors what real engines do: keep deepening until either the
 * depth cap or the time budget is hit, and always return the best move found
 * at the deepest *completed* iteration.
 */
import type { Color, Difficulty, GameState, Move, Square } from "../types";
import { allLegalMoves, applyMoveToState, inCheck, isSquareAttacked } from "../moves";
// Note: check-giving moves are treated as "loud" via per-call computation in
// qsearch (see below) — we can't fold it into isLoud() without a state arg.
import { evaluate, valueFor } from "./evaluate";

export interface SearchOptions {
  difficulty: Difficulty;
  budgetMs: number;
  maxDepth: number;
}

export interface SearchResult {
  move: Move | null;
  depthReached: number;
  score: number;
  nodes: number;
  elapsedMs: number;
}

class TimeUp extends Error {}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function moveKey(m: Move): string {
  const f = m.from ? `${m.from.r},${m.from.c}` : "x";
  return `${f}>${m.to.r},${m.to.c}:${m.piece.id}:${m.kind ?? "n"}`;
}

function sameMove(a: Move, b: Move): boolean {
  if (a.to.r !== b.to.r || a.to.c !== b.to.c) return false;
  if (a.kind !== b.kind) return false;
  const af = a.from, bf = b.from;
  if (!af && !bf) return a.piece.id === b.piece.id;
  if (!af || !bf) return false;
  return af.r === bf.r && af.c === bf.c && a.piece.id === b.piece.id;
}

function isLoud(m: Move): boolean {
  return !!(
    m.captured ||
    m.promotion ||
    m.shapeshiftTo ||
    (m.juggTrampled && m.juggTrampled.length)
  );
}

/**
 * Cheap recapture-loss heuristic: after we move to m.to, can the opponent
 * recapture us with a piece worth less than what we'd lose? Returns a
 * positive penalty in centipawns (the expected material we'd hang).
 */
function recaptureLoss(state: GameState, m: Move): number {
  if (m.kind === "juggCharge" || m.kind === "juggExit" || m.kind === "juggShift") return 0;
  if (m.kind === "resurrect" || m.kind === "necroRaise" || m.kind === "portalSwap" || m.kind === "drop") return 0;
  const movingId = m.shapeshiftTo ?? m.promotion ?? m.piece.id;
  const movingValue = valueFor(movingId, state.registry[movingId]);
  const next = applyMoveToState(state, m);
  const us = m.piece.color;
  const opp: Color = us === "w" ? "b" : "w";
  const sq: Square = m.to;
  const attacked = isSquareAttacked(next, sq, opp);
  if (!attacked) return 0;
  const board = next.board;
  const resident = board[sq.r][sq.c];
  if (!resident) return 0;
  // Are we defended? Test by flipping the resident piece's colour so friendly
  // recapturers show up as attackers.
  board[sq.r][sq.c] = { id: resident.id, color: opp };
  const defended = isSquareAttacked(next, sq, us);
  board[sq.r][sq.c] = resident;
  const victimValue = m.captured ? valueFor(m.captured.id, state.registry[m.captured.id]) : 0;
  // Undefended: we hang the whole moving piece (minus what we just grabbed).
  if (!defended) return Math.max(0, movingValue - victimValue);
  // Defended: only a problem if their attacker is worth less than ours.
  // Approximate: half the difference.
  return Math.max(0, (movingValue - victimValue) * 0.35);
}

/** Move-ordering score. Captures by MVV-LVA, promotions, shape-shifts,
 *  juggernaut trample, minus a recapture-loss penalty. */
function orderingScore(state: GameState, m: Move): number {
  let s = 0;
  if (m.captured) {
    const victim = valueFor(m.captured.id, state.registry[m.captured.id]);
    const attacker = valueFor(m.piece.id, state.registry[m.piece.id]);
    s += victim * 10 - attacker;
  }
  if (m.promotion) s += valueFor(m.promotion, state.registry[m.promotion]) * 5;
  if (m.shapeshiftTo) s += valueFor(m.shapeshiftTo, state.registry[m.shapeshiftTo]) * 4;
  if (m.juggTrampled) {
    for (const p of m.juggTrampled) s += valueFor(p.id, state.registry[p.id]) * 6;
  }
  s -= recaptureLoss(state, m);
  return s;
}

class Searcher {
  nodes = 0;
  readonly deadline: number;
  bestMoveAtRoot: Move | null = null;
  bestScoreAtRoot = -Infinity;
  tiesAtRoot: Move[] = [];
  /** killers[depth] = [primary, secondary] non-capture moves that caused a cutoff. */
  killers: Array<[Move | null, Move | null]> = [];
  /** history[moveKey] cumulative cutoff bonus. */
  history = new Map<string, number>();

  constructor(deadline: number) {
    this.deadline = deadline;
  }

  checkTime(): void {
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp();
  }

  recordKiller(depth: number, m: Move): void {
    if (isLoud(m)) return;
    const slot = (this.killers[depth] ??= [null, null]);
    if (slot[0] && sameMove(slot[0], m)) return;
    slot[1] = slot[0];
    slot[0] = m;
  }

  bumpHistory(m: Move, depth: number): void {
    if (isLoud(m)) return;
    const k = moveKey(m);
    this.history.set(k, (this.history.get(k) ?? 0) + depth * depth);
  }

  scoreFor(state: GameState, m: Move, depth: number, ttBest: Move | null): number {
    if (ttBest && sameMove(ttBest, m)) return 1_000_000;
    if (isLoud(m)) return 500_000 + orderingScore(state, m);
    const k = this.killers[depth];
    if (k) {
      if (k[0] && sameMove(k[0], m)) return 400_000;
      if (k[1] && sameMove(k[1], m)) return 300_000;
    }
    return this.history.get(moveKey(m)) ?? 0;
  }

  qsearch(state: GameState, alpha: number, beta: number, depthLeft: number): number {
    this.nodes++;
    this.checkTime();
    const standPat = evaluate(state, state.turn);
    if (depthLeft <= 0) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const moves = allLegalMoves(state);
    // PRINCIPLE #8 — forcing moves. Treat captures/promos/specials as loud,
    // AND any move that delivers check (so qsearch follows mating sequences).
    const loud: Move[] = [];
    const loudNexts: GameState[] = [];
    for (const m of moves) {
      if (isLoud(m)) { loud.push(m); loudNexts.push(applyMoveToState(state, m)); continue; }
      // Only spend the applyMove cost on a quiet move when depthLeft is high
      // enough to be worth following its check.
      if (depthLeft >= 4) {
        const next = applyMoveToState(state, m);
        if (inCheck(next, next.turn)) { loud.push(m); loudNexts.push(next); }
      }
    }
    if (loud.length === 0) return standPat;
    // Pair-sort by orderingScore (captures first, checks after).
    const order = loud.map((_, i) => i).sort((a, b) => orderingScore(state, loud[b]) - orderingScore(state, loud[a]));
    for (const m of loud) {
      const next = applyMoveToState(state, m);
      const score = -this.qsearch(next, -beta, -alpha, depthLeft - 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  search(state: GameState, depth: number, alpha: number, beta: number, ttBest: Move | null): number {
    this.nodes++;
    this.checkTime();
    const moves = allLegalMoves(state);
    if (moves.length === 0) {
      if (inCheck(state, state.turn)) return -100000 - depth;
      return 0;
    }
    // Check extension: don't drop into qsearch while in check.
    const isInCheck = inCheck(state, state.turn);
    if (depth === 0) {
      if (isInCheck) depth = 1;
      else return this.qsearch(state, alpha, beta, 8);
    }
    moves.sort((a, b) => this.scoreFor(state, b, depth, ttBest) - this.scoreFor(state, a, depth, ttBest));
    let best = -Infinity;
    let bestMove: Move | null = null;
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      // Single-ply check extension when our move puts them in check.
      const gaveCheck = inCheck(next, next.turn);
      const ext = gaveCheck ? 1 : 0;
      const score = -this.search(next, depth - 1 + ext, -beta, -alpha, null);
      if (score > best) { best = score; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        this.recordKiller(depth, m);
        this.bumpHistory(m, depth);
        break;
      }
    }
    if (bestMove) this.bumpHistory(bestMove, depth);
    return best;
  }

  rootIteration(state: GameState, depth: number, prevBest: Move | null): void {
    const moves = allLegalMoves(state);
    if (moves.length === 0) return;
    moves.sort((a, b) => this.scoreFor(state, b, depth, prevBest) - this.scoreFor(state, a, depth, prevBest));
    let alpha = -Infinity;
    const beta = Infinity;
    let bestScore = -Infinity;
    let bestMove: Move | null = null;
    const ties: Move[] = [];
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      const gaveCheck = inCheck(next, next.turn);
      const ext = gaveCheck ? 1 : 0;
      const score = -this.search(next, depth - 1 + ext, -beta, -alpha, null);
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
      // If we have enough time for another iteration we'll do it; otherwise
      // commit to what we have. Heuristic: if 65% of budget is gone, stop.
      const elapsed = Date.now() - start;
      if (elapsed > opts.budgetMs * 0.65) break;
    }
  } catch (err) {
    if (!(err instanceof TimeUp)) throw err;
  }
  let chosen = searcher.bestMoveAtRoot;
  if (searcher.tiesAtRoot.length > 1) chosen = pickRandom(searcher.tiesAtRoot);
  // Easy: 25% chance to play a random legal move so beginners can win.
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
  const sizePenalty = area > 144 ? 0.5 : area > 100 ? 0.7 : area > 64 ? 0.85 : 1;
  const branchPenalty = heavyBranching ? 0.65 : 1;
  if (difficulty === "easy") {
    return { budgetMs: Math.round(300 * sizePenalty), maxDepth: 3 };
  }
  if (difficulty === "medium") {
    return {
      budgetMs: Math.round(1500 * sizePenalty * branchPenalty),
      maxDepth: heavyBranching ? 4 : area > 100 ? 4 : 5,
    };
  }
  // hard
  return {
    budgetMs: Math.round(6000 * sizePenalty * branchPenalty),
    maxDepth: heavyBranching ? 6 : area > 100 ? 6 : 8,
  };
}
