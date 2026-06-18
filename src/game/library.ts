import type { Design, Placement, PieceId } from "./types";
import { buildDefaultDesign, defaultReserves, loadCustomPieces, PRESETS } from "./design";
import { buildBaseTutorial, type GameTutorial } from "./tutorials";

const SAVED_KEY = "designer:savedGames";

export interface GameType {
  id: string;
  name: string;
  description: string;
  rows: number;
  cols: number;
  build: () => Design;
  builtin: true;
}

function mirror(placements: Placement[], rows: number): Placement[] {
  return placements.flatMap((p) => [
    p,
    { ...p, color: "b", r: rows - 1 - p.r },
  ] as Placement[]);
}

function pawnRow(row: number, cols: number): Placement[] {
  return Array.from({ length: cols }, (_, c) => ({ color: "w" as const, pieceId: "P" as PieceId, r: row, c }));
}

function presetDesign(rows: number, cols: number, presetId: string): Design {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const includeBarricade = presetId === "menagerie" || presetId === "grand-menagerie";
  return {
    rows,
    cols,
    placements: preset.build(rows, cols),
    reserves: defaultReserves([], { includeBarricade }),
    customPieces: loadCustomPieces(),
  };
}

export const BUILTIN_GAMES: GameType[] = [
  {
    id: "classic-8",
    name: "Classic Chess",
    description: "The full 8×8 game you know.",
    rows: 8, cols: 8, builtin: true,
    build: () => presetDesign(8, 8, "classic"),
  },
  {
    id: "mini-6",
    name: "Mini Chess",
    description: "6×6 board — Rook, Bishop, King, Queen, Bishop, Rook.",
    rows: 6, cols: 6, builtin: true,
    build: () => {
      const back: PieceId[] = ["R", "B", "K", "Q", "B", "R"];
      const placements = mirror([
        ...back.map((id, c) => ({ color: "w" as const, pieceId: id, r: 0, c })),
        ...pawnRow(1, 6),
      ], 6);
      return { rows: 6, cols: 6, placements, reserves: defaultReserves([], { includeBarricade: false }), customPieces: loadCustomPieces() };
    },
  },
  {
    id: "knights-5",
    name: "Battle of the Knights",
    description: "5×5 — knights filling the back rank, king in the middle.",
    rows: 5, cols: 5, builtin: true,
    build: () => presetDesign(5, 5, "knights"),
  },
  {
    id: "menagerie-8",
    name: "Menagerie",
    description: "Classic 8×8 reimagined — Archers as rooks, Dragons as knights, Wizards as bishops, a Regent leading the army, with an Assassin (White) and Necromancer (Black) flanking. Shapeshifter pawns up front.",
    rows: 8, cols: 8, builtin: true,
    build: () => presetDesign(8, 8, "menagerie"),
  },
  {
    id: "grand-menagerie-12",
    name: "Grand Menagerie",
    description: "12×12 showcase of every custom piece — juggernauts on the wings, shapeshifter pawns up front.",
    rows: 12, cols: 12, builtin: true,
    build: () => presetDesign(12, 12, "grand-menagerie"),
  },
  {
    id: "lone-king-8",
    name: "Pawns & King",
    description: "Solo king behind a wall of pawns. Calm canvas to learn on.",
    rows: 8, cols: 8, builtin: true,
    build: () => presetDesign(8, 8, "lone-king"),
  },
];

export interface SavedGame {
  id: string;
  name: string;
  description: string;
  design: Design;
  tutorial?: GameTutorial;
  createdAt: number;
}

/** One-time back-compat: shift Prisms in Grand Menagerie from old h-file (c=7)
 *  to the corrected f-file (c=5). Applies to any 12×12 design with a Prism. */
function migratePrismPlacement(d: Design): Design {
  if (d.rows !== 12 || d.cols !== 12) return d;
  let changed = false;
  const next = d.placements.map((p) => {
    if (p.pieceId === "Y" && p.c === 7) {
      changed = true;
      return { ...p, c: 5 };
    }
    return p;
  });
  return changed ? { ...d, placements: next } : d;
}

export function loadSavedGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedGame[];
    // Back-compat: older saves lack `description`; also fix stale prism coords.
    const migrated = list.map((g) => {
      const design = migratePrismPlacement(g.design);
      return { ...g, description: g.description ?? "", design };
    });
    // If anything changed, persist the corrected list so the fix sticks.
    const anyChanged = migrated.some((g, i) => g.design !== list[i].design);
    if (anyChanged) {
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(migrated)); } catch {}
    }
    return migrated;
  } catch { return []; }
}

export function saveSavedGame(
  name: string,
  design: Design,
  opts: { description?: string; tutorial?: GameTutorial } = {},
): SavedGame {
  const list = loadSavedGames();
  const entry: SavedGame = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled game",
    description: (opts.description ?? "").trim(),
    design,
    tutorial: opts.tutorial,
    createdAt: Date.now(),
  };
  list.unshift(entry);
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {}
  return entry;
}

export function deleteSavedGame(id: string) {
  const list = loadSavedGames().filter((g) => g.id !== id);
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {}
}

/** Resolve a tutorial for a built-in game (built programmatically from the design). */
export function tutorialForBuiltin(g: GameType): GameTutorial {
  return buildBaseTutorial({ name: g.name, description: g.description, design: g.build() });
}

/** Resolve a tutorial for a saved game (use AI-generated if present, else fall back). */
export function tutorialForSaved(g: SavedGame): GameTutorial {
  return (
    g.tutorial ??
    buildBaseTutorial({ name: g.name, description: g.description, design: g.design })
  );
}

// Re-export buildDefaultDesign for convenience
export { buildDefaultDesign };
