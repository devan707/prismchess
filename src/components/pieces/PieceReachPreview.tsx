import { useMemo } from "react";
import { compileMovement, type MoveStep } from "@/game/customMovement";

interface Props {
  steps: MoveStep[];
  size?: number; // grid dimension
}

/** Mini board that highlights every square the compiled piece can reach
 *  from a center cell. Green = leap landing, blue = slider ray. */
export function PieceReachPreview({ steps, size = 9 }: Props) {
  const { spec, error } = useMemo(() => compileMovement(steps), [steps]);
  const center = Math.floor(size / 2);

  // Build a reach map.
  const map = useMemo(() => {
    const m = new Map<string, "leap" | "slide">();
    for (const o of spec.leaps ?? []) {
      const r = center + o.dr, c = center + o.dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      m.set(`${r},${c}`, "leap");
    }
    for (const d of spec.slides ?? []) {
      const max = d.max && d.max > 0 ? d.max : size;
      let r = center + d.dr, c = center + d.dc, n = 0;
      while (r >= 0 && r < size && c >= 0 && c < size && n < max) {
        m.set(`${r},${c}`, "slide");
        r += d.dr; c += d.dc; n++;
      }
    }
    return m;
  }, [spec, center, size]);

  return (
    <div className="space-y-1">
      <div
        className="grid border border-border rounded-sm overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, width: 200, height: 200 }}
      >
        {Array.from({ length: size * size }).map((_, i) => {
          const r = Math.floor(i / size), c = i % size;
          const isDark = (r + c) % 2 === 1;
          const isCenter = r === center && c === center;
          const kind = map.get(`${r},${c}`);
          return (
            <div
              key={i}
              className="relative flex items-center justify-center"
              style={{
                background: isDark ? "rgb(120 113 108 / 0.35)" : "rgb(245 245 244 / 0.6)",
              }}
            >
              {isCenter && <span className="text-base">●</span>}
              {!isCenter && kind === "leap" && <span className="block w-2 h-2 rounded-full bg-emerald-500" />}
              {!isCenter && kind === "slide" && <span className="block w-2 h-2 rounded-full bg-sky-500" />}
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          ● = piece · <span className="text-emerald-600">green</span> leap · <span className="text-sky-600">blue</span> slide
        </p>
      )}
    </div>
  );
}
