export type Color = "w" | "b";
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Board = (Piece | null)[][];

export interface Square {
  r: number;
  c: number;
}

export type PromotionPiece = "Q" | "R" | "N" | "B";

export type MoveKind = "castle" | "ep" | "double";

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece | null;
  promotion?: PromotionPiece;
  kind?: MoveKind;
  // Castling: rook movement
  rookFrom?: Square;
  rookTo?: Square;
  // En passant: square of the captured pawn (differs from `to`)
  epCapture?: Square;
}

export interface CastlingSide {
  king: boolean;
  rooks: Record<number, boolean>; // by original column
}

export interface CastlingRights {
  w: CastlingSide;
  b: CastlingSide;
}

export interface GameState {
  board: Board;
  turn: Color;
  history: Move[];
  captured: { w: Piece[]; b: Piece[] };
  castling: CastlingRights;
  enPassant: Square | null; // the square a pawn just skipped over, capturable next ply
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
