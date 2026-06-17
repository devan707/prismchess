import type { Board, Color, GameState, Piece, Square } from "./types";

export function emptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as Piece | null),
  );
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

export function inBounds(rows: number, cols: number, s: Square): boolean {
  return s.r >= 0 && s.r < rows && s.c >= 0 && s.c < cols;
}

export function inBoardBounds(board: Board, s: Square): boolean {
  return inBounds(board.length, board[0]?.length ?? 0, s);
}

export function squareEq(a: Square, b: Square): boolean {
  return a.r === b.r && a.c === b.c;
}

export const FILES = "abcdefghijkl";
export function squareName(s: Square): string {
  return `${FILES[s.c] ?? "?"}${s.r + 1}`;
}

export function findRoyals(state: GameState, color: Color): Square[] {
  const out: Square[] = [];
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[0].length; c++) {
      const p = state.board[r][c];
      if (p && p.color === color && state.registry[p.id]?.royal) out.push({ r, c });
    }
  }
  return out;
}
