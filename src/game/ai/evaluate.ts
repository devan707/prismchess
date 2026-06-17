import type { Board, Color } from "../types";

const VALUES: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

export function evaluate(board: Board, toMove: Color): number {
  let score = 0;
  const n = board.length;
  const center = (n - 1) / 2;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (!p) continue;
      let v = VALUES[p.type] ?? 0;
      const centerDist = Math.abs(r - center) + Math.abs(c - center);
      v += Math.max(0, (n - centerDist)) * 2;
      if (p.type === "P") {
        v += p.color === "w" ? r * 6 : (n - 1 - r) * 6;
      }
      score += p.color === toMove ? v : -v;
    }
  }
  return score;
}
