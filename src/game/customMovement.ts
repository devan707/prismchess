// Compiler that turns a player-defined sequence of movement "steps" into the
// engine's existing MovementSpec (leaps + slides). Keeps custom pieces
// runtime-cheap: no extra special branch, no path-tracking — once compiled they
// behave exactly like a built-in leaper or slider.

import type { MovementSpec, Offset, SlideDir } from "./types";

// ---------- public types ----------

export type StepDirAbs =
  | "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"
  | "any-orth"     // N,E,S,W
  | "any-diag"     // NE,SE,SW,NW
  | "any-8";       // all eight

export type StepDirRel =
  | "same"         // continue previous direction
  | "perp-cw"      // 90° clockwise from previous
  | "perp-ccw"     // 90° counter-clockwise
  | "any-perp";    // perp-cw OR perp-ccw

export interface MoveStep {
  /** First step must be absolute. Subsequent steps may be absolute or relative. */
  direction:
    | { kind: "absolute"; dir: StepDirAbs }
    | { kind: "relative"; rel: StepDirRel };
  distance: number | "unlimited";  // 1..3 or "unlimited"
  jumps: boolean;                  // ignore intervening pieces
  /** Whether this step can capture an enemy on the landing square.
   *  For multi-step chains, only the final step's flag is used. */
  captures: boolean;
}

export type RangedTiming = "before" | "after" | "replace";

/** A single direction+range band of a ranged attack. */
export interface RangedAttackOption {
  /** Absolute direction family. */
  direction: StepDirAbs;
  /** Inclusive square-range, 1..10. */
  minDistance: number;
  maxDistance: number;
}

export interface RangedAttack {
  enabled: boolean;
  timing: RangedTiming;
  /** One or more direction+range bands. The union of all bands defines
   *  the set of squares the piece can fire at. */
  options: RangedAttackOption[];
}

export const RANGED_MAX_DISTANCE = 10;
export const MAX_RANGED_OPTIONS = 4;

export interface CompiledMovement {
  moveSpec: MovementSpec;
  /** Set only when captures differ from movement (e.g. last step has captures=false). */
  captureSpec?: MovementSpec;
  error?: string;
}

// ---------- Move Options (v2: multiple alternative moves per piece) ----------

export type MoveOptionKind = "move-or-capture" | "move-only" | "capture-only";
export type MoveCondition = "none" | "from-starting-square";

export interface MoveOption {
  /** One movement chain (1..4 steps) — same shape as before. */
  steps: MoveStep[];
  /** Whether this option moves only, captures only, or either. Replaces
   *  the per-step `captures` flag for option-based pieces. */
  kind: MoveOptionKind;
  /** When this option is available. */
  condition: MoveCondition;
}

export interface CompiledOption {
  /** Compiled MovementSpec (leap endpoints or slides). */
  spec: MovementSpec;
  kind: MoveOptionKind;
  condition: MoveCondition;
  error?: string;
}

/** Compile a single MoveOption to a MovementSpec. Ignores per-step capture
 *  flags — the option-level `kind` controls capture behavior at runtime. */
export function compileOption(opt: MoveOption): CompiledOption {
  const stepsAsCapturing = opt.steps.map((s) => ({ ...s, captures: true }));
  const c = compileMovement(stepsAsCapturing);
  if (c.error) return { spec: {}, kind: opt.kind, condition: opt.condition, error: c.error };
  return { spec: c.moveSpec, kind: opt.kind, condition: opt.condition };
}


// ---------- direction helpers ----------

const DIR_OFFSETS: Record<Exclude<StepDirAbs, "any-orth" | "any-diag" | "any-8">, Offset> = {
  N:  { dr: -1, dc:  0 },
  NE: { dr: -1, dc:  1 },
  E:  { dr:  0, dc:  1 },
  SE: { dr:  1, dc:  1 },
  S:  { dr:  1, dc:  0 },
  SW: { dr:  1, dc: -1 },
  W:  { dr:  0, dc: -1 },
  NW: { dr: -1, dc: -1 },
};

const ORTH: Offset[] = [DIR_OFFSETS.N, DIR_OFFSETS.E, DIR_OFFSETS.S, DIR_OFFSETS.W];
const DIAG: Offset[] = [DIR_OFFSETS.NE, DIR_OFFSETS.SE, DIR_OFFSETS.SW, DIR_OFFSETS.NW];
const ALL8: Offset[] = [...ORTH, ...DIAG];

function absDirOffsets(d: StepDirAbs): Offset[] {
  if (d === "any-orth") return ORTH;
  if (d === "any-diag") return DIAG;
  if (d === "any-8") return ALL8;
  return [DIR_OFFSETS[d]];
}

function rotate(o: Offset, quarter: 1 | -1): Offset {
  // 90° rotation in screen coords: (dr,dc) -> (dc, -dr) for CW
  return quarter === 1 ? { dr: o.dc, dc: -o.dr } : { dr: -o.dc, dc: o.dr };
}

function relDirOffsets(prev: Offset, rel: StepDirRel): Offset[] {
  switch (rel) {
    case "same":      return [prev];
    case "perp-cw":   return [rotate(prev, 1)];
    case "perp-ccw":  return [rotate(prev, -1)];
    case "any-perp":  return [rotate(prev, 1), rotate(prev, -1)];
  }
}

function offsetKey(o: Offset) { return `${o.dr},${o.dc}`; }

// ---------- compiler ----------

/**
 * Compile a chain of MoveSteps into a MovementSpec.
 * - One step, unlimited distance, no jump   -> slide direction(s)
 * - Otherwise                                -> precomputed leap endpoints
 *   (path validation is left to the runtime; for v1 we require either a
 *    single step or all steps to be jumping so we don't have to track
 *    intermediate blockers).
 */
export function compileMovement(steps: MoveStep[]): CompiledMovement {
  if (!steps.length) return { moveSpec: {}, error: "Add at least one movement step." };

  // First step must be absolute.
  if (steps[0].direction.kind !== "absolute") {
    return { moveSpec: {}, error: "The first step must be an absolute direction." };
  }

  // The capture-on-landing rule comes from the LAST step (which determines
  // the endpoint). For single-step pieces that's the only step.
  const lastCaptures = steps[steps.length - 1].captures;

  // --- single-step shortcut: slide or leap ---
  if (steps.length === 1) {
    const s = steps[0];
    if (s.direction.kind !== "absolute") {
      return { moveSpec: {}, error: "The first step must be an absolute direction." };
    }
    const dirs = absDirOffsets(s.direction.dir);
    let moveSpec: MovementSpec;
    if (s.distance === "unlimited" && !s.jumps) {
      const slides: SlideDir[] = dirs.map((d) => ({ dr: d.dr, dc: d.dc }));
      moveSpec = { slides };
    } else if (typeof s.distance === "number" && s.distance > 1 && !s.jumps) {
      const slides: SlideDir[] = dirs.map((d) => ({ dr: d.dr, dc: d.dc, max: s.distance as number }));
      moveSpec = { slides };
    } else {
      const dist = s.distance === "unlimited" ? 1 : s.distance;
      const leaps: Offset[] = dirs.map((d) => ({ dr: d.dr * dist, dc: d.dc * dist }));
      moveSpec = { leaps: dedupeOffsets(leaps) };
    }
    return lastCaptures ? { moveSpec } : { moveSpec, captureSpec: {} };
  }

  // --- multi-step: enumerate endpoints. Require all jumps. ---
  for (const s of steps) {
    if (!s.jumps) {
      return {
        moveSpec: {},
        error: "Multi-step movement: every step must be marked 'jumps over pieces'.",
      };
    }
    if (s.distance === "unlimited") {
      return {
        moveSpec: {},
        error: "Multi-step movement: unlimited distance is only allowed on a single step.",
      };
    }
  }

  // DFS enumerate. Track endpoint (dr,dc) and the previous direction unit.
  const endpoints = new Map<string, Offset>();

  function walk(stepIdx: number, dr: number, dc: number, prev: Offset | null) {
    if (stepIdx === steps.length) {
      if (dr === 0 && dc === 0) return; // ignore zero-net moves
      endpoints.set(offsetKey({ dr, dc }), { dr, dc });
      return;
    }
    const step = steps[stepIdx];
    const dist = step.distance as number;
    const dirSpec = step.direction;
    let dirs: Offset[];
    if (dirSpec.kind === "absolute") {
      dirs = absDirOffsets(dirSpec.dir);
    } else {
      if (!prev) return;
      dirs = relDirOffsets(prev, dirSpec.rel);
    }
    for (const d of dirs) {
      walk(stepIdx + 1, dr + d.dr * dist, dc + d.dc * dist, d);
    }
  }

  walk(0, 0, 0, null);
  if (endpoints.size === 0) {
    return { moveSpec: {}, error: "Movement produced no reachable squares." };
  }
  const moveSpec: MovementSpec = { leaps: Array.from(endpoints.values()) };
  return lastCaptures ? { moveSpec } : { moveSpec, captureSpec: {} };
}

/** Compile a ranged attack picker into a MovementSpec of leap offsets. */
export function compileRangedAttack(r: RangedAttack): { spec: MovementSpec; error?: string } {
  if (!r.enabled) return { spec: {} };
  const min = Math.max(1, Math.min(4, Math.floor(r.minDistance)));
  const max = Math.max(min, Math.min(4, Math.floor(r.maxDistance)));
  const dirs = absDirOffsets(r.direction);
  const leaps: Offset[] = [];
  for (const d of dirs) {
    for (let k = min; k <= max; k++) {
      leaps.push({ dr: d.dr * k, dc: d.dc * k });
    }
  }
  const deduped = dedupeOffsets(leaps);
  if (deduped.length === 0) return { spec: {}, error: "Ranged attack has no targets." };
  return { spec: { leaps: deduped } };
}

function dedupeOffsets(list: Offset[]): Offset[] {
  const seen = new Set<string>();
  const out: Offset[] = [];
  for (const o of list) {
    if (o.dr === 0 && o.dc === 0) continue;
    const k = offsetKey(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

// ---------- helpers for UI ----------

export const ABSOLUTE_DIR_OPTIONS: { value: StepDirAbs; label: string }[] = [
  { value: "any-orth", label: "Any orthogonal (N/E/S/W)" },
  { value: "any-diag", label: "Any diagonal" },
  { value: "any-8",    label: "Any of 8 directions" },
  { value: "N",  label: "North" },
  { value: "NE", label: "North-east" },
  { value: "E",  label: "East" },
  { value: "SE", label: "South-east" },
  { value: "S",  label: "South" },
  { value: "SW", label: "South-west" },
  { value: "W",  label: "West" },
  { value: "NW", label: "North-west" },
];

export const RELATIVE_DIR_OPTIONS: { value: StepDirRel; label: string }[] = [
  { value: "same",     label: "Continue same direction" },
  { value: "perp-cw",  label: "Turn 90° clockwise" },
  { value: "perp-ccw", label: "Turn 90° counter-clockwise" },
  { value: "any-perp", label: "Turn 90° either way" },
];

export const RANGED_TIMING_OPTIONS: { value: RangedTiming; label: string; hint: string }[] = [
  { value: "replace", label: "Instead of movement", hint: "The piece skips its move and fires from where it stands." },
  { value: "before",  label: "Before its movement",  hint: "Fires, then optionally moves on the same turn." },
  { value: "after",   label: "After its movement",   hint: "Moves first, then fires from the landing square." },
];

export function defaultStep(): MoveStep {
  return {
    direction: { kind: "absolute", dir: "any-8" },
    distance: 1,
    jumps: false,
    captures: true,
  };
}

export function defaultOption(kind: MoveOptionKind = "move-or-capture"): MoveOption {
  return { steps: [defaultStep()], kind, condition: "none" };
}

export const OPTION_KIND_OPTIONS: { value: MoveOptionKind; label: string; hint: string }[] = [
  { value: "move-or-capture", label: "Move or capture", hint: "Standard — the piece moves there or captures whatever is there." },
  { value: "move-only",       label: "Move only",       hint: "Cannot capture on this option (pawn-style forward push)." },
  { value: "capture-only",    label: "Capture only",    hint: "Only legal when an enemy is on the destination (pawn-style diagonal)." },
];

export const CONDITION_OPTIONS: { value: MoveCondition; label: string }[] = [
  { value: "none",                 label: "Always available" },
  { value: "from-starting-square", label: "Only from starting square" },
];

export function defaultRangedAttack(): RangedAttack {
  return {
    enabled: false,
    direction: "any-diag",
    minDistance: 2,
    maxDistance: 3,
    timing: "replace",
  };
}

