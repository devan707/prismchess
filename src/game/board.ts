import { type Board, type GameState, type Piece, type Square, type Variant, VARIANTS, DEFAULT_VARIANT_ID } from "./types";

export function emptyBoard(size: number): Board {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null as Piece | null),
  );
}

export function initialBoard(variant: Variant): Board {
  const size = variant.size;
  const b = emptyBoard(size);
  for (let c = 0; c < size; c++) {
    b[0][c] = { type: variant.backRank[c], color: "w" };
    b[1][c] = { type: "P", color: "w" };
    b[size - 2][c] = { type: "P", color: "b" };
    b[size - 1][c] = { type: variant.backRank[c], color: "b" };
  }
  return b;
}

export function initialState(variantId: string = DEFAULT_VARIANT_ID): GameState {
  const variant = VARIANTS[variantId] ?? VARIANTS[DEFAULT_VARIANT_ID];
  return {
    board: initialBoard(variant),
    turn: "w",
    history: [],
    captured: { w: [], b: [] },
  };
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

export function boardSize(board: Board): number {
  return board.length;
}

export function inBoardBounds(board: Board, s: Square): boolean {
  const n = board.length;
  return s.r >= 0 && s.r < n && s.c >= 0 && s.c < n;
}

export function squareEq(a: Square, b: Square): boolean {
  return a.r === b.r && a.c === b.c;
}

export function squareKey(s: Square): string {
  return `${s.r},${s.c}`;
}

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export function squareName(s: Square): string {
  return `${FILES[s.c]}${s.r + 1}`;
}

export function findKing(board: Board, color: "w" | "b"): Square | null {
  const n = board.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (p && p.type === "K" && p.color === color) return { r, c };
    }
  }
  return null;
}
