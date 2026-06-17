export type Color = "w" | "b";
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";

export interface Piece {
  type: PieceType;
  color: Color;
}

// Board is row-major: board[row][col]. row 0 = White back rank.
export type Board = (Piece | null)[][];

export interface Square {
  r: number;
  c: number;
}

export type PromotionPiece = "Q" | "R" | "N" | "B";

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece | null;
  promotion?: PromotionPiece;
}

export interface GameState {
  board: Board;
  turn: Color;
  history: Move[];
  captured: { w: Piece[]; b: Piece[] };
}

export type Difficulty = "easy" | "medium" | "hard";

export interface Variant {
  id: string;
  name: string;
  size: number;
  backRank: PieceType[];
}

export const VARIANTS: Record<string, Variant> = {
  "5x5": {
    id: "5x5",
    name: "Mini 5×5",
    size: 5,
    backRank: ["R", "K", "B", "N", "R"],
  },
  "6x6": {
    id: "6x6",
    name: "Mini 6×6",
    size: 6,
    backRank: ["R", "B", "K", "Q", "B", "R"],
  },
};

export const DEFAULT_VARIANT_ID = "5x5";
