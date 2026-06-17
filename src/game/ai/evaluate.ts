import type { Board, Color, GameState, PieceDef, PieceId } from "../types";

const BASE_VALUES: Record<string, number> = {
  K: 20000, Q: 900, R: 500, B: 330, N: 320, P: 100,
  H: 280, A: 350, D: 850, X: 50,
};

function valueFor(id: PieceId, def: PieceDef | undefined): number {
  if (BASE_VALUES[id] != null) return BASE_VALUES[id];
  if (!def) return 100;
  // Compute a rough value: slides count more than leaps.
  let v = 100;
  if (def.royal) v += 5000;
  const slides = def.movement?.slides?.length ?? 0;
  const leaps = def.movement?.leaps?.length ?? 0;
  v += slides * 80 + leaps * 30;
  return v;
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
      if (def?.special === "pawn") {
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
  return score;
}

export { valueFor };
