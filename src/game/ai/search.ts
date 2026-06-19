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
import type { Difficulty, GameState, Move } from "../types";
import { allLegalMoves, applyMoveToState, inCheck } from "../moves";
// Note: check-giving moves are treated as "loud" via per-call computation in
// qsearch (see below) — we can't fold it into isLoud() without a state arg.
import { evaluate, seeMove, valueFor } from "./evaluate";
import { getActivePlaybook } from "./playbook";


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

/** Squares that the opponent's last move directly affected: the square the
 *  moved piece now sits on (it may have become capturable) and the square it
 *  vacated (a piece behind it may now be exposed, or our piece can slide
 *  through there to threaten / check). Used to focus tactical attention on
 *  the part of the board the opponent just touched. */
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

/** Move-ordering score. Captures by SEE (true material gain after recaptures),
 *  promotions, shape-shifts, and juggernaut trample on top. Losing captures
 *  drop below quiet moves so we don't waste depth searching them first. */
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
  // Last-move focus: bias toward replies that interact with the square the
  // opponent just moved to (capture/attack the piece they just moved) or the
  // square they just vacated (often opens a tactic / discovered attack).
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
  bestMoveAtRoot: Move | null = null;
  bestScoreAtRoot = -Infinity;
  tiesAtRoot: Move[] = [];
  /** Every root move and the score the deepest completed iteration assigned
   *  to it. Used by the blunder guard at the end of runSearch. */
  rootScores: Array<{ move: Move; score: number }> = [];
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
    for (const i of order) {
      const next = loudNexts[i];
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
    const scored: Array<{ move: Move; score: number }> = [];
    for (const m of moves) {
      const next = applyMoveToState(state, m);
      const gaveCheck = inCheck(next, next.turn);
      const ext = gaveCheck ? 1 : 0;
      const score = -this.search(next, depth - 1 + ext, -beta, -alpha, null);
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
    }
  }
}

/** Tempo / purpose score used to break root-eval ties intelligently. Higher
 *  = the move "does something" (captures, checks, threats, defense,
 *  advancement). Used so the AI never picks a pointless shuffle when a
 *  purposeful alternative scores the same. */
function purposeBonus(state: GameState, m: Move): number {
  let b = 0;
  if (m.captured) {
    const see = seeMove(state, m);
    if (see >= 0) b += 200 + see * 0.05;
  }
  if (m.promotion || m.shapeshiftTo) b += 80;
  if (m.juggTrampled && m.juggTrampled.length) b += 60;
  // Reward giving check.
  const next = applyMoveToState(state, m);
  if (inCheck(next, next.turn)) b += 60;
  // Focus on squares the opponent just touched.
  const focus = lastMoveFocus(state);
  if (focus.to && m.to.r === focus.to.r && m.to.c === focus.to.c) {
    b += m.captured ? 120 : 30;
  }
  if (focus.from && m.to.r === focus.from.r && m.to.c === focus.from.c) b += 20;
  // Forward progress (only for non-special moves with a from-square).
  if (m.from) {
    const wide = state.cols > state.rows;
    const dir = m.piece.color === "w" ? 1 : -1;
    const forwardDelta = wide ? (m.to.c - m.from.c) * dir : (m.to.r - m.from.r) * dir;
    if (forwardDelta > 0) b += Math.min(20, forwardDelta * 6);
  }
  // Penalise immediate self-repeat (just-moved-this-piece-back-and-forth).
  const h = state.history;
  if (h && h.length >= 2 && m.from) {
    const prev = h[h.length - 2]; // our previous move
    if (prev && prev.piece.color === m.piece.color && prev.to.r === m.from.r &&
        prev.to.c === m.from.c && prev.from && !m.captured) {
      b -= 120;
    }
  }
  // Cloud opening-book bias: if we're still in the book for this variant,
  // reward moves that extend a line with a good aggregate win rate.
  const pb = getActivePlaybook();
  const book = pb.openingBook;
  const scale = pb.cloudScale ?? 0;
  if (book && scale > 0 && m.to) {
    // Build the AI side's prior opening sequence (max 12 plies) from history.
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
        // Up to ~100 cp bias at full scale for a sharp winning line; minus
        // for sharply losing lines. Scaled by difficulty.
        b += Math.round((winrate - 0.5) * 200 * scale);
      }
    }
  }
  return b;
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
  // On medium / hard, break score-ties by purpose (captures, checks, threats,
  // advancement) instead of randomness — every move should "do something".
  // Easy keeps a touch of randomness so beginners can win.
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
  // Easy: 25% chance to play a random legal move so beginners can win.
  if (opts.difficulty === "easy" && chosen && Math.random() < 0.25) {
    const all = allLegalMoves(state);
    if (all.length > 1) chosen = pickRandom(all);
  }
  // Blunder guard: if the chosen move immediately hangs significant material
  // (negative SEE on the move itself, not counted in deep search because
  // hangingTerm can be smoothed away by other positional terms), look for an
  // alternative whose search score is within ~150 cp and whose SEE is safe.
  if (chosen && opts.difficulty !== "easy" && searcher.rootScores.length > 1) {
    const chosenSee = seeMove(state, chosen);
    if (chosenSee <= -150) {
      const tolerance = Math.min(220, -chosenSee + 60);
      let safest: { move: Move; score: number; see: number } | null = null;
      for (const r of searcher.rootScores) {
        if (sameMove(r.move, chosen)) continue;
        if (r.score < searcher.bestScoreAtRoot - tolerance) continue;
        const see = seeMove(state, r.move);
        if (see < -25) continue; // still a sac, keep looking
        if (!safest || see > safest.see || (see === safest.see && r.score > safest.score)) {
          safest = { move: r.move, score: r.score, see };
        }
      }
      if (safest) chosen = safest.move;
    }
  }
  // Opportunist guard: if some root move wins material outright AND the deep
  // search agrees it's a sound capture, prefer it over a quiet move that only
  // beat it on positional terms. We trust the deep search here: it already
  // accounts for recaptures, king-safety, discovered threats, and follow-ups.
  // So we only override when:
  //   - the candidate is a real capture/trample with non-negative SEE
  //     (capturing a piece without losing a more valuable one back),
  //   - the candidate's deep score is essentially as good as the chosen
  //     move's (within a small noise tolerance), and
  //   - the chosen move isn't itself a meaningfully larger capture.
  // This prevents the previous failure mode where we'd grab a "free" queen
  // that the deep search had correctly flagged as a trap (e.g. mate-in-1
  // for the opponent, lost king, larger material loss elsewhere).
  if (chosen && opts.difficulty !== "easy" && searcher.rootScores.length > 1) {
    const chosenSee = seeMove(state, chosen);
    const chosenGain = Math.max(0, chosenSee);
    // Noise tolerance — different depths / null windows produce small wobble.
    const NOISE = 40;
    let bestGrab: { move: Move; score: number; gain: number } | null = null;
    for (const r of searcher.rootScores) {
      if (sameMove(r.move, chosen)) continue;
      if (!r.move.captured && !r.move.juggTrampled?.length) continue;
      const gain = seeMove(state, r.move);
      // Must be a sound capture (SEE >= 0 — we don't lose more than we gain
      // in the immediate exchange) AND meaningfully more material than what
      // the chosen move already wins.
      if (gain < 0) continue;
      if (gain <= chosenGain + 50) continue;
      // Deep search must still rate this near the top. If it scores notably
      // worse than the chosen move, the search saw something bad (mate
      // threat, king exposure, bigger follow-up loss) — respect that.
      if (r.score < searcher.bestScoreAtRoot - NOISE) continue;
      if (!bestGrab || gain > bestGrab.gain ||
          (gain === bestGrab.gain && r.score > bestGrab.score)) {
        bestGrab = { move: r.move, score: r.score, gain };
      }
    }
    if (bestGrab) chosen = bestGrab.move;
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
