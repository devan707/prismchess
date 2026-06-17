import { BOARD_SIZE, type Board, type GameState, type Piece, type Square } from "./types";

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null as Piece | null),
  );
}

export function initialBoard(): Board {
  const b = emptyBoard();
  const back: Piece["type"][] = ["B", "N", "K", "N", "B"];
  for (let c = 0; c < BOARD_SIZE; c++) {
    b[0][c] = { type: back[c], color: "w" };
    b[1][c] = { type: "P", color: "w" };
    b[3][c] = { type: "P", color: "b" };
    b[4][c] = { type: back[c], color: "b" };
  }
  return b;
}

export function initialState(): GameState {
  return {
    board: initialBoard(),
    turn: "w",
    history: [],
    captured: { w: [], b: [] },
  };
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

export function inBounds(s: Square): boolean {
  return s.r >= 0 && s.r < BOARD_SIZE && s.c >= 0 && s.c < BOARD_SIZE;
}

export function squareEq(a: Square, b: Square): boolean {
  return a.r === b.r && a.c === b.c;
}

export function squareKey(s: Square): string {
  return `${s.r},${s.c}`;
}

export const FILES = ["a", "b", "c", "d", "e"];
export function squareName(s: Square): string {
  return `${FILES[s.c]}${s.r + 1}`;
}

export function findKing(board: Board, color: "w" | "b"): Square | null {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p && p.type === "K" && p.color === color) return { r, c };
    }
  }
  return null;
}
