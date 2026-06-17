import { BOARD_SIZE, type Board, type Color } from "../types";

const VALUES: Record<string, number> = { P: 100, N: 320, B: 330, K: 20000 };

export function evaluate(board: Board, toMove: Color): number {
  let score = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      let v = VALUES[p.type];
      // small center bonus
      const centerDist = Math.abs(r - 2) + Math.abs(c - 2);
      v += (4 - centerDist) * 2;
      // pawn advancement
      if (p.type === "P") {
        v += p.color === "w" ? r * 6 : (BOARD_SIZE - 1 - r) * 6;
      }
      score += p.color === toMove ? v : -v;
    }
  }
  return score;
}
