/**
 * Single source of truth for piece point values.
 *
 * Built-in pieces use the fixed table below. Custom user pieces fall back to
 * `estimatePiecePoints`. A `PieceDef.pointsOverride` always wins.
 *
 * Values are in classical "pawn points" (P=1, N=B=3, R=5, Q=9). The AI
 * search converts to centipawns by multiplying by 100.
 */
import type { Color, GameState, PieceDef, PieceId } from "./types";

export const FIXED_PIECE_POINTS: Record<string, number> = {
  P: 1,
  S: 2,    // Shapeshifter
  X: 1,    // Barricade
  N: 3,
  B: 3,
  H: 4,    // King's Hand
  A: 5,    // Archer
  R: 5,
  Z: 6,    // Assassin
  T: 6,    // Portal
  M: 7,    // Necromancer
  J: 7,    // Juggernaut
  W: 8,    // Wizard
  Q: 9,
  D: 11,   // Dragon
  Y: 0,    // Prism — indestructible fixture
  G: 12,   // Regent (royal, informational)
  L: 12,   // Lich King (royal, informational)
  K: 0,    // King — royal, no material value (game ends on loss)
};

/** Pieces excluded from the material differential (royals + indestructible fixture). */
export const ROYAL_OR_FIXTURE_IDS = new Set<PieceId>(["K", "G", "L", "Y"]);

/**
 * Heuristic worth for a custom (user-defined) piece. Calibrated so a knight-
 * shaped def lands near 3 and a queen-shaped def near 9. Clamped 0.5..14,
 * rounded to 0.5.
 */
export function estimatePiecePoints(def: PieceDef): number {
  if (def.special === "prism") return 0;
  if (def.royal) return 12;
  if (def.immobile && !def.special) return 1;
  let est = 0.5;

  if (def.options && def.options.length > 0) {
    // Option-based piece. Sum approximate reach per option with kind +
    // condition weighting. Captures only / conditional options weigh less.
    for (const opt of def.options) {
      // Estimate the number of "squares produced" by this option's first step.
      const s = opt.steps[0];
      if (!s) continue;
      const dirCount =
        s.direction.kind === "absolute"
          ? s.direction.dir === "any-8" ? 8 :
            s.direction.dir === "any-orth" || s.direction.dir === "any-diag" ? 4 : 1
          : 2;
      const distScore = s.distance === "unlimited" ? 4 : Math.min(4, s.distance as number);
      let optScore = dirCount * (s.distance === "unlimited" ? 1.1 : 0.35 * distScore);
      if (opt.kind === "capture-only") optScore *= 0.5;
      if (opt.kind === "move-only") optScore *= 0.85;
      if (opt.condition === "from-starting-square") optScore *= 0.25;
      est += optScore;
    }
  } else {
    const slides = def.movement?.slides?.length ?? 0;
    const leaps = def.movement?.leaps?.length ?? 0;
    est += slides * 1.1;
    est += leaps * 0.35;
    if (leaps > 0) est += 0.4;
    if (def.movement?.slidersJump) est += 1.0;
  }
  switch (def.special) {
    case "dragon": est += 6; break;
    case "necromancer": est += 5; break;
    case "wizard": est += 5; break;
    case "juggernaut": est += 5; break;
    case "portal": est += 4; break;
    case "assassin": est += 3; break;
    case "archer": est += 3; break;
    case "shapeshifter": est += 1; break;
    case "pawn": est += 0.5; break;
    default: break;
  }
  if (def.rangedCapture) est += 1.5;
  if (est < 0.5) est = 0.5;
  if (est > 14) est = 14;
  return Math.round(est * 2) / 2;
}

/** Resolve a piece's worth in pawn units. Override > fixed table > estimator. */
export function getPiecePoints(id: PieceId, def?: PieceDef): number {
  if (def?.pointsOverride != null && Number.isFinite(def.pointsOverride)) {
    return Math.max(0, def.pointsOverride);
  }
  const fixed = FIXED_PIECE_POINTS[id];
  if (fixed != null) return fixed;
  if (def) return estimatePiecePoints(def);
  return 1;
}

/**
 * Material differential from `color`'s perspective. Positive = `color` is
 * ahead. Royals + indestructible fixtures are excluded.
 */
export function materialDiff(state: GameState, color: Color): number {
  const opp: Color = color === "w" ? "b" : "w";
  let mine = 0;
  let theirs = 0;
  // captured[c] = pieces of color c that died (captured BY !c).
  for (const p of state.captured[opp]) {
    if (ROYAL_OR_FIXTURE_IDS.has(p.id)) continue;
    mine += getPiecePoints(p.id, state.registry[p.id]);
  }
  for (const p of state.captured[color]) {
    if (ROYAL_OR_FIXTURE_IDS.has(p.id)) continue;
    theirs += getPiecePoints(p.id, state.registry[p.id]);
  }
  return mine - theirs;
}
