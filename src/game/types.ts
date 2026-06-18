export type Color = "w" | "b";

// Piece identifiers. Built-in:
//   K=King, Q=Queen, R=Rook, B=Bishop, N=Knight, P=Pawn,
//   H=King's Hand, A=Archer, D=Dragon, X=Barricade
// User-defined pieces use "u:<slug>".
export type PieceId = string;

export interface Piece {
  id: PieceId;
  color: Color;
  /** Resurrected enemy under our control. Same movement, ghostly look. */
  undead?: boolean;
  /** Has already been raised by a Necromancer once — cannot leave a corpse
   *  when it dies again (each piece instance is raisable only once). */
  raisedOnce?: boolean;
}

/** Persistent record of a piece that died on a specific square. Used by
 *  the Necromancer for Spirit View + Resurrection. Corpses do NOT block
 *  movement and are not game objects — purely metadata. */
export interface Corpse {
  square: Square;
  pieceId: PieceId;
  originalOwner: Color;
}

export type Board = (Piece | null)[][];

export interface Square {
  r: number;
  c: number;
}

export interface Offset {
  dr: number;
  dc: number;
}

export interface SlideDir extends Offset {
  /** Max steps. Undefined / 0 = unlimited. */
  max?: number;
}

export interface MovementSpec {
  slides?: SlideDir[];
  leaps?: Offset[];
  /** Sliders that jump pieces in their path (very unusual). */
  slidersJump?: boolean;
}

export interface PieceDef {
  id: PieceId;
  name: string;
  /** Glyph rendered for the piece. */
  glyph: string;
  /** If true, glyph is colored emoji — render with neutral coloring + side ring. */
  emoji?: boolean;
  /** Movement (and capture if `capture` not given). */
  movement?: MovementSpec;
  /** Optional separate capture pattern. */
  capture?: MovementSpec;
  /** Special hand-coded behavior. */
  special?: "pawn" | "dragon" | "portal" | "necromancer" | "shapeshifter" | "juggernaut" | "assassin" | "wizard" | "prism" | "archer";
  /** Royal: loss of all royal pieces of a color = game over. */
  royal?: boolean;
  /** Cannot move; blocks travel; cannot be captured. */
  immobile?: boolean;
  /** Can be a pawn promotion target. */
  canBePromoted?: boolean;
  /** Default reserves (drops) per side when placed in the designer's drop tray. */
  defaultReserve?: number;
  /** Tooltip / explanation. */
  description?: string;
  /** Marks built-in custom pieces (King's Hand, Archer, Dragon, Barricade). */
  builtinCustom?: boolean;
}

export type MoveKind =
  | "normal" | "double" | "ep" | "drop"
  | "dragonAttack" | "portalSwap" | "resurrect" | "necroRaise"
  | "juggShift" | "juggCharge" | "juggExit"
  | "castle" | "juggCastle" | "handPass" | "handDouble";

export interface Move {
  /** Null only for drops. */
  from: Square | null;
  to: Square;
  piece: Piece;
  captured?: Piece | null;
  kind?: MoveKind;
  /** Pawn promotion target id (must be canBePromoted). */
  promotion?: PieceId;
  /** En-passant captured pawn square. */
  epCapture?: Square;
  /** Drop piece id (drops only). */
  dropPieceId?: PieceId;
  /** Resurrect target piece id (necromancer). */
  resurrectPieceId?: PieceId;
  /** Original owner of the corpse being raised (for necroRaise). If it
   *  differs from the necromancer's color the result is an undead piece. */
  resurrectOriginalOwner?: Color;
  /** Shapeshifter capture: piece id to transform into (= captured.id). */
  shapeshiftTo?: PieceId;
  /** Juggernaut: enemy pieces trampled during a charge. */
  juggTrampled?: Piece[];
  /** Castling: rook source/destination squares. */
  rookFrom?: Square;
  rookTo?: Square;
  /** Juggernaut castle: original + destination squares of both J halves. */
  juggFrom?: [Square, Square];
  juggTo?: [Square, Square];
}

export type Reserves = Record<PieceId, number>;

export interface GameState {
  board: Board;
  turn: Color;
  history: Move[];
  captured: { w: Piece[]; b: Piece[] };
  /** Corpses left on the board (for Necromancer Spirit View + Resurrection). */
  corpses: Corpse[];
  reserves: { w: Reserves; b: Reserves };
  enPassant: Square | null;
  /** Snapshot of the registry used to play this game. */
  registry: Record<PieceId, PieceDef>;
  rows: number;
  cols: number;
  /** When a King's Hand has used its first of two moves this turn, the
   *  square it currently occupies. The same side must then make a second
   *  King-step with that same piece (or pass if no legal step exists)
   *  before the turn flips. */
  pendingHand?: Square | null;
}

export type Difficulty = "easy" | "medium" | "hard";

/** Designer-level configuration. */
export interface Placement {
  r: number;
  c: number;
  pieceId: PieceId;
  color: Color;
}

export interface Design {
  rows: number;
  cols: number;
  placements: Placement[];
  /** Starting reserves per side, by piece id. */
  reserves: { w: Reserves; b: Reserves };
  /** Pieces defined (or overridden) by the user, keyed by id. */
  customPieces: PieceDef[];
}
