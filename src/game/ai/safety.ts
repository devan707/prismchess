/**
 * Root-level Move Safety Gate.
 *
 * Forensic audits showed the engine's many tactical systems are all
 * score-shifts — none of them actually *prevent* a bad root move. This
 * module adds a deterministic, post-search gate that asks the question
 * regular score terms never reliably answer:
 *
 *   "If I play this move, what is the worst obvious thing my opponent
 *    can do to me in immediate reply?"
 *
 * The gate computes a simple material-swing per candidate (our SEE gain
 * minus opponent's best obvious next-move capture / archer shot / jugg
 * trample / royal capture), then picks the candidate with the best
 * (engine score adjusted by donation penalty). It replaces the old
 * "safest swap" / "best grab" passes, which used overly-conservative
 * thresholds and let the engine donate pieces inside the noise floor.
 *
 * This is intentionally NOT a deep tactical solver. It is the floor of
 * basic competence: don't move into capture, don't ignore free pieces.
 */
import type { GameState, Move } from "../types";
import { allLegalMoves, applyMoveToState, inCheck } from "../moves";
import { seeMove, valueFor } from "./evaluate";

export interface CandidateAnalysis {
  move: Move;
  /** Raw search score from the alpha-beta root iteration. */
  score: number;
  /** SEE gain of this move clamped at 0 (negative gains are "donations"). */
  ourGain: number;
  /** Material the opponent can immediately win on reply. */
  oppGain: number;
  /** True if the opponent's best reply captures our royal. */
  oppRoyalThreat: boolean;
  /** True if this move directly threatens the enemy royal next ply. */
  givesCheck: boolean;
  /** ourGain - oppGain. Negative = net material loss. */
  materialNet: number;
  /** Final composite score used to choose between candidates. */
  adjusted: number;
  /** Marked true if the gate considered this move a donation. */
  rejected: boolean;
  rejectReason?: string;
  selected: boolean;
}

/** Material `from` would gain from this single (already legal) move,
 *  accounting for variant special captures the regular SEE skips. */
function moveMaterialGain(state: GameState, m: Move): { gain: number; royalCapture: boolean } {
  let royalCapture = false;
  let gain = 0;
  // Royal capture: the existence of such a move is an instant game win.
  if (m.captured) {
    const cdef = state.registry[m.captured.id];
    if (cdef?.royal) royalCapture = true;
  }
  if (m.kind === "archerShoot") {
    // Archer doesn't move — the shot is a free material gain.
    if (m.captured) gain = valueFor(m.captured.id, state.registry[m.captured.id]);
  } else if (m.juggTrampled && m.juggTrampled.length) {
    // Juggernaut trample: sum the values of all squashed pieces.
    let g = 0;
    for (const p of m.juggTrampled) g += valueFor(p.id, state.registry[p.id]);
    if (m.captured) g += valueFor(m.captured.id, state.registry[m.captured.id]);
    gain = g;
  } else if (m.kind === "necroRaise" || m.kind === "resurrect") {
    // Raising a friendly corpse is roughly worth the raised piece's value.
    const raisedId = m.promotion ?? m.piece.id;
    gain = valueFor(raisedId, state.registry[raisedId]) * 0.85;
  } else if (m.kind === "portalSwap") {
    // Hard to value generically; treat as neutral here. The gate is
    // conservative — we only want OBVIOUS punishments to fire.
    gain = 0;
  } else if (m.captured) {
    gain = seeMove(state, m);
  }
  return { gain, royalCapture };
}

/** Best obvious material the side-to-move in `state` can win in one
 *  reply move. Looks at captures, archer shots, juggernaut tramples,
 *  necromancer raises and royal captures. Cheap (single ply). */
export function opponentBestGain(state: GameState): { gain: number; royalCapture: boolean; bestMove: Move | null } {
  const moves = allLegalMoves(state);
  let best = 0;
  let royal = false;
  let bestMove: Move | null = null;
  for (const m of moves) {
    const { gain, royalCapture } = moveMaterialGain(state, m);
    if (royalCapture) {
      // Royal capture dwarfs everything; flag and use a sentinel value.
      royal = true;
      if (best < 30_000) { best = 30_000; bestMove = m; }
      continue;
    }
    if (gain > best) { best = gain; bestMove = m; }
  }
  return { gain: best, royalCapture: royal, bestMove };
}

export interface SafetyGateInput {
  state: GameState;
  /** All rootScores from search (we sort + slice internally). */
  scored: Array<{ move: Move; score: number }>;
  bestScoreAtRoot: number;
  /** Max candidates to deeply analyse — keep small for perf. */
  topN?: number;
  /** Engine-recognised mate score threshold; moves above this skip the gate. */
  mateThreshold: number;
}

export interface SafetyGateResult {
  chosen: Move | null;
  candidates: CandidateAnalysis[];
}

/**
 * Run the safety gate. Returns the candidate the engine should actually
 * play and a per-candidate breakdown for the debug panel.
 *
 * Selection rule:
 *   adjusted = score
 *     - max(0, oppGain - max(0, ourGain)) * 3      // donation penalty
 *     + max(0, ourGain - oppGain) * 0.4            // mild material reward
 *     + (givesCheck ? 30 : 0)                      // tiebreak
 *   Then pick max(adjusted).
 *
 * Donation penalty coefficient 3 is calibrated so a 200cp donation
 * (typical minor-piece hang) easily overwhelms the largest realistic
 * positional/development bonus inside `evaluate`.
 */
export function runSafetyGate(input: SafetyGateInput): SafetyGateResult {
  const { state, scored, mateThreshold } = input;
  const topN = input.topN ?? 16;
  if (scored.length === 0) return { chosen: null, candidates: [] };

  const sorted = scored.slice().sort((a, b) => b.score - a.score).slice(0, topN);
  const candidates: CandidateAnalysis[] = [];

  for (const r of sorted) {
    const ourSee = seeMove(state, r.move);
    // For non-standard moves (drops/raises/etc), seeMove returns 0. Use the
    // gain heuristic for those so juggernaut/raise moves don't look like
    // donations just because SEE punted.
    const { gain: ourGainRaw } = moveMaterialGain(state, r.move);
    const ourGain = Math.max(0, Math.max(ourSee, ourGainRaw));

    let oppGain = 0;
    let oppRoyalThreat = false;
    let givesCheck = false;

    // Don't bother on mate scores — engine already proved a forced win.
    if (Math.abs(r.score) < mateThreshold - 1000) {
      const next = applyMoveToState(state, r.move);
      givesCheck = inCheck(next, next.turn);
      const opp = opponentBestGain(next);
      oppGain = opp.gain;
      oppRoyalThreat = opp.royalCapture;
    }

    const materialNet = ourGain - oppGain;
    const donationPenalty = oppGain > ourGain ? (oppGain - ourGain) * 3 : 0;
    const materialReward = ourGain > oppGain ? (ourGain - oppGain) * 0.4 : 0;
    const checkBonus = givesCheck ? 30 : 0;
    // Treat a royal threat against us as a catastrophic donation, but
    // only when our move isn't itself a mating/royal-winning move.
    const royalPenalty = oppRoyalThreat ? 50_000 : 0;
    const adjusted = r.score - donationPenalty + materialReward + checkBonus - royalPenalty;

    candidates.push({
      move: r.move,
      score: r.score,
      ourGain,
      oppGain,
      oppRoyalThreat,
      givesCheck,
      materialNet,
      adjusted,
      rejected: donationPenalty > 75 || oppRoyalThreat,
      rejectReason: oppRoyalThreat
        ? "opp captures royal"
        : donationPenalty > 75
          ? `opp wins ${Math.round(oppGain - ourGain)}cp`
          : undefined,
      selected: false,
    });
  }

  // Pick the highest adjusted score. If every candidate is "rejected"
  // (rare — all moves lose material), we still pick the least bad one.
  let bestIdx = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].adjusted > candidates[bestIdx].adjusted) bestIdx = i;
  }
  candidates[bestIdx].rejected = false;
  candidates[bestIdx].rejectReason = undefined;
  candidates[bestIdx].selected = true;
  return { chosen: candidates[bestIdx].move, candidates };
}
