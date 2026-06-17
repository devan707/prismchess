import type { Offset, PieceDef, PieceId, SlideDir } from "./types";

const ROOK_DIRS: SlideDir[] = [
  { dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 },
];
const BISHOP_DIRS: SlideDir[] = [
  { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
];
const QUEEN_DIRS: SlideDir[] = [...ROOK_DIRS, ...BISHOP_DIRS];
const KING_OFFSETS: Offset[] = QUEEN_DIRS.map((d) => ({ dr: d.dr, dc: d.dc }));
const KNIGHT_OFFSETS: Offset[] = [
  { dr: 2, dc: 1 }, { dr: 2, dc: -1 }, { dr: -2, dc: 1 }, { dr: -2, dc: -1 },
  { dr: 1, dc: 2 }, { dr: 1, dc: -2 }, { dr: -1, dc: 2 }, { dr: -1, dc: -2 },
];
// Archer: exactly 2 squares orthogonal or diagonal — 8 leap targets, jumping over.
const ARCHER_OFFSETS: Offset[] = [
  { dr: 2, dc: 0 }, { dr: -2, dc: 0 }, { dr: 0, dc: 2 }, { dr: 0, dc: -2 },
  { dr: 2, dc: 2 }, { dr: 2, dc: -2 }, { dr: -2, dc: 2 }, { dr: -2, dc: -2 },
];

export const PIECE_LIBRARY: Record<PieceId, PieceDef> = {
  K: {
    id: "K",
    name: "King",
    glyph: "♚",
    royal: true,
    movement: { leaps: KING_OFFSETS },
    description: "Moves one square in any direction. Lose it and the game ends.",
  },
  Q: {
    id: "Q",
    name: "Queen",
    glyph: "♛",
    movement: { slides: QUEEN_DIRS },
    canBePromoted: true,
    description: "Slides any number of squares in any straight line.",
  },
  R: {
    id: "R",
    name: "Rook",
    glyph: "♜",
    movement: { slides: ROOK_DIRS },
    canBePromoted: true,
    description: "Slides along ranks and files.",
  },
  B: {
    id: "B",
    name: "Bishop",
    glyph: "♝",
    movement: { slides: BISHOP_DIRS },
    canBePromoted: true,
    description: "Slides diagonally.",
  },
  N: {
    id: "N",
    name: "Knight",
    glyph: "♞",
    movement: { leaps: KNIGHT_OFFSETS },
    canBePromoted: true,
    description: "Leaps in an L-shape; jumps other pieces.",
  },
  P: {
    id: "P",
    name: "Pawn",
    glyph: "♟",
    special: "pawn",
    description: "Forward one (or two from its start row). Captures diagonally. Promotes on the far rank.",
  },
  H: {
    id: "H",
    name: "King's Hand",
    glyph: "✋",
    emoji: true,
    movement: { leaps: KING_OFFSETS },
    builtinCustom: true,
    description: "The king's right hand. Moves one square in any direction like a king, but is NOT royal — capturing it doesn't end the game, and it can step into attacked squares.",
  },
  A: {
    id: "A",
    name: "Archer",
    glyph: "🏹",
    emoji: true,
    movement: { leaps: ARCHER_OFFSETS },
    builtinCustom: true,
    description: "Leaps exactly two squares in any direction (orthogonal or diagonal), jumping over pieces. Captures only on the landing square.",
  },
  D: {
    id: "D",
    name: "Dragon",
    glyph: "🐉",
    emoji: true,
    special: "dragon",
    builtinCustom: true,
    description: "On its turn: either teleport to any empty square, OR breathe fire on one adjacent enemy (stays in place, removes the enemy).",
  },
  X: {
    id: "X",
    name: "Barricade",
    glyph: "🧱",
    emoji: true,
    immobile: true,
    defaultReserve: 2,
    builtinCustom: true,
    description: "Off-board reserve. Drop it on any empty square — it never moves on its own, but blocks movement and can be captured like any other piece.",
  },
  T: {
    id: "T",
    name: "Portal",
    glyph: "🌀",
    emoji: true,
    special: "portal",
    builtinCustom: true,
    description: "Cannot move, capture, or give check — but can be captured. Instead of moving, swap places with any one of your own pieces anywhere on the board (uses your full turn). You may swap with the King, but not into check. Juggernauts are too massive to teleport.",
  },
  M: {
    id: "M",
    name: "Necromancer",
    glyph: "💀",
    emoji: true,
    movement: { leaps: [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ] },
    builtinCustom: true,
    description: "Moves and captures one square diagonally. Instead of moving, may resurrect one of your captured pieces onto any empty adjacent square (uses your full turn).",
  },
  S: {
    id: "S",
    name: "Shapeshifter Pawn",
    glyph: "🦎",
    emoji: true,
    special: "shapeshifter",
    builtinCustom: true,
    description: "Moves and captures exactly like a pawn. Whenever it captures, it permanently transforms into the piece it captured.",
  },
  J: {
    id: "J",
    name: "Juggernaut",
    glyph: "🛡️",
    emoji: true,
    special: "juggernaut",
    builtinCustom: true,
    description: "A 2-square siege engine. Each turn it may SHIFT one square sideways OR CHARGE straight forward (tramples enemies, stops before friendly pieces, exits off the enemy edge). Immune to capture from its front arc; captured normally from the sides or rear — losing either square destroys the whole Juggernaut.",
  },
  Z: {
    id: "Z",
    name: "Assassin",
    glyph: "🗡️",
    emoji: true,
    special: "assassin",
    builtinCustom: true,
    description: "Infiltrator. Slides up to 3 unobstructed squares diagonally, then takes exactly 1 more step in any of the 8 directions. Captures on the final square only.",
  },
  W: {
    id: "W",
    name: "Wizard",
    glyph: "🧙",
    emoji: true,
    special: "wizard",
    builtinCustom: true,
    description: "Arcane mage. Slides any distance diagonally like a bishop, AND slides orthogonally any distance — but the orthogonal step only lands on squares of its own color, jumping over opposite-colored squares (and any pieces on them). Permanently bound to the color of the square it's placed on.",
  },
};

export const STANDARD_PIECE_IDS: PieceId[] = ["K", "Q", "R", "B", "N", "P"];
export const BUILTIN_CUSTOM_IDS: PieceId[] = ["H", "A", "D", "X", "T", "M", "S", "J", "Z", "W"];
export const ALL_BUILTIN_IDS: PieceId[] = [...STANDARD_PIECE_IDS, ...BUILTIN_CUSTOM_IDS];

/** Build a registry from the built-ins + user-defined pieces. */
export function buildRegistry(custom: PieceDef[] = []): Record<PieceId, PieceDef> {
  const reg: Record<PieceId, PieceDef> = {};
  for (const id of ALL_BUILTIN_IDS) reg[id] = PIECE_LIBRARY[id];
  for (const p of custom) reg[p.id] = p;
  return reg;
}
