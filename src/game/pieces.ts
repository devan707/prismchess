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
// Archer: ranged attacker. Shoots along the 8 compass lines at range 2 or 3,
// arcing over every piece in between. Cannot strike adjacent squares.
const ARCHER_OFFSETS: Offset[] = [
  // range 2
  { dr: 2, dc: 0 }, { dr: -2, dc: 0 }, { dr: 0, dc: 2 }, { dr: 0, dc: -2 },
  { dr: 2, dc: 2 }, { dr: 2, dc: -2 }, { dr: -2, dc: 2 }, { dr: -2, dc: -2 },
  // range 3
  { dr: 3, dc: 0 }, { dr: -3, dc: 0 }, { dr: 0, dc: 3 }, { dr: 0, dc: -3 },
  { dr: 3, dc: 3 }, { dr: 3, dc: -3 }, { dr: -3, dc: 3 }, { dr: -3, dc: -3 },
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
    description: "Ranged archer. Shoots along any of the 8 directions (orthogonal or diagonal) at range 2 or 3, arcing over every piece in between — friend or foe. Captures by occupying the target square. Cannot attack adjacent squares.",
  },
  D: {
    id: "D",
    name: "Dragon",
    glyph: "🐉",
    emoji: true,
    special: "dragon",
    builtinCustom: true,
    description: "Flight: move to any unoccupied square on the board, ignoring all intervening pieces (non-capturing). Strike: capture an enemy 1 or 2 squares away orthogonally or diagonally — knight-style jumps are NOT allowed. Distance-2 strikes are blocked by an intervening piece.",
  },
  X: {
    id: "X",
    name: "Barricade",
    glyph: "🧱",
    emoji: true,
    immobile: true,
    defaultReserve: 2,
    builtinCustom: true,
    description: "Off-board reserve. Drop it on any empty square — it never moves. Blocks movement and gives check coverage. Immune to capture from its front arc; only captured from the sides or rear. Too heavy to be teleported by a Portal.",
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
    special: "necromancer",
    builtinCustom: true,
    description: "Fragile support piece. Moves exactly 1 square diagonally onto an empty square — cannot attack or capture anything. When killed, every piece leaves a corpse on its death square. Select your Necromancer to enter Spirit View (translucent ghosts appear on each corpse square). To resurrect: have your Necromancer adjacent to a corpse, then click that corpse — the piece returns to life on its death square (the Necromancer stays put). Friendly corpses return as their original piece. Enemy corpses return as Undead under your control (same abilities, green glow). Juggernauts and Barricades cannot be resurrected.",
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
    description: "Infiltrator. Slides up to 2 unobstructed squares diagonally, then takes exactly 1 more step in any of the 8 directions. Captures on the final square only.",
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
