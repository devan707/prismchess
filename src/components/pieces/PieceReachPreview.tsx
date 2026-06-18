import { useMemo } from "react";
import { compileMovement, type MoveStep } from "@/game/customMovement";
import type { MovementSpec } from "@/game/types";

interface Props {
  steps: MoveStep[];
  /** Optional ranged-attack squares (relative offsets from center). */
  rangedSpec?: MovementSpec;
  size?: number; // grid dimension
}

/** Mini board that highlights every square the compiled piece can reach
 *  from a center cell. Green = leap landing (move + capture by default),
 *  blue = slider ray, orange = ranged-only capture (piece stays put). */
export function PieceReachPreview({ steps, rangedSpec, size = 9 }: Props) {
  const { moveSpec, captureSpec, error } = useMemo(() => compileMovement(steps), [steps]);
  const center = Math.floor(size / 2);

  // Build a reach map.
  const map = useMemo(() => {
    const m = new Map<string, "leap" | "slide" | "move-only" | "ranged">();
    for (const o of moveSpec.leaps ?? []) {
      const r = center + o.dr, c = center + o.dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      // If captureSpec is explicitly empty, this is a move-only square.
      const captureOnly = captureSpec && (captureSpec.leaps?.length ?? 0) === 0 && (captureSpec.slides?.length ?? 0) === 0;
      m.set(`${r},${c}`, captureOnly ? "move-only" : "leap");
    }
    for (const d of moveSpec.slides ?? []) {
      const max = d.max && d.max > 0 ? d.max : size;
      let r = center + d.dr, c = center + d.dc, n = 0;
      while (r >= 0 && r < size && c >= 0 && c < size && n < max) {
        m.set(`${r},${c}`, "slide");
        r += d.dr; c += d.dc; n++;
      }
    }
    for (const o of rangedSpec?.leaps ?? []) {
      const r = center + o.dr, c = center + o.dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      // Ranged overlays movement marker.
      m.set(`${r},${c}`, "ranged");
    }
    return m;
  }, [moveSpec, captureSpec, rangedSpec, center, size]);

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
          const kind = map.get(`${r},${c}`);
          return (
            <div
              key={i}
              className="relative flex items-center justify-center aspect-square"
              style={{
                background: isDark ? "rgb(120 113 108 / 0.35)" : "rgb(245 245 244 / 0.6)",
              }}
            >
              {isCenter && <span className="text-base leading-none">●</span>}
              {!isCenter && kind === "leap" && <span className="block w-2 h-2 rounded-full bg-emerald-500" />}
              {!isCenter && kind === "move-only" && <span className="block w-2 h-2 rounded-full border-2 border-emerald-500 bg-transparent" />}
              {!isCenter && kind === "slide" && <span className="block w-2 h-2 rounded-full bg-sky-500" />}
              {!isCenter && kind === "ranged" && <span className="block w-2 h-2 rounded-full bg-orange-500" />}
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">
          ● piece · <span className="text-emerald-600">green</span> move/capture
          {" · "}<span className="text-sky-600">blue</span> slide
          {rangedSpec && (rangedSpec.leaps?.length ?? 0) > 0 && (<> · <span className="text-orange-600">orange</span> ranged</>)}
        </p>
      )}
    </div>
  );
}
