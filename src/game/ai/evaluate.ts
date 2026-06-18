import type { Board, Color, GameState, PieceDef, PieceId } from "../types";
import { isSquareAttacked } from "../moves";
import { getActivePlaybook } from "./playbook";
import { getPiecePoints } from "../pieceValue";



/**
 * Precomputed Assassin reach: every (Δrow, Δcol) end-square reachable in
 * exactly 3 king-steps under the engine's rules.
 */
const ASSASSIN_REACH: Array<[number, number]> = (() => {
  const DIRS_8: Array<[number, number]> = [
    [-1, 0], [-1, 1], [0, 1], [1, 1],
    [1, 0], [1, -1], [0, -1], [-1, -1],
  ];
  const turnOK = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return d <= 1 || d === 7;
  };
  const out = new Set<string>();
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (!turnOK(i, j)) continue;
      for (let k = 0; k < 8; k++) {
        if (!turnOK(j, k)) continue;
        if (i === j && j === k) continue;
        const [dr1, dc1] = DIRS_8[i];
        const [dr2, dc2] = DIRS_8[j];
        const [dr3, dc3] = DIRS_8[k];
        const p1 = `${dr1},${dc1}`;
        const p2 = `${dr1 + dr2},${dc1 + dc2}`;
        const p3 = `${dr1 + dr2 + dr3},${dc1 + dc2 + dc3}`;
        const path = new Set(["0,0", p1, p2, p3]);
        if (path.size !== 4) continue;
        const fr = dr1 + dr2 + dr3, fc = dc1 + dc2 + dc3;
        if (Math.max(Math.abs(fr), Math.abs(fc)) <= 1) continue;
        out.add(p3);
      }
    }
  }
  return Array.from(out, (s) => s.split(",").map(Number) as [number, number]);
})();


const PAWN_UNIT = 100;
const ROYAL_BONUS = 20000; // cp — loss-of-royal must dominate everything.

/**
 * Centipawn value used by the AI. Delegates to the canonical pieceValue.ts
 * table (built-ins) or estimator (custom pieces), scaled by any learned
 * per-piece multiplier, plus a flat royal bump.
 */
export function valueFor(id: PieceId, def: PieceDef | undefined): number {
  const pb = getActivePlaybook();
  const mult = pb.pieceValueMultipliers[id] ?? 1;
  const pts = getPiecePoints(id, def);
  let cp = pts * PAWN_UNIT * mult;
  if (def?.royal) cp += ROYAL_BONUS;
  return cp;
}


function inB(board: Board, r: number, c: number): boolean {
  return r >= 0 && r < board.length && c >= 0 && c < board[0].length;
}

const ALL_8: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Per-piece positional / tactical bonuses for our custom pieces. Computed
 * cheaply so it can be called inside the search.
 */
function dynamicBonus(state: GameState, color: Color): number {
  const board = state.board;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const opp: Color = color === "w" ? "b" : "w";
  let bonus = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      const def = state.registry[p.id];
      if (!def) continue;

      switch (def.special) {
        case "dragon": {
          // Strike threats: orthogonal or diagonal at distance 1 or 2
          // (NOT knight-style). Distance-2 lines are blocked by an intervening piece.
          let threatVal = 0;
          let supportCount = 0;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              if (dr === 0 && dc === 0) continue;
              const isOrth = dr === 0 || dc === 0;
              const isDiag = Math.abs(dr) === Math.abs(dc);
              if (!isOrth && !isDiag) continue;
              const nr = r + dr, nc = c + dc;
              if (!inB(board, nr, nc)) continue;
              const dist = Math.max(Math.abs(dr), Math.abs(dc));
              if (dist === 2) {
                const midR = r + dr / 2, midC = c + dc / 2;
                if (board[midR][midC]) continue; // blocked
              }
              const t = board[nr][nc];
              if (!t) continue;
              if (t.color === opp) {
                threatVal += valueFor(t.id, state.registry[t.id]) * 0.18;
              } else if (dist === 1) {
                supportCount += 1;
              }
            }
          }
          bonus += threatVal + supportCount * 6;
          break;
        }
        case "wizard": {
          // Count reachable targets: bishop slides + 2-step orthogonal slides.
          let targets = 0;
          let networkSize = 0;
          for (const [dr, dc] of ALL_8) {
            const isOrtho = dr === 0 || dc === 0;
            const step = isOrtho ? 2 : 1;
            let nr = r + dr * step, nc = c + dc * step;
            for (let k = 0; k < 6; k++) {
              if (!inB(board, nr, nc)) break;
              const t = board[nr][nc];
              if (!t) { networkSize += 1; }
              else if (t.color === color) break;
              else { targets += 1; break; }
              nr += dr * step; nc += dc * step;
            }
          }
          bonus += targets * 12 + networkSize * 1.5;
          break;
        }
        case "necromancer": {
          // Corpse-based scoring: the Necromancer is non-combat. Its power is
          // proximity to valuable corpses (friendly recovery + enemy stealing).
          const corpses = state.corpses ?? [];
          let nearbyValue = 0;
          let bestNearby = 0;
          let mapValue = 0;
          for (const cp of corpses) {
            const cdef = state.registry[cp.pieceId];
            if (!cdef) continue;
            if (cdef.special === "juggernaut" || cdef.immobile) continue;
            // Can't raise onto an occupied square.
            if (board[cp.square.r][cp.square.c]) continue;
            const v = valueFor(cp.pieceId, cdef);
            // Stealing an enemy corpse is even sweeter (we gain + they lose
            // the chance to get them back).
            const ownBonus = cp.originalOwner !== color ? 1.25 : 1.0;
            const adj = Math.max(Math.abs(cp.square.r - r), Math.abs(cp.square.c - c));
            mapValue += v * 0.04 * ownBonus;
            if (adj <= 1) {
              // Can resurrect right now — count nearly the full piece value.
              nearbyValue += v * 0.7 * ownBonus;
              if (v * ownBonus > bestNearby) bestNearby = v * ownBonus;
            } else {
              // Reward closing the distance; falls off with Chebyshev distance.
              nearbyValue += (v * ownBonus) / (adj * adj + 4);
            }
          }
          bonus += Math.min(nearbyValue, 1200) + Math.min(mapValue, 400);
          bonus += bestNearby * 0.05;
          // Penalty: enemy attackers next to the necromancer (it's fragile and
          // cannot defend itself).
          let enemyAdj = 0;
          for (const [dr, dc] of ALL_8) {
            const nr = r + dr, nc = c + dc;
            if (!inB(board, nr, nc)) continue;
            const t = board[nr][nc];
            if (t && t.color === opp) enemyAdj += 1;
          }
          bonus -= enemyAdj * 35;
          break;
        }
        case "portal": {
          // More valuable when there are friendlies worth repositioning, and
          // when empty squares exist on the board for tactical swaps.
          let friendlyValue = 0;
          for (let rr = 0; rr < rows; rr++) {
            for (let cc = 0; cc < cols; cc++) {
              const t = board[rr][cc];
              if (!t || t.color !== color) continue;
              if (t.id === "T" || t.id === "J") continue;
              friendlyValue += valueFor(t.id, state.registry[t.id]);
            }
          }
          bonus += Math.min(friendlyValue * 0.015, 120);
          break;
        }
        case "juggernaut": {
          // Scan its forward lane; reward open lanes & high-value enemies in path.
          const wide = cols > rows;
          const dir = color === "w" ? 1 : -1;
          const stepDr = wide ? 0 : dir;
          const stepDc = wide ? dir : 0;
          let laneOpen = 0;
          let enemyInPath = 0;
          let blockedByFriendly = false;
          for (let s = 1; s <= 5; s++) {
            const nr = r + s * stepDr, nc = c + s * stepDc;
            if (!inB(board, nr, nc)) break;
            const t = board[nr][nc];
            if (!t) { laneOpen += 1; continue; }
            if (t.color === color) { blockedByFriendly = true; break; }
            enemyInPath += valueFor(t.id, state.registry[t.id]) * 0.2;
            break; // first enemy is what charging actually trades into
          }
          bonus += laneOpen * 6 + enemyInPath;
          if (blockedByFriendly) bonus -= 30;
          // Edge-trapped (no sideways shift room) penalty.
          const perp = wide ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
          let canShift = false;
          for (const [dr, dc] of perp) {
            const nr = r + dr, nc = c + dc;
            if (inB(board, nr, nc) && !board[nr][nc]) { canShift = true; break; }
          }
          if (!canShift && laneOpen === 0) bonus -= 25;
          break;
        }
        case "assassin": {
          // 3-step king-walker with ≤45° turn-rate constraint. Score nearby
          // enemies sitting on actually-reachable end squares, weighted by
          // value and how deep in their own half they're sitting.
          let threatVal = 0;
          for (const [dr, dc] of ASSASSIN_REACH) {
            const nr = r + dr, nc = c + dc;
            if (!inB(board, nr, nc)) continue;
            const t = board[nr][nc];
            if (!t || t.color !== opp) continue;
            const v = valueFor(t.id, state.registry[t.id]);
            const backRow = opp === "w" ? 0 : rows - 1;
            const distFromBack = Math.abs(nr - backRow);
            const backWeight = 1 + Math.max(0, (rows / 2 - distFromBack)) * 0.05;
            const cheb = Math.max(Math.abs(dr), Math.abs(dc));
            const distBoost = cheb === 1 ? 0.14 : cheb === 2 ? 0.11 : 0.07;
            threatVal += v * distBoost * backWeight;
          }
          bonus += threatVal;
          break;
        }


        default:
          break;
      }

      // Archer dynamic bonus (uses leaps offsets-style detection on id).
      if (p.id === "A") {
        let multiThreat = 0;
        let adjacentEnemies = 0;
        // Diagonal-only line scan at range 2 and 3 (Archer's actual attack pattern).
        const DIAG_4: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dr, dc] of DIAG_4) {
          for (const k of [2, 3]) {
            const nr = r + dr * k, nc = c + dc * k;
            if (!inB(board, nr, nc)) continue;
            const t = board[nr][nc];
            if (t && t.color === opp) {
              multiThreat += valueFor(t.id, state.registry[t.id]) * 0.14;
            }
          }
        }
        for (const [dr, dc] of ALL_8) {
          const nr = r + dr, nc = c + dc;
          if (!inB(board, nr, nc)) continue;
          const t = board[nr][nc];
          if (t && t.color === opp) adjacentEnemies += 1;
        }
        // Protected by a friendly neighbour?
        let protectedByFriend = 0;
        for (const [dr, dc] of ALL_8) {
          const nr = r + dr, nc = c + dc;
          if (!inB(board, nr, nc)) continue;
          const t = board[nr][nc];
          if (t && t.color === color) { protectedByFriend = 1; break; }
        }
        bonus += multiThreat + protectedByFriend * 18 - adjacentEnemies * 22;
      }
    }
  }
  return bonus;
}

export function evaluate(state: GameState, toMove: Color): number {
  let score = 0;
  const board: Board = state.board;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p) continue;
      const def = state.registry[p.id];
      let v = valueFor(p.id, def);
      const centerDist = Math.abs(r - cr) + Math.abs(c - cc);
      v += Math.max(0, ((rows + cols) / 2 - centerDist)) * 2;
      if (def?.special === "pawn" || def?.special === "shapeshifter") {
        if (cols > rows) {
          v += p.color === "w" ? c * 6 : (cols - 1 - c) * 6;
        } else {
          v += p.color === "w" ? r * 6 : (rows - 1 - r) * 6;
        }
      }
      score += p.color === toMove ? v : -v;
    }
  }
  // Reserves: small value for keeping drops.
  for (const color of ["w", "b"] as const) {
    for (const id of Object.keys(state.reserves[color])) {
      const count = state.reserves[color][id];
      if (!count) continue;
      const v = valueFor(id, state.registry[id]) * 0.5 * count;
      score += color === toMove ? v : -v;
    }
  }
  // Dynamic, piece-specific tactical bonuses.
  score += dynamicBonus(state, toMove);
  score -= dynamicBonus(state, toMove === "w" ? "b" : "w");
  // Hanging-piece penalty, scaled by the learned caution multiplier.
  const pb = getActivePlaybook();
  score += hangingTerm(state, toMove) * pb.cautionMultiplier;
  score -= hangingTerm(state, toMove === "w" ? "b" : "w") * pb.cautionMultiplier;
  // Threats we can execute on our next move — pushes the AI to actually take
  // free/winning pieces the opponent left available.
  score += threatTerm(state, toMove);
  score -= threatTerm(state, toMove === "w" ? "b" : "w");
  // PRINCIPLE #1 & #2: royal protection / royal attack. Dominant term for
  // king-capture games — outweighs ordinary material trades by design.
  score += kingSafetyTerm(state, toMove);
  score -= kingSafetyTerm(state, toMove === "w" ? "b" : "w");
  // PRINCIPLE #6 & #10: advance toward enemy royal, develop minor pieces
  // off the back rank in the opening.
  score += positionalTerm(state, toMove);
  score -= positionalTerm(state, toMove === "w" ? "b" : "w");
  // Learned tactical squares — defend the ones the AI lost to last game.
  score += squareControlTerm(state, toMove, pb.squareDefenseBonuses);
  // Anti-shuffle: discourage repeatedly moving the same piece without capturing.
  score += shuffleTerm(state, toMove);
  score -= shuffleTerm(state, toMove === "w" ? "b" : "w");
  return score;
}

/**
 * PRINCIPLE #1 — King safety (dominant). For each of `color`'s royal pieces:
 *   - Massive penalty if the royal square itself is attacked (we're in check).
 *   - Penalty per enemy-attacked square in the king's 3x3 zone, quadratic so
 *     multiple attackers compound (real mating-net pressure).
 *   - Bonus per friendly defender and per pawn/barricade shield in front.
 * PRINCIPLE #2 — Royal attack. Symmetric reward for the same pressure on the
 * opponent's royal, slightly attenuated so we don't sacrifice our own king to
 * threaten theirs. This is how the AI sees forcing checks and mate threats
 * BEFORE the capture actually happens at the leaf of search.
 */
function kingSafetyTerm(state: GameState, color: Color): number {
  const board = state.board;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const opp: Color = color === "w" ? "b" : "w";
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p) continue;
      const def = state.registry[p.id];
      if (!def?.royal) continue;
      const isOurs = p.color === color;
      const enemySide: Color = isOurs ? opp : color;
      const allySide: Color = isOurs ? color : opp;
      const royalAttacked = isSquareAttacked(state, { r, c }, enemySide);
      let zoneAttacks = 0;
      let defenders = 0;
      let shield = 0;
      const forwardDr = p.color === "w" ? 1 : -1;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (!inB(board, nr, nc)) continue;
          if (isSquareAttacked(state, { r: nr, c: nc }, enemySide)) zoneAttacks += 1;
          const t = board[nr][nc];
          if (!t) continue;
          if (t.color === allySide) {
            defenders += 1;
            if (dr === forwardDr) {
              const tdef = state.registry[t.id];
              if (tdef?.special === "pawn" || tdef?.special === "shapeshifter" || t.id === "X") shield += 1;
            }
          }
        }
      }
      const pressure = zoneAttacks * zoneAttacks * 18 - defenders * 14 - shield * 10;
      const directHit = royalAttacked ? 250 : 0;
      const severity = pressure + directHit;
      if (isOurs) total -= severity;
      else total += severity * 0.75;
    }
  }
  return total;
}

/**
 * PRINCIPLE #6 / #10 — control and development. Small advancement bonus for
 * pieces past the halfway line, and an opening-phase penalty for minor pieces
 * still parked on their starting back rank (encourages developing knights,
 * bishops, archers, wizards before launching attacks).
 */
function positionalTerm(state: GameState, color: Color): number {
  const board = state.board;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const wide = cols > rows;
  const opening = (state.history?.length ?? 0) < 16;
  const backRank = color === "w" ? 0 : (wide ? cols - 1 : rows - 1);
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      const def = state.registry[p.id];
      if (!def || def.royal || def.immobile) continue;
      const axis = wide ? c : r;
      const len = wide ? cols : rows;
      const forward = color === "w" ? axis : (len - 1 - axis);
      const halfway = len / 2;
      if (forward > halfway) total += Math.min(20, (forward - halfway) * 4);
      if (opening) {
        const onBack = (wide ? c : r) === backRank;
        const isMinor = p.id === "N" || p.id === "B" || p.id === "A" || p.id === "W";
        if (onBack && isMinor) total -= 18;
      }
    }
  }
  return total;
}

/**
 * Sum of (a fraction of) each enemy piece value that `color` currently
 * attacks where it would win material on capture (attacker cheaper than
 * victim, OR victim is undefended). Cheap heuristic — close enough to push
 * the search toward grabbing hanging pieces.
 */
function threatTerm(state: GameState, color: Color): number {
  const board = state.board;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const opp: Color = color === "w" ? "b" : "w";
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p || p.color !== opp) continue;
      const def = state.registry[p.id];
      if (def?.immobile) continue;
      // Is the enemy piece attacked by us?
      if (!isSquareAttacked(state, { r, c }, color)) continue;
      const victim = valueFor(p.id, def);
      // Defended? Then it's a trade — only counts if their defenders are
      // worth more than the cheapest attacker available; approximate by
      // calling it "half value" instead of doing a full SEE here.
      const defended = isSquareAttacked(state, { r, c }, opp);
      total += defended ? victim * 0.08 : victim * 0.35;
    }
  }
  return total;
}

/**
 * Penalize the side whose recent quiet moves chain through the same piece.
 * Mirrors the move-ordering bonus so deep search also avoids Dragon shuffling.
 */
function shuffleTerm(state: GameState, color: Color): number {
  const h = state.history;
  if (!h || h.length < 2) return 0;
  const start = Math.max(0, h.length - 6);
  // Walk back through this side's recent quiet moves, chaining piece-by-piece.
  let chasing: { r: number; c: number } | null = null;
  let chain = 0;
  let special: string | undefined;
  for (let i = h.length - 1; i >= start; i--) {
    const m = h[i];
    if (m.piece.color !== color) continue;
    if (m.captured) break;
    if (chasing === null) {
      chasing = m.to;
      chain = 1;
      special = state.registry[m.piece.id]?.special;
      continue;
    }
    if (m.to.r === chasing.r && m.to.c === chasing.c) {
      chain += 1;
      chasing = m.from;
      if (!chasing) break;
    }
  }
  if (chain < 2) return 0;
  const weight =
    special === "dragon" || special === "portal" || special === "necromancer" || special === "wizard" ? 70 : 30;
  return -(chain - 1) * weight;
}

/** Convert "g12" → {r:11, c:6}. Returns null on parse failure / out of bounds. */
function parseAlg(sq: string, rows: number, cols: number): { r: number; c: number } | null {
  const m = /^([a-l])(\d{1,2})$/i.exec(sq);
  if (!m) return null;
  const c = m[1].toLowerCase().charCodeAt(0) - 97;
  const r = parseInt(m[2], 10) - 1;
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  return { r, c };
}

/** Reward `color` for defending each square in `bonuses`, penalise when the
 *  opponent attacks it undefended. Symmetric on the eval side so both branches
 *  of search use it consistently. */
function squareControlTerm(state: GameState, color: Color, bonuses: Record<string, number>): number {
  const keys = Object.keys(bonuses);
  if (keys.length === 0) return 0;
  const rows = state.board.length;
  const cols = state.board[0]?.length ?? 0;
  const opp: Color = color === "w" ? "b" : "w";
  let total = 0;
  for (const k of keys) {
    const w = bonuses[k];
    if (!w) continue;
    const sq = parseAlg(k, rows, cols);
    if (!sq) continue;
    const usDefends = isSquareAttacked(state, sq, color);
    const oppAttacks = isSquareAttacked(state, sq, opp);
    if (usDefends) total += w;
    if (oppAttacks && !usDefends) total -= w * 2;
  }
  return total;
}


/**
 * Approximate the static-exchange "hanging" value of each piece of `color`.
 * Covers every piece (even pawns/archers) so the AI stops blundering small
 * material into defended squares — pawns add up.
 */
function hangingTerm(state: GameState, color: Color): number {
  const board = state.board;
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const opp: Color = color === "w" ? "b" : "w";
  let penalty = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      const def = state.registry[p.id];
      if (def?.immobile) continue; // Prism / Barricade-style fixtures
      if (def?.special === "juggernaut") continue; // huge & special-cased
      const v = valueFor(p.id, def);
      if (v < 50) continue;
      const attacked = isSquareAttacked(state, { r, c }, opp);
      if (!attacked) continue;
      // Test "defended" by temporarily flipping the resident piece's colour so
      // friendly attackers (which can't normally target their own square) show
      // up as recapturers.
      const saved = board[r][c];
      board[r][c] = { id: p.id, color: opp };
      const defended = isSquareAttacked(state, { r, c }, color);
      board[r][c] = saved;
      penalty -= defended ? v * 0.25 : v * 0.9;
    }
  }
  return penalty;
}
