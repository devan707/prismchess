import { useMemo } from "react";
import { compileOption, type MoveOption } from "@/game/customMovement";
import type { MovementSpec } from "@/game/types";

interface Props {
  options: MoveOption[];
  /** Optional ranged-attack squares (relative offsets from center). */
  rangedSpec?: MovementSpec;
  size?: number; // grid dimension
}

type Marker =
  | "move-capture"
  | "move-only"
  | "capture-only"
  | "slide"
  | "ranged";

/** Mini board that highlights every square the compiled piece can reach
 *  from a center cell. */
export function PieceReachPreview({ options, rangedSpec, size = 9 }: Props) {
  const center = Math.floor(size / 2);

  const { map, conditional, error } = useMemo(() => {
    const m = new Map<string, Marker>();
    const cond = new Set<string>(); // squares only reachable conditionally
    let firstError: string | undefined;

    const put = (key: string, marker: Marker, isCond: boolean) => {
      // Promote rules: move-capture > move-only / capture-only ; slide stays slide.
      const prev = m.get(key);
      if (!prev) m.set(key, marker);
      else if (prev === "move-only" && marker === "capture-only") m.set(key, "move-capture");
      else if (prev === "capture-only" && marker === "move-only") m.set(key, "move-capture");
      else if (marker === "move-capture") m.set(key, "move-capture");
      if (isCond) cond.add(key);
      else cond.delete(key);
    };

    for (const opt of options) {
      const c = compileOption(opt);
      if (c.error) { firstError ??= c.error; continue; }
      const isCond = opt.condition !== "none";
      const baseMarker: Marker =
        opt.kind === "move-only" ? "move-only"
        : opt.kind === "capture-only" ? "capture-only"
        : "move-capture";
      for (const o of c.spec.leaps ?? []) {
        const r = center + o.dr, cc = center + o.dc;
        if (r < 0 || r >= size || cc < 0 || cc >= size) continue;
        put(`${r},${cc}`, baseMarker, isCond);
      }
      for (const d of c.spec.slides ?? []) {
        const max = d.max && d.max > 0 ? d.max : size;
        let r = center + d.dr, cc = center + d.dc, n = 0;
        while (r >= 0 && r < size && cc >= 0 && cc < size && n < max) {
          put(`${r},${cc}`, "slide", isCond);
          r += d.dr; cc += d.dc; n++;
        }
      }
    }
    for (const o of rangedSpec?.leaps ?? []) {
      const r = center + o.dr, cc = center + o.dc;
      if (r < 0 || r >= size || cc < 0 || cc >= size) continue;
      m.set(`${r},${cc}`, "ranged");
    }
    return { map: m, conditional: cond, error: firstError };
  }, [options, rangedSpec, center, size]);

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
      case "ranged":
        // Crosshair: outer ring + center dot, distinct from solid move/capture dots.
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
          {rangedSpec && (rangedSpec.leaps?.length ?? 0) > 0 && (<> · <span className="text-orange-600">◎</span> ranged</>)}
          {" · "}<span className="text-amber-600">ring</span> = conditional
        </p>
      )}
    </div>
  );
}
