/**
 * Iterative-deepening search with a wall-clock time budget. Designed to run
 * inside a Web Worker (see ./worker.ts) so the UI thread stays responsive.
 *
 * Beyond plain negamax + alpha-beta, this includes:
 *   - Transposition table (Zobrist-hashed) with mate-distance-adjusted
 *     scores. The TT short-circuits identical positions reached by
 *     different move orders, gaining ~1 ply of effective depth at the
 *     same wall-clock budget.
 *   - Killer-move + history-heuristic ordering for non-captures
 *   - Recapture-loss penalty in ordering (don't grab a pawn with a wizard)
 *   - Check extensions (search 1 ply deeper when in check)
 *   - Deeper quiescence (8 plies) that includes all "loud" move kinds
 *
 * The shape mirrors what real engines do: keep deepening until either the
 * depth cap or the time budget is hit, and always return the best move found
 * at the deepest *completed* iteration.
 */
import type { Difficulty, GameState, Move } from "../types";
import { allLegalMoves, applyMoveToState, inCheck } from "../moves";
// Note: check-giving moves are treated as "loud" via per-call computation in
// qsearch (see below) — we can't fold it into isLoud() without a state arg.
import { evaluate, seeMove, shuffleAdjustment, valueFor } from "./evaluate";
import { getActivePlaybook } from "./playbook";
import {
  computeVariantSalt,
  computeZobristFromScratch,
  zkeyAfter,
} from "./zobrist";
import { runSafetyGate, type CandidateAnalysis } from "./safety";
import {
  MATE_THRESHOLD,
  TT,
  TT_FLAG_EXACT,
  TT_FLAG_LOWER,
  TT_FLAG_UPPER,
  type TTStats,
} from "./tt";


export interface SearchOptions {
  difficulty: Difficulty;
  budgetMs: number;
  maxDepth: number;
  /** Reusable TT — pass the worker-owned table to amortize across calls. */
  tt?: TT;
  /** When true, every node verifies the incremental Zobrist key against a
   *  from-scratch recompute. On mismatch the TT is disabled for the rest
   *  of this search and the failure is logged. Off in production. */
  verifyZobrist?: boolean;
}

export interface SearchResult {
  move: Move | null;
  depthReached: number;
  score: number;
  nodes: number;
  elapsedMs: number;
  tt: TTStats;
  /** Set if the verifier caught a hash mismatch and we hard-fell-back. */
  zobristFailed?: boolean;
  /** Principal variation (rough — walks TT from root, may terminate early). */
  pv: Move[];
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

/** Squares that the opponent's last move directly affected. */
function lastMoveFocus(state: GameState): { to: { r: number; c: number } | null; from: { r: number; c: number } | null } {
  const h = state.history;
  for (let i = h.length - 1; i >= 0; i--) {
    const m = h[i];
    if (m.piece.color !== state.turn) {
      return { to: m.to, from: m.from };
    }
  }
  return { to: null, from: null };
}

function orderingScore(state: GameState, m: Move): number {
  let s = 0;
  if (m.captured) {
    const see = seeMove(state, m);
    if (see >= 0) {
      const victim = valueFor(m.captured.id, state.registry[m.captured.id]);
      s += 1_000 + see + victim / 10;
    } else {
      s += see;
    }
  } else {
    const see = seeMove(state, m);
    if (see < 0) s += see;
  }
  if (m.promotion) s += valueFor(m.promotion, state.registry[m.promotion]) * 5;
  if (m.shapeshiftTo) s += valueFor(m.shapeshiftTo, state.registry[m.shapeshiftTo]) * 4;
  if (m.juggTrampled) {
    for (const p of m.juggTrampled) s += valueFor(p.id, state.registry[p.id]) * 6;
  }
  const focus = lastMoveFocus(state);
  if (focus.to && m.to.r === focus.to.r && m.to.c === focus.to.c) {
    s += m.captured ? 300 : 80;
  }
  if (focus.from && m.to.r === focus.from.r && m.to.c === focus.from.c) {
    s += 40;
  }
  return s;
}


class Searcher {
  nodes = 0;
  readonly deadline: number;
  readonly tt: TT | null;
  readonly salt: bigint;
  readonly verify: boolean;
  /** Becomes true if the Zobrist verifier ever caught a mismatch — disables
   *  TT probes/stores for the rest of the search and surfaces in the result. */
  ttDisabled = false;
  zobristFailed = false;

  bestMoveAtRoot: Move | null = null;
  bestScoreAtRoot = -Infinity;
  tiesAtRoot: Move[] = [];
  rootScores: Array<{ move: Move; score: number }> = [];
  killers: Array<[Move | null, Move | null]> = [];
  history = new Map<string, number>();

  constructor(deadline: number, tt: TT | null, salt: bigint, verify: boolean) {
    this.deadline = deadline;
    this.tt = tt;
    this.salt = salt;
    this.verify = verify;
  }

  checkTime(): void {
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp();
  }

  /** Hard fallback per the plan: if the incremental key ever diverges from
   *  the from-scratch recompute, log loudly and disable TT for the rest of
   *  this search. We surface the flag in the result so the caller can show
   *  it in the debug panel. */
  private failZobrist(prevKey: bigint, key: bigint, state: GameState, fromMove: Move | null): void {
    if (this.ttDisabled) return;
    this.ttDisabled = true;
    this.zobristFailed = true;
    try {
      console.error("[ai] Zobrist verification failed — disabling TT for this search", {
        incrementalKey: key.toString(16),
        prevKey: prevKey.toString(16),
        recomputed: computeZobristFromScratch(state, this.salt).toString(16),
        move: fromMove,
        turn: state.turn,
      });
    } catch {
      /* console may not exist in some hosts */
    }
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

  qsearch(state: GameState, key: bigint, alpha: number, beta: number, depthLeft: number, ply: number): number {
    this.nodes++;
    this.checkTime();
    const standPat = evaluate(state, state.turn);
    if (depthLeft <= 0) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const moves = allLegalMoves(state);
    const loud: Move[] = [];
    const loudNexts: GameState[] = [];
    const loudKeys: bigint[] = [];
    for (const m of moves) {
      if (isLoud(m)) {
        const next = applyMoveToState(state, m);
        loud.push(m); loudNexts.push(next);
        loudKeys.push(this.nextKey(key, state, next, m));
        continue;
      }
      if (depthLeft >= 4) {
        const next = applyMoveToState(state, m);
        if (inCheck(next, next.turn)) {
          loud.push(m); loudNexts.push(next);
          loudKeys.push(this.nextKey(key, state, next, m));
        }
      }
    }
    if (loud.length === 0) return standPat;
    const order = loud.map((_, i) => i).sort((a, b) => orderingScore(state, loud[b]) - orderingScore(state, loud[a]));
    for (const i of order) {
      const score = -this.qsearch(loudNexts[i], loudKeys[i], -beta, -alpha, depthLeft - 1, ply + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Compute (or look up) the Zobrist key for the child state. */
  private nextKey(prevKey: bigint, prev: GameState, next: GameState, fromMove: Move | null): bigint {
    const k = zkeyAfter(prevKey, prev, next, this.salt);
    if (this.verify && !this.ttDisabled) {
      const ref = computeZobristFromScratch(next, this.salt);
      if (ref !== k) this.failZobrist(prevKey, k, next, fromMove);
    }
    return k;
  }

  search(state: GameState, key: bigint, depth: number, alpha: number, beta: number, ttBestSeed: Move | null, ply: number): number {
    this.nodes++;
    this.checkTime();

    // TT probe (skipped while disabled).
    let ttBest = ttBestSeed;
    if (this.tt && !this.ttDisabled) {
      const e = this.tt.probe(key);
      if (e) {
        // Validate `best` against the actual legal-move list — protects
        // against the rare event of a true 64-bit key collision producing
        // a move that's illegal here.
        if (e.depth >= depth) {
          const score = this.tt.adjustMateForRead(e.score, ply);
          if (e.flag === TT_FLAG_EXACT) {
            this.tt.recordCutoff();
            return score;
          }
          if (e.flag === TT_FLAG_LOWER && score >= beta) {
            this.tt.recordCutoff();
            return score;
          }
          if (e.flag === TT_FLAG_UPPER && score <= alpha) {
            this.tt.recordCutoff();
            return score;
          }
        }
        if (e.best) ttBest = e.best;
      }
    }

    const moves = allLegalMoves(state);
    if (moves.length === 0) {
      if (inCheck(state, state.turn)) return -100000 - depth;
      return 0;
    }
    // Validate ttBest is actually legal in this position (collision safety).
    if (ttBest) {
      let found = false;
      for (const m of moves) { if (sameMove(m, ttBest)) { found = true; break; } }
      if (!found) {
        if (this.tt) this.tt.recordCollision();
        ttBest = null;
      }
    }

    const isInCheck = inCheck(state, state.turn);
    if (depth === 0) {
      if (isInCheck) depth = 1;
      else return this.qsearch(state, key, alpha, beta, 8, ply);
    }
    moves.sort((a, b) => this.scoreFor(state, b, depth, ttBest) - this.scoreFor(state, a, depth, ttBest));
    const alphaOrig = alpha;
    let best = -Infinity;
    let bestMove: Move | null = null;
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      const childKey = this.nextKey(key, state, next, m);
      const gaveCheck = inCheck(next, next.turn);
      const ext = gaveCheck ? 1 : 0;
      const score = -this.search(next, childKey, depth - 1 + ext, -beta, -alpha, null, ply + 1);
      if (score > best) { best = score; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        this.recordKiller(depth, m);
        this.bumpHistory(m, depth);
        break;
      }
    }
    if (bestMove) this.bumpHistory(bestMove, depth);

    // TT store
    if (this.tt && !this.ttDisabled && bestMove) {
      let flag: 0 | 1 | 2 = TT_FLAG_EXACT;
      if (best <= alphaOrig) flag = TT_FLAG_UPPER;
      else if (best >= beta) flag = TT_FLAG_LOWER;
      this.tt.store(key, depth, best, flag, bestMove, ply);
    }
    return best;
  }

  rootIteration(state: GameState, rootKey: bigint, depth: number, prevBest: Move | null): void {
    const moves = allLegalMoves(state);
    if (moves.length === 0) return;
    moves.sort((a, b) => this.scoreFor(state, b, depth, prevBest) - this.scoreFor(state, a, depth, prevBest));
    let alpha = -Infinity;
    const beta = Infinity;
    let bestScore = -Infinity;
    let bestMove: Move | null = null;
    const ties: Move[] = [];
    const scored: Array<{ move: Move; score: number }> = [];
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      const childKey = this.nextKey(rootKey, state, next, m);
      const gaveCheck = inCheck(next, next.turn);
      const ext = gaveCheck ? 1 : 0;
      const score = -this.search(next, childKey, depth - 1 + ext, -beta, -alpha, null, 1);
      scored.push({ move: m, score });
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
      this.rootScores = scored;
      // Store the root with depth so subsequent iterations probe it.
      if (this.tt && !this.ttDisabled) {
        this.tt.store(rootKey, depth, bestScore, TT_FLAG_EXACT, bestMove, 0);
      }
    }
  }
}

function purposeBonus(state: GameState, m: Move): number {
  let b = 0;
  if (m.captured) {
    const see = seeMove(state, m);
    if (see >= 0) b += 200 + see * 0.05;
  }
  if (m.promotion || m.shapeshiftTo) b += 80;
  if (m.juggTrampled && m.juggTrampled.length) b += 60;
  const next = applyMoveToState(state, m);
  if (inCheck(next, next.turn)) b += 60;
  const focus = lastMoveFocus(state);
  if (focus.to && m.to.r === focus.to.r && m.to.c === focus.to.c) {
    b += m.captured ? 120 : 30;
  }
  if (focus.from && m.to.r === focus.from.r && m.to.c === focus.from.c) b += 20;
  if (m.from) {
    const wide = state.cols > state.rows;
    const dir = m.piece.color === "w" ? 1 : -1;
    const forwardDelta = wide ? (m.to.c - m.from.c) * dir : (m.to.r - m.from.r) * dir;
    if (forwardDelta > 0) b += Math.min(20, forwardDelta * 6);
  }
  const h = state.history;
  if (h && h.length >= 2 && m.from) {
    const prev = h[h.length - 2];
    if (prev && prev.piece.color === m.piece.color && prev.to.r === m.from.r &&
        prev.to.c === m.from.c && prev.from && !m.captured) {
      b -= 120;
    }
  }
  // Anti-shuffle (moved out of cached eval to keep TT path-independent).
  // Adds a positive bonus when this move would REDUCE the shuffle penalty
  // for our side relative to the current position.
  const after = applyMoveToState(state, m);
  const adjBefore = shuffleAdjustment(state, m.piece.color);
  const adjAfter = shuffleAdjustment(after, m.piece.color);
  b += (adjAfter - adjBefore);

  const pb = getActivePlaybook();
  const book = pb.openingBook;
  const scale = pb.cloudScale ?? 0;
  if (book && scale > 0 && m.to) {
    const aiColor = m.piece.color;
    const seq: string[] = [];
    for (const h of state.history) {
      if (h.piece.color !== aiColor) continue;
      seq.push(`${h.piece.id}@${h.to.r * 100 + h.to.c}`);
      if (seq.length >= 12) break;
    }
    if (seq.length < 12) {
      seq.push(`${m.piece.id}@${m.to.r * 100 + m.to.c}`);
      const key = seq.join("|");
      const entry = book[key];
      if (entry && entry.plays >= 3) {
        const winrate = entry.wins / entry.plays;
        b += Math.round((winrate - 0.5) * 200 * scale);
      }
    }
  }
  return b;
}

/** Walk the TT from the root state to assemble a rough principal variation.
 *  Stops at empty entries, illegal moves, or cycles. Cap protects against
 *  pathological loops. */
function reconstructPV(tt: TT | null, state: GameState, rootKey: bigint, salt: bigint, cap = 12): Move[] {
  if (!tt) return [];
  const out: Move[] = [];
  const seen = new Set<string>();
  let cur = state;
  let key = rootKey;
  for (let i = 0; i < cap; i++) {
    const sig = key.toString(16);
    if (seen.has(sig)) break;
    seen.add(sig);
    const e = tt.probe(key);
    if (!e || !e.best) break;
    // Verify legality (collision safety).
    const moves = allLegalMoves(cur);
    let m: Move | null = null;
    for (const cand of moves) { if (sameMove(cand, e.best)) { m = cand; break; } }
    if (!m) break;
    out.push(m);
    const next = applyMoveToState(cur, m);
    key = zkeyAfter(key, cur, next, salt);
    cur = next;
  }
  return out;
}

export function runSearch(state: GameState, opts: SearchOptions): SearchResult {
  const start = Date.now();
  const deadline = start + Math.max(20, opts.budgetMs);
  const salt = computeVariantSalt(state);
  const tt = opts.tt ?? null;
  if (tt) {
    tt.newGeneration();
    tt.resetCounters();
  }
  const searcher = new Searcher(deadline, tt, salt, !!opts.verifyZobrist);
  const rootKey = computeZobristFromScratch(state, salt);
  let depthReached = 0;
  let prevBest: Move | null = null;
  try {
    for (let d = 1; d <= opts.maxDepth; d++) {
      searcher.rootIteration(state, rootKey, d, prevBest);
      depthReached = d;
      prevBest = searcher.bestMoveAtRoot;
      const elapsed = Date.now() - start;
      if (elapsed > opts.budgetMs * 0.65) break;
    }
  } catch (err) {
    if (!(err instanceof TimeUp)) throw err;
  }
  let chosen = searcher.bestMoveAtRoot;
  if (searcher.tiesAtRoot.length > 1) {
    if (opts.difficulty === "easy") {
      chosen = pickRandom(searcher.tiesAtRoot);
    } else {
      let bestPurpose = -Infinity;
      const best: Move[] = [];
      for (const t of searcher.tiesAtRoot) {
        const p = purposeBonus(state, t);
        if (p > bestPurpose) { bestPurpose = p; best.length = 0; best.push(t); }
        else if (p === bestPurpose) best.push(t);
      }
      chosen = best.length > 1 ? pickRandom(best) : best[0];
    }
  }
  if (opts.difficulty === "easy" && chosen && Math.random() < 0.25) {
    const all = allLegalMoves(state);
    if (all.length > 1) chosen = pickRandom(all);
  }
  if (chosen && opts.difficulty !== "easy" && searcher.rootScores.length > 1) {
    const chosenSee = seeMove(state, chosen);
    if (chosenSee <= -150) {
      const tolerance = Math.min(220, -chosenSee + 60);
      let safest: { move: Move; score: number; see: number } | null = null;
      for (const r of searcher.rootScores) {
        if (sameMove(r.move, chosen)) continue;
        if (r.score < searcher.bestScoreAtRoot - tolerance) continue;
        const see = seeMove(state, r.move);
        if (see < -25) continue;
        if (!safest || see > safest.see || (see === safest.see && r.score > safest.score)) {
          safest = { move: r.move, score: r.score, see };
        }
      }
      if (safest) chosen = safest.move;
    }
  }
  if (chosen && opts.difficulty !== "easy" && searcher.rootScores.length > 1) {
    const chosenSee = seeMove(state, chosen);
    const chosenGain = Math.max(0, chosenSee);
    const NOISE = 40;
    let bestGrab: { move: Move; score: number; gain: number } | null = null;
    for (const r of searcher.rootScores) {
      if (sameMove(r.move, chosen)) continue;
      if (!r.move.captured && !r.move.juggTrampled?.length) continue;
      const gain = seeMove(state, r.move);
      if (gain < 0) continue;
      if (gain <= chosenGain + 50) continue;
      if (r.score < searcher.bestScoreAtRoot - NOISE) continue;
      if (!bestGrab || gain > bestGrab.gain ||
          (gain === bestGrab.gain && r.score > bestGrab.score)) {
        bestGrab = { move: r.move, score: r.score, gain };
      }
    }
    if (bestGrab) chosen = bestGrab.move;
  }

  // Sanitise mate scores so the debug panel shows a finite number.
  let displayScore = searcher.bestScoreAtRoot;
  if (!Number.isFinite(displayScore)) displayScore = 0;
  if (Math.abs(displayScore) > MATE_THRESHOLD) {
    // Already in mate range — leave as is, the UI formats it.
  }

  const pv = tt && !searcher.ttDisabled ? reconstructPV(tt, state, rootKey, salt) : [];

  return {
    move: chosen,
    depthReached,
    score: displayScore,
    nodes: searcher.nodes,
    elapsedMs: Date.now() - start,
    tt: tt ? tt.stats() : { hits: 0, stores: 0, cutoffs: 0, collisions: 0, fillPct: 0, size: 0 },
    zobristFailed: searcher.zobristFailed,
    pv,
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
  return {
    budgetMs: Math.round(6000 * sizePenalty * branchPenalty),
    maxDepth: heavyBranching ? 6 : area > 100 ? 6 : 8,
  };
}
