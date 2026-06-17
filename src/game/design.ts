import type { Design, PieceDef, PieceId, Placement, Reserves } from "./types";
import { PIECE_LIBRARY } from "./pieces";

const STORAGE_KEY = "designer:current";
const CUSTOM_PIECES_KEY = "designer:customPieces";

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: (rows: number, cols: number) => Placement[];
}

function mirror(placements: Placement[], rows: number, cols: number): Placement[] {
  if (cols > rows) {
    return placements.flatMap((p) => [
      p,
      { ...p, color: "b", c: cols - 1 - p.c },
    ] as Placement[]);
  }
  return placements.flatMap((p) => [
    p,
    { ...p, color: "b", r: rows - 1 - p.r },
  ] as Placement[]);
}

function fillRow(row: number, ids: PieceId[], cols: number): Placement[] {
  const out: Placement[] = [];
  // Center the back rank if shorter than cols; pad with empties.
  const start = Math.floor((cols - ids.length) / 2);
  ids.forEach((id, i) => {
    const c = start + i;
    if (c >= 0 && c < cols) out.push({ color: "w", pieceId: id, r: row, c });
  });
  return out;
}

function fillCol(col: number, ids: PieceId[], rows: number): Placement[] {
  const out: Placement[] = [];
  const start = Math.floor((rows - ids.length) / 2);
  ids.forEach((id, i) => {
    const r = start + i;
    if (r >= 0 && r < rows) out.push({ color: "w" as const, pieceId: id, r, c: col });
  });
  return out;
}

function classicBackRank(cols: number): PieceId[] {
  // Symmetric: R N B [...filler...] K Q B N R (Q on d-ish file)
  if (cols >= 8) {
    // Use standard chess ordering for 8 cols, otherwise pattern.
    if (cols === 8) return ["R", "N", "B", "Q", "K", "B", "N", "R"];
    // > 8: extend with extra Q/B/N pairs
    const left: PieceId[] = ["R", "N", "B"];
    const right: PieceId[] = ["B", "N", "R"];
    const middle: PieceId[] = ["Q", "K"];
    const fillers = cols - left.length - right.length - middle.length;
    const extras: PieceId[] = [];
    const pool: PieceId[] = ["N", "B", "Q"];
    for (let i = 0; i < fillers; i++) extras.push(pool[i % pool.length]);
    return [...left, ...extras.slice(0, Math.floor(extras.length / 2)), ...middle, ...extras.slice(Math.floor(extras.length / 2)), ...right];
  }
  // < 8 cols: progressively trim from the queen/extras
  const trims: Record<number, PieceId[]> = {
    3: ["R", "K", "R"],
    4: ["R", "K", "Q", "R"],
    5: ["R", "B", "K", "N", "R"],
    6: ["R", "B", "K", "Q", "B", "R"],
    7: ["R", "N", "B", "K", "B", "N", "R"],
  };
  return trims[cols] ?? trims[5];
}

export const PRESETS: Preset[] = [
  {
    id: "classic",
    name: "Classic-ish",
    description: "Standard back rank scaled to your board, with pawns on rank 2.",
    build: (rows, cols) => {
      if (rows < 3 && cols < 3) return [];
      if (cols > rows) {
        return mirror([
          ...fillCol(0, classicBackRank(rows), rows),
          ...Array.from({ length: rows }, (_, r) => ({ color: "w" as const, pieceId: "P" as PieceId, r, c: 1 })),
        ], rows, cols);
      }
      return mirror([
        ...fillRow(0, classicBackRank(cols), cols),
        ...Array.from({ length: cols }, (_, c) => ({ color: "w" as const, pieceId: "P" as PieceId, r: 1, c })),
      ], rows, cols);
    },
  },
  {
    id: "lone-king",
    name: "Just pawns + King",
    description: "Solo king behind a wall of pawns. Great starting canvas.",
    build: (rows, cols) => {
      if (rows < 3 && cols < 3) return [];
      if (cols > rows) {
        const kingRow = Math.floor(rows / 2);
        return mirror([
          { color: "w", pieceId: "K", r: kingRow, c: 0 },
          ...Array.from({ length: rows }, (_, r) => ({ color: "w" as const, pieceId: "P" as PieceId, r, c: 1 })),
        ], rows, cols);
      }
      const kingCol = Math.floor(cols / 2);
      return mirror([
        { color: "w", pieceId: "K", r: 0, c: kingCol },
        ...Array.from({ length: cols }, (_, c) => ({ color: "w" as const, pieceId: "P" as PieceId, r: 1, c })),
      ], rows, cols);
    },
  },
  {
    id: "knights",
    name: "Battle of the Knights",
    description: "Knights filling the back rank, King centered. No rooks.",
    build: (rows, cols) => {
      if (rows < 3 && cols < 3) return [];
      if (cols > rows) {
        const back: PieceId[] = Array.from({ length: rows }, () => "N");
        back[Math.floor(rows / 2)] = "K";
        return mirror([
          ...fillCol(0, back, rows),
          ...Array.from({ length: rows }, (_, r) => ({ color: "w" as const, pieceId: "P" as PieceId, r, c: 1 })),
        ], rows, cols);
      }
      const back: PieceId[] = Array.from({ length: cols }, () => "N");
      back[Math.floor(cols / 2)] = "K";
      return mirror([
        ...fillRow(0, back, cols),
        ...Array.from({ length: cols }, (_, c) => ({ color: "w" as const, pieceId: "P" as PieceId, r: 1, c })),
      ], rows, cols);
    },
  },
  {
    id: "menagerie",
    name: "Menagerie",
    description: "Classic + a Dragon, an Archer, and 2 Barricade drops per side.",
    build: (rows, cols) => {
      const base = PRESETS[0].build(rows, cols);
      const wide = cols > rows;
      const mid = wide ? Math.floor(rows / 2) : Math.floor(cols / 2);
      const limit = wide ? rows - 1 : cols - 1;
      const out = base.map((p) => {
        const coord = wide ? p.r : p.c;
        const isWhiteBack = wide ? (p.c === 0 && p.color === "w") : (p.r === 0 && p.color === "w");
        const isBlackBack = wide ? (p.c === cols - 1 && p.color === "b") : (p.r === rows - 1 && p.color === "b");
        if (isWhiteBack && coord === Math.max(0, mid - 2)) return { ...p, pieceId: "A" as PieceId };
        if (isWhiteBack && coord === Math.min(limit, mid + 2)) return { ...p, pieceId: "D" as PieceId };
        if (isBlackBack && coord === Math.max(0, mid - 2)) return { ...p, pieceId: "A" as PieceId };
        if (isBlackBack && coord === Math.min(limit, mid + 2)) return { ...p, pieceId: "D" as PieceId };
        return p;
      });
      return out;
    },
  },
  {
    id: "empty",
    name: "Empty",
    description: "Start from scratch. Drag pieces onto the board.",
    build: () => [],
  },
];

export function defaultReserves(custom: PieceDef[] = []): { w: Reserves; b: Reserves } {
  const w: Reserves = {};
  const b: Reserves = {};
  for (const id of Object.keys(PIECE_LIBRARY)) {
    const d = PIECE_LIBRARY[id];
    if (d.defaultReserve) { w[id] = d.defaultReserve; b[id] = d.defaultReserve; }
  }
  for (const d of custom) {
    if (d.defaultReserve) { w[d.id] = d.defaultReserve; b[d.id] = d.defaultReserve; }
  }
  return { w, b };
}

export function buildDefaultDesign(rows = 8, cols = 8, presetId = "classic"): Design {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  return {
    rows,
    cols,
    placements: preset.build(rows, cols),
    reserves: defaultReserves(),
    customPieces: loadCustomPieces(),
  };
}

export function saveDesign(d: Design) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
}
export function loadDesign(): Design | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Design;
  } catch { return null; }
}

export function loadCustomPieces(): PieceDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PIECES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PieceDef[];
  } catch { return []; }
}

export function saveCustomPieces(pieces: PieceDef[]) {
  try { localStorage.setItem(CUSTOM_PIECES_KEY, JSON.stringify(pieces)); } catch {}
}

/** Validate a design before play. Returns error string or null. */
export function validateDesign(d: Design, registry: Record<PieceId, PieceDef>): string | null {
  const royals = { w: 0, b: 0 };
  for (const p of d.placements) {
    if (registry[p.pieceId]?.royal) royals[p.color]++;
  }
  if (royals.w !== 1) return "White must have exactly one royal piece (King).";
  if (royals.b !== 1) return "Black must have exactly one royal piece (King).";
  // No pawns on their own promotion line
  for (const p of d.placements) {
    const def = registry[p.pieceId];
    if (def?.special === "pawn" || def?.special === "shapeshifter") {
      const wide = d.cols > d.rows;
      const promoLine = p.color === "w" ? (wide ? d.cols - 1 : d.rows - 1) : 0;
      const coord = wide ? p.c : p.r;
      if (coord === promoLine) return "A pawn cannot start on its promotion line.";
    }
  }
  return null;
}
