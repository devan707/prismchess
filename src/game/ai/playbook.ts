/**
 * Persistent "playbook" the AI uses across games. Lessons are natural-language
 * reminders that future analysis chats see; tweaks are numeric weights that
 * the minimax evaluator applies on every move. Stored in localStorage so it
 * carries across sessions in the same browser without any backend.
 */
export interface Playbook {
  lessons: string[];
  /** Multipliers applied to PIECE_VALUES_PAWNS (clamped to [0.3, 2.5]). */
  pieceValueMultipliers: Record<string, number>;
  /** Multiplier on the hanging-piece penalty. Higher = more cautious. */
  cautionMultiplier: number;
  /** Bonus added to every capture (in centipawns). Higher = more aggressive. */
  aggressionBonus: number;
  /** Map of algebraic square (e.g. "g12") → centipawn weight. Positive = the
   *  AI should bias toward defending/occupying that square (e.g. a discovered
   *  checkmate landing square). Negative = avoid letting our king sit there.
   *  Applied symmetrically: the side whose turn it is gains when it defends
   *  one of these squares and loses when the opponent attacks it undefended. */
  squareDefenseBonuses: Record<string, number>;
  /** Number of games the AI has reviewed (purely informational). */
  gamesReviewed: number;
}

const KEY = "menagerie.ai.playbook.v1";

export const DEFAULT_PLAYBOOK: Playbook = {
  lessons: [],
  pieceValueMultipliers: {},
  cautionMultiplier: 1,
  aggressionBonus: 0,
  squareDefenseBonuses: {},
  gamesReviewed: 0,
};

function clampMult(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0.3, Math.min(2.5, v));
}

export function normalizePlaybook(p: Partial<Playbook> | null | undefined): Playbook {
  const base: Playbook = {
    ...DEFAULT_PLAYBOOK,
    pieceValueMultipliers: { ...DEFAULT_PLAYBOOK.pieceValueMultipliers },
  };
  if (!p) return base;
  if (Array.isArray(p.lessons)) {
    base.lessons = p.lessons.filter((l): l is string => typeof l === "string" && l.trim().length > 0).slice(0, 24);
  }
  if (p.pieceValueMultipliers && typeof p.pieceValueMultipliers === "object") {
    for (const [k, v] of Object.entries(p.pieceValueMultipliers)) {
      if (typeof v === "number") base.pieceValueMultipliers[k] = clampMult(v);
    }
  }
  if (typeof p.cautionMultiplier === "number") base.cautionMultiplier = clampMult(p.cautionMultiplier);
  if (typeof p.aggressionBonus === "number") {
    base.aggressionBonus = Math.max(-150, Math.min(150, p.aggressionBonus));
  }
  if (typeof p.gamesReviewed === "number" && p.gamesReviewed >= 0) {
    base.gamesReviewed = Math.floor(p.gamesReviewed);
  }
  return base;
}

let cached: Playbook | null = null;

export function loadPlaybook(): Playbook {
  if (cached) return cached;
  if (typeof window === "undefined") return DEFAULT_PLAYBOOK;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = normalizePlaybook(raw ? JSON.parse(raw) : null);
  } catch {
    cached = { ...DEFAULT_PLAYBOOK };
  }
  return cached;
}

export function savePlaybook(p: Playbook): void {
  cached = normalizePlaybook(p);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* ignore quota errors */
  }
}

export function resetPlaybook(): Playbook {
  cached = { ...DEFAULT_PLAYBOOK, pieceValueMultipliers: {} };
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
  }
  return cached;
}
