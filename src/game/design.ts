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
    description: "Classic layout reimagined: Archers as rooks, Dragons as knights, Wizards as bishops, a Regent leading the army, and an Assassin (white) / Necromancer (black) standing in for the queen. Shapeshifter pawns up front.",
    build: (rows, cols) => {
      // Designed for an 8×8 board. Fall back to classic-ish on smaller boards.
      if (rows < 8 || cols < 8) return PRESETS[0].build(rows, cols);
      // Back rank: Archer, Dragon, Wizard, <queen-slot>, Regent, Wizard, Dragon, Archer
      // White's queen slot is an Assassin (Z); Black's mirrors to a Necromancer (M).
      const cKing = 4;
      const cQueen = 3;
      const whiteBack: PieceId[] = [];
      const blackBack: PieceId[] = [];
      for (let c = 0; c < cols; c++) {
        let id: PieceId;
        if (c === 0 || c === 7) id = "A";
        else if (c === 1 || c === 6) id = "D";
        else if (c === 2 || c === 5) id = "W";
        else if (c === cQueen) id = "_Q"; // sentinel, replaced per side
        else if (c === cKing) id = "G";
        else id = "P";
        whiteBack.push(id === "_Q" ? "Z" : id);
        blackBack.push(id === "_Q" ? "M" : id);
      }
      const placements: Placement[] = [];
      whiteBack.forEach((id, c) => placements.push({ color: "w", pieceId: id, r: 0, c }));
      blackBack.forEach((id, c) => placements.push({ color: "b", pieceId: id, r: rows - 1, c }));
      // Shapeshifter pawns across rank 2 / second-to-last rank.
      for (let c = 0; c < cols; c++) {
        placements.push({ color: "w", pieceId: "S", r: 1, c });
        placements.push({ color: "b", pieceId: "S", r: rows - 2, c });
      }
      return placements;
    },
  },
  {
    id: "grand-menagerie",
    name: "Grand Menagerie (12×12)",
    description: "12×12 showcase featuring every custom piece. Best on a 12×12 board.",
    build: (rows, cols) => {
      if (rows < 12 || cols < 12) {
        // Fall back to classic if the board is too small to host the layout.
        return PRESETS[0].build(rows, cols);
      }
      // White rows 0..1 + one portal at center of own half; mirrored for black.
      // Row 0 — back rank:  J J A W D Q K H M Z J J
      //   Juggernauts on each flank, Archer on the queen wing.
      //   Queen side: Wizard, then Dragon. King side: King's Hand, then Necromancer, then Assassin.
      //   The queen-side Wizard sits on a light square for White / dark square for Black,
      //   so each side's Wizard is correctly bound to its own color.
      // Row 1 — shapeshifter pawns all the way across.
      // Portal (T) is placed centrally on each side, not on the back rank.
      const row0: PieceId[] = ["J", "J", "A", "W", "D", "Q", "K", "H", "M", "Z", "J", "J"];
      const row1: PieceId[] = [
        "S", "S", "S", "S", "S", "S", "S", "S", "S", "S", "S", "S",
      ];
      const white: Placement[] = [];
      row0.forEach((id, c) => white.push({ color: "w", pieceId: id, r: 0, c }));
      row1.forEach((id, c) => white.push({ color: "w", pieceId: id, r: 1, c }));
      // Central portal on White's side; mirror() reflects it to Black's side.
      white.push({ color: "w", pieceId: "T", r: 5, c: 6 });
      const placements = mirror(white, rows, cols);
      // Two Prisms on the centermost column on each side, opposite the portals,
      // so their auras blanket the central portal squares.
      placements.push({ color: "w", pieceId: "Y", r: 5, c: 5 });
      placements.push({ color: "b", pieceId: "Y", r: 6, c: 5 });
      return placements;
    },
  },
  {
    id: "empty",
    name: "Empty",
    description: "Start from scratch. Drag pieces onto the board.",
    build: () => [],
  },
];

export function defaultReserves(
  custom: PieceDef[] = [],
  opts: { includeBarricade?: boolean } = {},
): { w: Reserves; b: Reserves } {
  const w: Reserves = {};
  const b: Reserves = {};
  const includeBarricade = opts.includeBarricade ?? false;
  for (const id of Object.keys(PIECE_LIBRARY)) {
    if (id === "X" && !includeBarricade) continue;
    const d = PIECE_LIBRARY[id];
    if (d.defaultReserve) { w[id] = d.defaultReserve; b[id] = d.defaultReserve; }
  }
  for (const d of custom) {
    if (d.id === "X" && !includeBarricade) continue;
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
    const d = JSON.parse(raw) as Design;
    // Back-compat: fix stale prism coords from old saves.
    if (d.rows === 12 && d.cols === 12) {
      let changed = false;
      const next = d.placements.map((p) => {
        if (p.pieceId === "Y" && p.c === 7) { changed = true; return { ...p, c: 5 }; }
        return p;
      });
      if (changed) {
        const fixed = { ...d, placements: next };
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fixed)); } catch {}
        return fixed;
      }
    }
    return d;
  } catch { return null; }
}

const META_KEY = "designer:currentMeta";
export interface CurrentGameMeta {
  id: string;
  name: string;
  description?: string;
  /** Serialized GameTutorial — kept loose here to avoid a circular import. */
  tutorial?: { slides: Array<{ title: string; body?: string; bullets?: string[]; pieceId?: string }> };
}
export function saveCurrentMeta(meta: CurrentGameMeta) {
  try { sessionStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
}
export function loadCurrentMeta(): CurrentGameMeta | null {
  try {
    const raw = sessionStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CurrentGameMeta;
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

/** Compute the partner-cell offset(s) to try when placing a Juggernaut.
 *  Returns the perpendicular-axis offsets (preferred direction first). */
export function juggPartnerCandidates(rows: number, cols: number): { dr: number; dc: number }[] {
  // Same convention as the engine: wide boards face along columns → partner differs by row.
  const wide = cols > rows;
  return wide ? [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }] : [{ dr: 0, dc: 1 }, { dr: 0, dc: -1 }];
}

/** Place a Juggernaut as an adjacent pair. Returns true if a partner cell was placed. */
export function placeJuggernautPair(
  placements: Placement[],
  rows: number, cols: number,
  r: number, c: number, color: "w" | "b",
): { placements: Placement[]; partner: { r: number; c: number } | null } {
  let next = placements.filter((p) => !(p.r === r && p.c === c));
  next.push({ r, c, pieceId: "J", color });
  for (const o of juggPartnerCandidates(rows, cols)) {
    const pr = r + o.dr, pc = c + o.dc;
    if (pr < 0 || pr >= rows || pc < 0 || pc >= cols) continue;
    if (next.some((p) => p.r === pr && p.c === pc)) continue;
    next.push({ r: pr, c: pc, pieceId: "J", color });
    return { placements: next, partner: { r: pr, c: pc } };
  }
  return { placements: next, partner: null };
}

/** Validate a design before play. Returns error string or null. */
export function validateDesign(d: Design, registry: Record<PieceId, PieceDef>): string | null {
  const royals = { w: 0, b: 0 };
  for (const p of d.placements) {
    if (registry[p.pieceId]?.royal) royals[p.color]++;
  }
  if (royals.w !== 1) return "White must have exactly one royal piece (King).";
  if (royals.b !== 1) return "Black must have exactly one royal piece (King).";
  for (const p of d.placements) {
    const def = registry[p.pieceId];
    if (def?.special === "pawn" || def?.special === "shapeshifter") {
      const wide = d.cols > d.rows;
      const promoLine = p.color === "w" ? (wide ? d.cols - 1 : d.rows - 1) : 0;
      const coord = wide ? p.c : p.r;
      if (coord === promoLine) return "A pawn cannot start on its promotion line.";
    }
  }
  const offsets = juggPartnerCandidates(d.rows, d.cols);
  for (const p of d.placements) {
    if (p.pieceId !== "J") continue;
    const hasPartner = offsets.some((o) => {
      const r = p.r + o.dr, c = p.c + o.dc;
      return d.placements.some((q) => q.pieceId === "J" && q.color === p.color && q.r === r && q.c === c);
    });
    if (!hasPartner) return "A Juggernaut needs an adjacent twin (its partner square) to function.";
  }
  return null;
}
