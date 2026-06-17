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
  description: string;
}

export const VARIANTS: Record<string, Variant> = {
  "5x5-classic": {
    id: "5x5-classic",
    name: "Classic (5×5)",
    size: 5,
    backRank: ["R", "K", "B", "N", "R"],
    description: "Rook, king, bishop, knight, rook — the original compact 5×5 setup.",
  },
  "5x5-knights": {
    id: "5x5-knights",
    name: "Battle of the Knights (5×5)",
    size: 5,
    backRank: ["N", "N", "K", "N", "N"],
    description: "Four knights per side guarding the king. No rooks, no castling — pure tactics.",
  },
  "6x6-royal": {
    id: "6x6-royal",
    name: "Royal (6×6)",
    size: 6,
    backRank: ["R", "B", "K", "Q", "B", "R"],
    description: "Rook, bishop, king, queen, bishop, rook — a full 6×6 court.",
  },
};

export const DEFAULT_VARIANT_ID = "5x5-classic";
