import { useMemo } from "react";
import { compileOption, type MoveOption } from "@/game/customMovement";
import type { MovementSpec, PieceDef } from "@/game/types";

interface Props {
  /** Preferred: pass the full def so legacy built-ins (movement/capture
   *  MovementSpec) and v2 options-based pieces both render. */
  def?: PieceDef;
  /** Back-compat: explicit options (v2 movement). */
  options?: MoveOption[];
  /** Optional ranged-attack squares (relative offsets from center). */
  rangedSpec?: MovementSpec;
  size?: number; // grid dimension
}

type Marker =
  | "move-capture"
  | "move-only"
  | "capture-only"
  | "slide"
  | "slide-move-only"
  | "slide-capture-only"
  | "ranged";

/** Mini board that highlights every square the compiled piece can reach
 *  from a center cell. */
const KING_OFFSETS = [
  { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },                      { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },  { dr: 1, dc: 0 },  { dr: 1, dc: 1 },
];
const KNIGHT_OFFSETS = [
  { dr: -2, dc: -1 }, { dr: -2, dc: 1 }, { dr: -1, dc: -2 }, { dr: -1, dc: 2 },
  { dr: 1, dc: -2 },  { dr: 1, dc: 2 },  { dr: 2, dc: -1 },  { dr: 2, dc: 1 },
];

/** Synthesize movement specs for pieces whose behavior lives in code
 *  (driven by `special: "..."`). Returns null when the piece has no
 *  `special` field or when its existing movement spec is sufficient. */
function specsForSpecial(def?: PieceDef): {
  movement?: MovementSpec;
  capture?: MovementSpec;
  ranged?: MovementSpec;
} | undefined {
  if (!def?.special) return undefined;
  // dr = -1 means "forward" (toward the opponent) from the white perspective.
  switch (def.special) {
    case "pawn":
    case "shapeshifter":
      return {
        movement: { leaps: [{ dr: -1, dc: 0 }, { dr: -2, dc: 0 }] },
        capture: { leaps: [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }] },
      };
    case "juggernaut":
      return {
        movement: {
          leaps: [{ dr: 0, dc: -1 }, { dr: 0, dc: 1 }],
          slides: [{ dr: -1, dc: 0, max: 5 }],
        },
      };
    case "archer":
      // Adjacent king-step squares can move OR capture; the 2-step orthogonal
      // squares are move-only (no melee capture there).
      return {
        movement: {
          leaps: [
            ...KING_OFFSETS,
            { dr: -2, dc: 0 }, { dr: 2, dc: 0 },
            { dr: 0, dc: -2 }, { dr: 0, dc: 2 },
          ],
        },
        capture: { leaps: [...KING_OFFSETS] },
        ranged: {
          leaps: [
            { dr: -2, dc: -2 }, { dr: -2, dc: 2 }, { dr: 2, dc: -2 }, { dr: 2, dc: 2 },
            { dr: -3, dc: -3 }, { dr: -3, dc: 3 }, { dr: 3, dc: -3 }, { dr: 3, dc: 3 },
          ],
        },
      };
    case "dragon":
      return {
        movement: { leaps: KING_OFFSETS },
        ranged: {
          leaps: [
            { dr: -2, dc: 0 }, { dr: 2, dc: 0 }, { dr: 0, dc: -2 }, { dr: 0, dc: 2 },
            { dr: -2, dc: -2 }, { dr: -2, dc: 2 }, { dr: 2, dc: -2 }, { dr: 2, dc: 2 },
          ],
        },
      };
    case "assassin":
      // Lands exactly 2 or 3 king-steps away (not adjacent). Approximate the
      // reachable squares as everything within a Chebyshev distance of 2 or 3.
      return {
        movement: {
          leaps: (() => {
            const arr: { dr: number; dc: number }[] = [];
            for (let dr = -3; dr <= 3; dr++)
              for (let dc = -3; dc <= 3; dc++) {
                const d = Math.max(Math.abs(dr), Math.abs(dc));
                if (d === 2 || d === 3) arr.push({ dr, dc });
              }
            return arr;
          })(),
        },
      };
    case "wizard":
      return {
        movement: {
          slides: [
            { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
            // Orthogonal "color-bound" slides — shown as ordinary slides; the
            // color restriction is documented in the description.
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
          ],
        },
      };
    case "shadowKnight":
      return { movement: { leaps: KNIGHT_OFFSETS } };
    case "twinTower":
      return {
        movement: {
          slides: [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
          ],
        },
      };
    case "necromancer":
    case "portal":
    case "prism":
    default:
      return undefined;
  }
}

export function PieceReachPreview({ def, options, rangedSpec, size = 9 }: Props) {
  const center = Math.floor(size / 2);

  // Resolve the effective options / specs from either source.
  const effOptions: MoveOption[] = options ?? def?.options ?? [];
  const special = specsForSpecial(def);
  const effRanged: MovementSpec | undefined =
    rangedSpec ?? def?.rangedCapture?.spec ?? special?.ranged;
  // Legacy specs only apply when no v2 options are provided.
  const legacyMovement: MovementSpec | undefined =
    effOptions.length === 0 ? (def?.movement ?? special?.movement) : undefined;
  const legacyCapture: MovementSpec | undefined =
    effOptions.length === 0 ? (def?.capture ?? special?.capture) : undefined;

  const { map, conditional, error } = useMemo(() => {
    const m = new Map<string, Marker>();
    const cond = new Set<string>();
    let firstError: string | undefined;

    const put = (key: string, marker: Marker, isCond: boolean) => {
      const prev = m.get(key);
      if (!prev) m.set(key, marker);
      else if (prev === "move-only" && marker === "capture-only") m.set(key, "move-capture");
      else if (prev === "capture-only" && marker === "move-only") m.set(key, "move-capture");
      else if (prev === "slide-move-only" && marker === "slide-capture-only") m.set(key, "slide");
      else if (prev === "slide-capture-only" && marker === "slide-move-only") m.set(key, "slide");
      else if (marker === "move-capture") m.set(key, "move-capture");
      else if (marker === "slide") m.set(key, "slide");
      if (isCond) cond.add(key);
      else cond.delete(key);
    };

    // v2 options path
    for (const opt of effOptions) {
      const c = compileOption(opt);
      if (c.error) { firstError ??= c.error; continue; }
      const isCond = opt.condition !== "none";
      const leapMarker: Marker =
        opt.kind === "move-only" ? "move-only"
        : opt.kind === "capture-only" ? "capture-only"
        : "move-capture";
      const slideMarker: Marker =
        opt.kind === "move-only" ? "slide-move-only"
        : opt.kind === "capture-only" ? "slide-capture-only"
        : "slide";
      for (const o of c.spec.leaps ?? []) {
        const r = center + o.dr, cc = center + o.dc;
        if (r < 0 || r >= size || cc < 0 || cc >= size) continue;
        put(`${r},${cc}`, leapMarker, isCond);
      }
      for (const d of c.spec.slides ?? []) {
        const max = d.max && d.max > 0 ? d.max : size;
        let r = center + d.dr, cc = center + d.dc, n = 0;
        while (r >= 0 && r < size && cc >= 0 && cc < size && n < max) {
          put(`${r},${cc}`, slideMarker, isCond);
          r += d.dr; cc += d.dc; n++;
        }
      }
    }

    // Legacy MovementSpec path (built-in pieces: rook, queen, knight, etc.)
    const renderLegacySpec = (spec: MovementSpec, leapMarker: Marker, slideMarker: Marker) => {
      for (const o of spec.leaps ?? []) {
        const r = center + o.dr, cc = center + o.dc;
        if (r < 0 || r >= size || cc < 0 || cc >= size) continue;
        put(`${r},${cc}`, leapMarker, false);
      }
      for (const d of spec.slides ?? []) {
        const max = d.max && d.max > 0 ? d.max : size;
        let r = center + d.dr, cc = center + d.dc, n = 0;
        while (r >= 0 && r < size && cc >= 0 && cc < size && n < max) {
          put(`${r},${cc}`, slideMarker, false);
          r += d.dr; cc += d.dc; n++;
        }
      }
    };
    if (legacyMovement && legacyCapture) {
      // Distinct move-only + capture-only patterns (e.g. pawn).
      renderLegacySpec(legacyMovement, "move-only", "slide-move-only");
      renderLegacySpec(legacyCapture, "capture-only", "slide-capture-only");
    } else if (legacyMovement) {
      // Combined move + capture pattern (most pieces).
      renderLegacySpec(legacyMovement, "move-capture", "slide");
    }

    // Ranged attacks
    for (const o of effRanged?.leaps ?? []) {
      const r = center + o.dr, cc = center + o.dc;
      if (r < 0 || r >= size || cc < 0 || cc >= size) continue;
      m.set(`${r},${cc}`, "ranged");
    }
    return { map: m, conditional: cond, error: firstError };
  }, [effOptions, effRanged, legacyMovement, legacyCapture, center, size]);

  const dot = (marker: Marker | undefined, isCond: boolean) => {
    if (!marker) return null;
    const ring = isCond ? "ring-2 ring-amber-400/70 ring-offset-1 ring-offset-transparent" : "";
    switch (marker) {
      case "move-capture":
        return <span className={`block w-2 h-2 rounded-full bg-emerald-500 ${ring}`} />;
      case "move-only":
        return <span className={`block w-2 h-2 rounded-full border-2 border-emerald-500 bg-transparent ${ring}`} />;
      case "capture-only":
        return <span className={`block w-2 h-2 rounded-full bg-red-500 ${ring}`} />;
      case "slide":
        return <span className={`block w-2 h-2 rounded-full bg-sky-500 ${ring}`} />;
      case "slide-move-only":
        return <span className={`block w-2 h-2 rounded-full border-2 border-sky-500 bg-transparent ${ring}`} />;
      case "slide-capture-only":
        return <span className={`block w-2 h-2 rounded-full bg-red-500/80 border border-sky-500 ${ring}`} />;
      case "ranged":
        return (
          <span className="relative block w-3 h-3 rounded-full border-2 border-orange-500">
            <span className="absolute inset-0 m-auto w-[3px] h-[3px] rounded-full bg-orange-500" />
          </span>
        );
    }
  };

  return (
    <div className="space-y-1">
      <div
        className="grid border border-border rounded-sm overflow-hidden w-full max-w-[220px] aspect-square"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {Array.from({ length: size * size }).map((_, i) => {
          const r = Math.floor(i / size), c = i % size;
          const isDark = (r + c) % 2 === 1;
          const isCenter = r === center && c === center;
          const key = `${r},${c}`;
          const kind = map.get(key);
          const isCond = conditional.has(key);
          return (
            <div
              key={i}
              className="relative flex items-center justify-center aspect-square"
              style={{ background: isDark ? "rgb(120 113 108 / 0.35)" : "rgb(245 245 244 / 0.6)" }}
            >
              {isCenter && <span className="text-base leading-none">●</span>}
              {!isCenter && dot(kind, isCond)}
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">
          ● piece · <span className="text-emerald-600">●</span> move/cap ·{" "}
          <span className="text-emerald-600">○</span> move only ·{" "}
          <span className="text-red-600">●</span> capture only ·{" "}
          <span className="text-sky-600">●</span> slide
          {effRanged && (effRanged.leaps?.length ?? 0) > 0 && (<> · <span className="text-orange-600">◎</span> ranged</>)}
          {" · "}<span className="text-amber-600">ring</span> = conditional
        </p>
      )}
    </div>
  );
}
