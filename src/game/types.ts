export type Color = "w" | "b";
export type PieceType = "K" | "R" | "B" | "N" | "P";

export interface Piece {
  type: PieceType;
  color: Color;
}

// Board is row-major: board[row][col]. row 0 = White back rank, row 4 = Black back rank.
export type Board = (Piece | null)[][];

export interface Square {
  r: number;
  c: number;
}

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece | null;
  promotion?: "R" | "N" | "B";
}

export interface GameState {
  board: Board;
  turn: Color;
  history: Move[];
  // captured pieces, keyed by capturer color
  captured: { w: Piece[]; b: Piece[] };
}

export const BOARD_SIZE = 5;

export type Difficulty = "easy" | "medium" | "hard";
