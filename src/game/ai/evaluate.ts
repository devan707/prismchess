import type { Board, Color, GameState, PieceDef, PieceId } from "../types";

/**
 * Centralised piece values. The user-tunable values are expressed in "pawns"
 * (P=1) and scaled internally so the rest of the search can stay in centipawn
 * units. Add or override pieces here as the library grows.
 */
export const PIECE_VALUES_PAWNS: Record<string, number> = {
  K: 200,   // royal — effectively invaluable, big number keeps loss dominant
  Q: 9,
  R: 5,
  B: 3,
  N: 3,
  P: 1,
  S: 2,    // Shapeshifter Pawn
  A: 6,    // Archer
  T: 5,    // Portal
  H: 4,    // King's Hand
  Z: 6,    // Assassin
  W: 7,    // Wizard
  M: 7,    // Necromancer
  J: 8,    // Juggernaut
  D: 8,    // Dragon
  X: 0.5,  // Barricade
};

const PAWN_UNIT = 100;

export function valueFor(id: PieceId, def: PieceDef | undefined): number {
  const v = PIECE_VALUES_PAWNS[id];
  if (v != null) return v * PAWN_UNIT;
  if (!def) return PAWN_UNIT;
  // Fallback for custom pieces: rough by movement breadth.
  let est = 1;
  if (def.royal) est += 50;
  const slides = def.movement?.slides?.length ?? 0;
  const leaps = def.movement?.leaps?.length ?? 0;
  est += slides * 0.8 + leaps * 0.3;
  return est * PAWN_UNIT;
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
          // Strike threats within Chebyshev 2.
          let threatVal = 0;
          let supportCount = 0;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr, nc = c + dc;
              if (!inB(board, nr, nc)) continue;
              const t = board[nr][nc];
              if (!t) continue;
              if (t.color === opp) {
                threatVal += valueFor(t.id, state.registry[t.id]) * 0.18;
              } else if (Math.max(Math.abs(dr), Math.abs(dc)) === 1) {
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
          // Value of friendly graveyard pieces it could resurrect.
          const graveyard = state.captured[opp]; // pieces of `color` that were taken
          let graveValue = 0;
          for (const g of graveyard) {
            graveValue += valueFor(g.id, state.registry[g.id]);
          }
          // Open adjacent squares = resurrection slots.
          let openAdj = 0;
          for (const [dr, dc] of ALL_8) {
            const nr = r + dr, nc = c + dc;
            if (!inB(board, nr, nc)) continue;
            if (!board[nr][nc]) openAdj += 1;
          }
          bonus += Math.min(graveValue * 0.25, 400);
          bonus += openAdj * (graveyard.length > 0 ? 8 : 1);
          // Penalty: enemy attackers next to the necromancer (it's fragile).
          let enemyAdj = 0;
          for (const [dr, dc] of ALL_8) {
            const nr = r + dr, nc = c + dc;
            if (!inB(board, nr, nc)) continue;
            const t = board[nr][nc];
            if (t && t.color === opp) enemyAdj += 1;
          }
          bonus -= enemyAdj * 20;
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
          for (let s = 1; s <= 6; s++) {
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
          // Looks for valuable enemies it could reach (rough: any enemy within
          // Chebyshev 4 that lies on an unblocked diagonal launch path).
          let threatVal = 0;
          for (let dr = -4; dr <= 4; dr++) {
            for (let dc = -4; dc <= 4; dc++) {
              if (dr === 0 && dc === 0) continue;
              if (Math.max(Math.abs(dr), Math.abs(dc)) > 4) continue;
              const nr = r + dr, nc = c + dc;
              if (!inB(board, nr, nc)) continue;
              const t = board[nr][nc];
              if (!t || t.color !== opp) continue;
              const v = valueFor(t.id, state.registry[t.id]);
              // Back-rank / support bonus: enemies in their own half are juicier.
              const backRow = opp === "w" ? 0 : rows - 1;
              const distFromBack = Math.abs(nr - backRow);
              const backWeight = 1 + Math.max(0, (rows / 2 - distFromBack)) * 0.05;
              threatVal += v * 0.08 * backWeight;
            }
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
        // 8-direction line scan at range 2 and 3.
        for (const [dr, dc] of ALL_8) {
          for (const k of [2, 3]) {
            const nr = r + dr * k, nc = c + dc * k;
            if (!inB(board, nr, nc)) continue;
            const t = board[nr][nc];
            if (t && t.color === opp) {
              multiThreat += valueFor(t.id, state.registry[t.id]) * 0.12;
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
  return score;
}
